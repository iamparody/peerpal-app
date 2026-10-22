const { query } = require('../db');
const logger = require('../utils/logger');

const { enqueuePushNotification } = require('../utils/fcm');
const { getReengagementCopy } = require('../config/reengagementCopy');

// Schema facts (verified against migrations):
// sessions:         user_id, status IN ('active','completed','abandoned'), started_at, ended_at
// therapy_sessions: booking_id → therapist_bookings.member_user_id, ended_at
// credits:          user_id, balance
// peer_requests:    user_id, status, session_id, updated_at
// moods:            user_id, mood_level, created_at
// journals:         user_id, created_at
// ai_interactions:  user_id, created_at
// safety_plans:     user_id
// users:            engagement_segment (healthy/cooling/at_risk/dormant), set by engagementScore nightly job

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// EAT = UTC+3. Quiet hours: 21:00-07:00 EAT (18:00-04:00 UTC)
function isQuietHours() {
  const utcHour = new Date().getUTCHours();
  return utcHour >= 18 || utcHour < 4;
}

function hadRecentPush(user) {
  if (!user.last_reengagement_push_at) return false;
  return (Date.now() - new Date(user.last_reengagement_push_at).getTime()) < 86400000;
}

async function markPushSent(userId, type, chosenTitle) {
  await query(
    `UPDATE users
     SET last_reengagement_push_at = NOW(),
         last_nudge_variant = COALESCE(last_nudge_variant, '{}'::jsonb) || jsonb_build_object($2::text, $3::text)
     WHERE id = $1`,
    [userId, type, chosenTitle]
  );
}

// Returns true if send succeeded, false if duplicate suppressed (23505 unique violation).
async function sendNudge(user, type, notifType, vars = {}, route = '/mood', eventRef = null) {
  const copy = getReengagementCopy(type, vars, user.last_nudge_variant?.[type]);
  if (!copy) return false;

  try {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel, event_ref)
       VALUES ($1, $2, $3, 'push', $4)`,
      [user.id, notifType, JSON.stringify({ message: copy.body, route }), eventRef]
    );
  } catch (err) {
    if (err.code === '23505') {
      logger.info(`[reengagement] duplicate suppressed user=${user.id} type=${notifType} ref=${eventRef}`);
      return false;
    }
    throw err;
  }

  if (user.fcm_token) {
    await enqueuePushNotification(user.fcm_token, copy.title, copy.body, { type: notifType, route });
  }
  await markPushSent(user.id, type, copy.title);
  return true;
}

// ─── Dominant feature detection ───────────────────────────────────────────────
// Returns 'ai' | 'peer' | 'journal' | 'none'

async function getDominantFeature(user) {
  const accountAgeDays = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (accountAgeDays < 7) return 'none';

  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM ai_interactions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days') AS ai_cnt,
       (SELECT COUNT(*) FROM sessions        WHERE user_id = $1 AND started_at > NOW() - INTERVAL '30 days') AS peer_cnt,
       (SELECT COUNT(*) FROM journals        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days') AS journal_cnt`,
    [user.id]
  );
  const ai      = parseInt(rows[0].ai_cnt, 10);
  const peer    = parseInt(rows[0].peer_cnt, 10);
  const journal = parseInt(rows[0].journal_cnt, 10);

  if (ai === 0 && peer === 0 && journal === 0) return 'none';

  if (ai >= peer && ai >= journal)      return 'ai';
  if (peer >= ai && peer >= journal)    return 'peer';
  return 'journal';
}

// ─── Pipeline A evaluators (event-driven, fires for ALL users) ────────────────

async function checkBadMoodFollowup(user) {
  const { rows } = await query(
    `SELECT id, created_at FROM moods
     WHERE user_id = $1
       AND mood_level IN ('low', 'very_low')
       AND created_at BETWEEN NOW() - INTERVAL '12 hours' AND NOW() - INTERVAL '6 hours'
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return null;
  const { id: moodId, created_at: moodAt } = rows[0];

  const { rows: laterMood } = await query(
    `SELECT 1 FROM moods WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterMood.length) return null;

  const { rows: laterSession } = await query(
    `SELECT 1 FROM sessions WHERE user_id = $1 AND started_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterSession.length) return null;

  const { rows: laterAI } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  return laterAI.length ? null : moodId;
}

async function checkUnmatchedRequest(user) {
  const { rows } = await query(
    `SELECT id FROM peer_requests
     WHERE user_id = $1
       AND status = 'closed'
       AND session_id IS NULL
       AND updated_at > NOW() - INTERVAL '24 hours'
     ORDER BY updated_at DESC LIMIT 1`,
    [user.id]
  );
  return rows.length ? rows[0].id : null;
}

async function checkPeerSessionFollowup(user) {
  const { rows } = await query(
    `SELECT id FROM sessions
     WHERE user_id = $1
       AND status = 'completed'
       AND ended_at BETWEEN NOW() - INTERVAL '28 hours' AND NOW() - INTERVAL '20 hours'
     ORDER BY ended_at DESC LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return null;
  const sessionId = rows[0].id;
  const { rows: already } = await query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND event_ref = $2 LIMIT 1`,
    [user.id, `session:${sessionId}`]
  );
  return already.length ? null : sessionId;
}

async function checkTherapySessionFollowup(user) {
  const { rows } = await query(
    `SELECT tb.id AS booking_id FROM therapy_sessions ts
     JOIN therapist_bookings tb ON tb.id = ts.booking_id
     WHERE tb.member_user_id = $1
       AND tb.status = 'completed'
       AND ts.ended_at BETWEEN NOW() - INTERVAL '52 hours' AND NOW() - INTERVAL '44 hours'
     ORDER BY ts.ended_at DESC LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return null;
  const bookingId = rows[0].booking_id;
  const { rows: already } = await query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND event_ref = $2 LIMIT 1`,
    [user.id, `booking:${bookingId}`]
  );
  return already.length ? null : bookingId;
}

async function checkCreditZero(userId) {
  const { rows } = await query(`SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`, [userId]);
  return rows.length && parseInt(rows[0].balance) === 0 ? isoDate() : null;
}

async function checkCreditLow(userId) {
  const { rows } = await query(`SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`, [userId]);
  return rows.length && parseInt(rows[0].balance) === 1 ? isoDate() : null;
}

// ─── Pipeline B evaluators (churn nudges, non-healthy users only) ─────────────

async function checkLowMoodStreak(user) {
  const { rows } = await query(
    `SELECT DATE(created_at AT TIME ZONE 'Africa/Nairobi') AS day, mood_level
     FROM moods WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [user.id]
  );
  let streak = 0;
  let lastDay = null;
  for (const row of rows) {
    if (lastDay && (new Date(lastDay) - new Date(row.day)) / 86400000 > 1) break;
    if (['low', 'very_low'].includes(row.mood_level)) { streak++; lastDay = row.day; }
    else break;
  }
  return streak >= 3 ? isoWeek() : null;
}

async function checkStreakAtRisk(user) {
  if (!user.streak_count || user.streak_count < 1) return null;
  const { rows } = await query(
    `SELECT 1 FROM moods
     WHERE user_id = $1
       AND created_at >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date
     LIMIT 1`,
    [user.id]
  );
  return rows.length ? null : isoWeek();
}

async function checkStreakBroken(user) {
  if (user.streak_count !== 0) return null;
  const { rows } = await query(
    `SELECT 1 FROM moods
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '48 hours'
       AND created_at < NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [user.id]
  );
  return rows.length ? isoWeek() : null;
}

async function checkAIDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`,
    [user.id]
  );
  return rows.length ? null : isoWeek();
}

async function checkNoSafetyPlan(user) {
  const accountAge = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (accountAge < 14) return null;
  const { rows } = await query(`SELECT 1 FROM safety_plans WHERE user_id = $1 LIMIT 1`, [user.id]);
  if (rows.length) return null;
  const week = parseInt(isoWeek().split('-W')[1], 10);
  return week % 2 === 0 ? isoWeek() : null;
}

async function checkTherapistUpsell(user) {
  const { rows: peerSessions } = await query(
    `SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = $1 AND status = 'completed'`,
    [user.id]
  );
  if (parseInt(peerSessions[0].cnt) < 3) return null;
  const { rows: booked } = await query(
    `SELECT 1 FROM therapist_bookings WHERE member_user_id = $1 LIMIT 1`,
    [user.id]
  );
  if (booked.length) return null;
  const { rows: already } = await query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'therapist_upsell' LIMIT 1`,
    [user.id]
  );
  return already.length ? null : 'lifetime';
}

// Dormant win-back: monthly cadence for dormant segment, weekly for cooling/at_risk
function dormantEventRef(segment) {
  return segment === 'dormant' ? `dormant:${isoMonth()}` : `dormant:${isoWeek()}`;
}

// ─── Pipeline F: funnel-step nudges ──────────────────────────────────────────
// Fires when a user is stuck at a specific funnel step. Checked before Pipeline A.

async function runFunnelNudge(user) {
  const now = Date.now();
  const accountAgeMs = now - new Date(user.created_at).getTime();
  const ref = `reengfunnel:${isoDate()}`;

  // Step 1 — persona not yet set, account > 24h old
  if (user.reengagement_step === 'step1_incomplete' && accountAgeMs > 86400000) {
    return sendNudge(user, 'reengagement_step1', 'reengagement_step1', {}, '/onboarding/persona', `${ref}:${user.id}`);
  }

  // Step 2 — onboarding done but no first session, > 24h since onboarding
  if (
    user.reengagement_step === 'step2_incomplete' &&
    user.onboarding_completed_at &&
    now - new Date(user.onboarding_completed_at).getTime() > 86400000
  ) {
    return sendNudge(user, 'reengagement_step2', 'reengagement_step2', {}, '/ai-chat', `${ref}:${user.id}`);
  }

  // Step 3 — first session done but no return in 7 days
  if (
    user.reengagement_step === 'step3_incomplete' &&
    user.first_session_completed_at &&
    now - new Date(user.first_session_completed_at).getTime() > 7 * 86400000
  ) {
    return sendNudge(user, 'reengagement_step3', 'reengagement_step3', {}, '/dashboard', `${ref}:${user.id}`);
  }

  // Purchase nudge — step3, zero credits, has had at least one session
  if (
    user.reengagement_step === 'step3_incomplete' &&
    user.first_session_completed_at &&
    parseInt(user.credits_balance || '0', 10) === 0
  ) {
    return sendNudge(user, 'reengagement_purchase', 'reengagement_purchase', {}, '/credits', `${ref}:${user.id}`);
  }

  return false;
}

// ─── First-call nudge: fires once, 24-48h after signup, zero activity ────────
// Pre-pipeline — checked before Pipeline A or B.

async function checkFirstCallNudge(user) {
  const accountAgeHours = (Date.now() - new Date(user.created_at).getTime()) / 3600000;
  if (accountAgeHours < 24 || accountAgeHours > 48) return null;

  const { rows } = await query(
    `SELECT 1 FROM (
       SELECT user_id FROM moods           WHERE user_id = $1 LIMIT 1
       UNION ALL
       SELECT user_id FROM ai_interactions WHERE user_id = $1 LIMIT 1
       UNION ALL
       SELECT user_id FROM sessions        WHERE user_id = $1 LIMIT 1
     ) t LIMIT 1`,
    [user.id]
  );
  return rows.length === 0 ? user.id : null;
}

// ─── Pipeline A: event-driven, fires for ALL users ────────────────────────────

async function runPipelineA(user) {
  const moodId = await checkBadMoodFollowup(user);
  if (moodId) return sendNudge(user, 'bad_mood_followup', 'bad_mood_followup', {}, '/mood', `mood:${moodId}`);

  const requestId = await checkUnmatchedRequest(user);
  if (requestId) return sendNudge(user, 'unmatched_request', 'unmatched_request', {}, '/peer', `request:${requestId}`);

  const sessionId = await checkPeerSessionFollowup(user);
  if (sessionId) return sendNudge(user, 'session_followup_peer', 'session_followup_peer', {}, '/mood', `session:${sessionId}`);

  const bookingId = await checkTherapySessionFollowup(user);
  if (bookingId) return sendNudge(user, 'session_followup_therapy', 'session_followup_therapy', {}, '/journal', `booking:${bookingId}`);

  const creditZeroRef = await checkCreditZero(user.id);
  if (creditZeroRef) return sendNudge(user, 'credit_zero', 'credit_zero', {}, '/credits', `creditzero:${creditZeroRef}`);

  const creditLowRef = await checkCreditLow(user.id);
  if (creditLowRef) return sendNudge(user, 'credit_low', 'credit_low', {}, '/credits', `creditlow:${creditLowRef}`);

  return false;
}

// ─── Pipeline B: churn nudges, non-healthy users only ────────────────────────

async function runPipelineB(user) {
  const segment  = user.engagement_segment;
  const dominant = await getDominantFeature(user);

  // Dormant segment: win-back only, no feature nudge, no CTA
  if (segment === 'dormant') {
    return sendNudge(user, 'dormant_nudge', 'dormant_nudge', {}, '/mood', dormantEventRef(segment));
  }

  // Low mood streak (cooling/at_risk only — privacy-safe copy)
  const lowMoodRef = await checkLowMoodStreak(user);
  if (lowMoodRef) return sendNudge(user, 'low_mood_streak', 'low_mood_streak', {}, '/peer', `lowmoodstreak:${lowMoodRef}`);

  // Streak signals
  const streakAtRiskRef = await checkStreakAtRisk(user);
  if (streakAtRiskRef) return sendNudge(user, 'streak_reminder', 'streak_reminder', { n: user.streak_count || 0 }, '/mood', `streakremind:${streakAtRiskRef}`);

  const streakBrokenRef = await checkStreakBroken(user);
  if (streakBrokenRef) return sendNudge(user, 'streak_broken', 'streak_broken', {}, '/mood', `streakbreak:${streakBrokenRef}`);

  // Feature-specific nudge based on dominant feature
  if (dominant === 'ai') {
    const aiRef = await checkAIDormant(user);
    if (aiRef) return sendNudge(user, 'ai_dormant', 'ai_dormant', {}, '/ai', `aidormant:${aiRef}`);
  }

  // Safety plan (non-feature-specific, low urgency)
  const safetyRef = await checkNoSafetyPlan(user);
  if (safetyRef) return sendNudge(user, 'no_safety_plan', 'no_safety_plan', {}, '/safety-plan', `safetyplan:${safetyRef}`);

  // Therapist upsell (once ever)
  const upsellRef = await checkTherapistUpsell(user);
  if (upsellRef) return sendNudge(user, 'therapist_upsell', 'therapist_upsell', {}, '/therapy/browse', `therapistupsell:${upsellRef}`);

  // Generic dormant nudge as last resort for cooling/at_risk
  return sendNudge(user, 'dormant_nudge', 'dormant_nudge', {}, '/mood', dormantEventRef(segment));
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function runReengagementJob() {
  if (isQuietHours()) {
    logger.info('[reengagement] quiet hours — skipping run');
    return;
  }

  const { rows: users } = await query(
    `SELECT u.id, u.fcm_token, u.streak_count, u.created_at,
            u.last_reengagement_push_at, u.engagement_segment,
            u.reengagement_step, u.onboarding_completed_at,
            u.first_session_completed_at, u.last_session_at,
            u.last_nudge_variant,
            COALESCE(cr.balance, 0) AS credits_balance,
            MAX(m.created_at) AS last_mood_at
     FROM users u
     LEFT JOIN moods m ON m.user_id = u.id
     LEFT JOIN credits cr ON cr.user_id = u.id
     WHERE u.is_active = true
       AND u.role = 'member'
       AND u.fcm_token IS NOT NULL
     GROUP BY u.id, cr.balance`
  );

  let sent = 0;

  for (const user of users) {
    try {
      if (hadRecentPush(user)) continue;

      // First-call nudge: once only, 24-48h after signup, zero activity — checked first
      // so new users are directed to /peer, not /onboarding/persona
      const firstCallRef = await checkFirstCallNudge(user);
      let fired = firstCallRef
        ? await sendNudge(user, 'first_call_nudge', 'first_call_nudge', {}, '/peer', `firstcall:${user.id}`)
        : false;

      // Pipeline F: funnel-step nudges (step1/step2/step3/purchase)
      if (!fired) fired = await runFunnelNudge(user);

      // Pipeline A: event-driven, all users
      if (!fired) fired = await runPipelineA(user);

      // Pipeline B: churn nudges, non-healthy only
      if (!fired && user.engagement_segment && user.engagement_segment !== 'healthy') {
        fired = await runPipelineB(user);
      }

      if (fired) sent++;
    } catch (err) {
      logger.error(`[reengagement] Error processing user ${user.id}:`, err.message);
    }
  }

  logger.info(`[reengagement] Sent ${sent} nudges to ${users.length} eligible users`);
}

module.exports = { runReengagementJob };
