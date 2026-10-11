const { query } = require('../db');
const { enqueuePushNotification } = require('../utils/fcm');
const { getReengagementCopy } = require('../config/reengagementCopy');

// Nudge priority order — first qualifying nudge per user wins the daily slot.
// Lower index = higher priority.
const NUDGE_PRIORITY = [
  'low_mood_streak',
  'bad_mood_followup',
  'unmatched_request',
  'session_followup_peer',
  'session_followup_therapy',
  'streak_reminder',
  'streak_broken',
  'credit_zero',
  'credit_low',
  'journal_prompt_reengagement',
  'ai_dormant',
  'no_safety_plan',
  'therapist_upsell',
  'dormant_nudge',
];

// Returns true if user already received a re-engagement push in the last 24h.
async function hasRecentPush(userId) {
  const { rows } = await query(
    `SELECT last_reengagement_push_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]?.last_reengagement_push_at) return false;
  const age = Date.now() - new Date(rows[0].last_reengagement_push_at).getTime();
  return age < 24 * 60 * 60 * 1000;
}

async function markPushSent(userId) {
  await query(
    `UPDATE users SET last_reengagement_push_at = NOW() WHERE id = $1`,
    [userId]
  );
}

async function sendNudge(user, type, notifType, vars = {}, route = '/mood') {
  const copy = getReengagementCopy(type, vars);
  if (!copy) return;

  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'push')`,
    [user.id, notifType, JSON.stringify({ message: copy.body, route })]
  );

  if (user.fcm_token) {
    await enqueuePushNotification(user.fcm_token, copy.title, copy.body, {
      type: notifType,
      route,
    });
  }

  await markPushSent(user.id);
}

// ─── Individual nudge evaluators ─────────────────────────────────────────────

// 3 or more consecutive days of low/very_low mood
async function checkLowMoodStreak(user) {
  const { rows } = await query(
    `SELECT DATE(created_at AT TIME ZONE 'Africa/Nairobi') AS day, mood_level
     FROM moods
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [user.id]
  );
  let streak = 0;
  let lastDay = null;
  for (const row of rows) {
    const day = row.day;
    if (lastDay && (new Date(lastDay) - new Date(day)) / 86400000 > 1) break;
    if (['low', 'very_low'].includes(row.mood_level)) { streak++; lastDay = day; }
    else break;
  }
  return streak >= 3;
}

// Low/very_low mood logged 6–12h ago with no subsequent mood, peer, or AI session
async function checkBadMoodFollowup(user) {
  const { rows } = await query(
    `SELECT id, created_at FROM moods
     WHERE user_id = $1
       AND mood_level IN ('low', 'very_low')
       AND created_at BETWEEN NOW() - INTERVAL '12 hours' AND NOW() - INTERVAL '6 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return false;

  const moodAt = rows[0].created_at;

  // Skip if another mood was logged since
  const { rows: laterMoods } = await query(
    `SELECT 1 FROM moods WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterMoods.length) return false;

  // Skip if a peer or AI session started since
  const { rows: laterSessions } = await query(
    `SELECT 1 FROM sessions
     WHERE (user_a_id = $1 OR user_b_id = $1)
       AND created_at > $2
     LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterSessions.length) return false;

  const { rows: laterAI } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterAI.length) return false;

  return true;
}

// Peer request went unmatched in last 24h
async function checkUnmatchedRequest(user) {
  const { rows } = await query(
    `SELECT 1 FROM peer_requests
     WHERE user_id = $1
       AND status = 'closed'
       AND session_id IS NULL
       AND updated_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [user.id]
  );
  return rows.length > 0;
}

// Peer session ended 20–28h ago (so 24h nudge fires in a reasonable window)
async function checkPeerSessionFollowup(user) {
  const { rows } = await query(
    `SELECT 1 FROM sessions s
     WHERE (s.user_a_id = $1 OR s.user_b_id = $1)
       AND s.status = 'ended'
       AND s.ended_at BETWEEN NOW() - INTERVAL '28 hours' AND NOW() - INTERVAL '20 hours'
     LIMIT 1`,
    [user.id]
  );
  // Also make sure we haven't already sent a followup for this session today
  if (!rows.length) return false;
  const { rows: already } = await query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'session_followup_peer'
       AND created_at > NOW() - INTERVAL '26 hours'
     LIMIT 1`,
    [user.id]
  );
  return !already.length;
}

// Therapy session ended 44–52h ago
async function checkTherapySessionFollowup(user) {
  const { rows } = await query(
    `SELECT 1 FROM therapy_sessions ts
     WHERE ts.member_id = $1
       AND ts.status = 'completed'
       AND ts.ended_at BETWEEN NOW() - INTERVAL '52 hours' AND NOW() - INTERVAL '44 hours'
     LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return false;
  const { rows: already } = await query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'session_followup_therapy'
       AND created_at > NOW() - INTERVAL '50 hours'
     LIMIT 1`,
    [user.id]
  );
  return !already.length;
}

// Has streak but no check-in yet today (EAT)
async function checkStreakAtRisk(user) {
  if (!user.streak_count || user.streak_count < 1) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(todayStart.getUTCHours() - 3); // rough EAT offset
  todayStart.setUTCHours(Math.floor(todayStart.getUTCHours() / 24) * 24, 0, 0, 0);
  const { rows } = await query(
    `SELECT 1 FROM moods WHERE user_id = $1 AND created_at >= $2 LIMIT 1`,
    [user.id, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))]
  );
  // Simpler: just check if last mood was today
  const { rows: todayMood } = await query(
    `SELECT 1 FROM moods
     WHERE user_id = $1
       AND created_at >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date
     LIMIT 1`,
    [user.id]
  );
  return !todayMood.length;
}

// Streak was > 0 yesterday but is now 0 (broken)
async function checkStreakBroken(user) {
  if (user.streak_count !== 0) return false;
  const { rows } = await query(
    `SELECT 1 FROM moods
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '48 hours'
       AND created_at < NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [user.id]
  );
  return rows.length > 0;
}

// Credit balance
function checkCreditZero(user) { return user.credit_balance === 0; }
function checkCreditLow(user) { return user.credit_balance === 1; }

// No journal entry in 7 days
async function checkJournalDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM journals WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

// No AI interaction in 14 days
async function checkAIDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

// No safety plan after 14+ days on platform
async function checkNoSafetyPlan(user) {
  const accountAge = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (accountAge < 14) return false;
  const { rows } = await query(
    `SELECT 1 FROM safety_plans WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

// 3+ peer sessions, never booked therapy — fires at most once (check notifications table)
async function checkTherapistUpsell(user) {
  const { rows: sessions } = await query(
    `SELECT COUNT(*) AS cnt FROM sessions
     WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'ended'`,
    [user.id]
  );
  if (parseInt(sessions[0].cnt) < 3) return false;

  const { rows: booked } = await query(
    `SELECT 1 FROM therapy_sessions WHERE member_id = $1 LIMIT 1`,
    [user.id]
  );
  if (booked.length) return false;

  const { rows: already } = await query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'therapist_upsell' LIMIT 1`,
    [user.id]
  );
  return !already.length;
}

// Dormant — no check-in in 3+ days
function checkDormant(user) {
  if (!user.last_mood_at) return true;
  const age = (Date.now() - new Date(user.last_mood_at).getTime()) / 86400000;
  return age >= 3;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function runReengagementJob() {
  // Fetch active members with FCM token and key fields
  const { rows: users } = await query(
    `SELECT u.id, u.fcm_token, u.streak_count, u.credit_balance, u.created_at,
            u.last_reengagement_push_at,
            MAX(m.created_at) AS last_mood_at
     FROM users u
     LEFT JOIN moods m ON m.user_id = u.id
     WHERE u.is_active = true
       AND u.role = 'member'
       AND u.fcm_token IS NOT NULL
     GROUP BY u.id`
  );

  let sent = 0;

  for (const user of users) {
    try {
      if (await hasRecentPush(user.id)) continue;

      // Evaluate each nudge type in priority order
      let fired = false;

      for (const nudge of NUDGE_PRIORITY) {
        if (fired) break;

        switch (nudge) {
          case 'low_mood_streak':
            if (await checkLowMoodStreak(user)) {
              await sendNudge(user, 'low_mood_streak', 'low_mood_streak', {}, '/peer');
              fired = true;
            }
            break;

          case 'bad_mood_followup':
            if (await checkBadMoodFollowup(user)) {
              await sendNudge(user, 'bad_mood_followup', 'bad_mood_followup', {}, '/mood');
              fired = true;
            }
            break;

          case 'unmatched_request':
            if (await checkUnmatchedRequest(user)) {
              await sendNudge(user, 'unmatched_request', 'unmatched_request', {}, '/peer');
              fired = true;
            }
            break;

          case 'session_followup_peer':
            if (await checkPeerSessionFollowup(user)) {
              await sendNudge(user, 'session_followup_peer', 'session_followup_peer', {}, '/mood');
              fired = true;
            }
            break;

          case 'session_followup_therapy':
            if (await checkTherapySessionFollowup(user)) {
              await sendNudge(user, 'session_followup_therapy', 'session_followup_therapy', {}, '/journal');
              fired = true;
            }
            break;

          case 'streak_reminder':
            if (await checkStreakAtRisk(user)) {
              await sendNudge(user, 'streak_reminder', 'streak_reminder', { n: user.streak_count }, '/mood');
              fired = true;
            }
            break;

          case 'streak_broken':
            if (await checkStreakBroken(user)) {
              await sendNudge(user, 'streak_broken', 'streak_broken', {}, '/mood');
              fired = true;
            }
            break;

          case 'credit_zero':
            if (checkCreditZero(user)) {
              await sendNudge(user, 'credit_zero', 'credit_zero', {}, '/credits');
              fired = true;
            }
            break;

          case 'credit_low':
            if (checkCreditLow(user)) {
              await sendNudge(user, 'credit_low', 'credit_low', {}, '/credits');
              fired = true;
            }
            break;

          case 'journal_prompt_reengagement':
            if (await checkJournalDormant(user)) {
              await sendNudge(user, 'dormant_nudge', 'journal_prompt', {}, '/journal');
              fired = true;
            }
            break;

          case 'ai_dormant':
            if (await checkAIDormant(user)) {
              await sendNudge(user, 'ai_dormant', 'ai_dormant', {}, '/ai');
              fired = true;
            }
            break;

          case 'no_safety_plan':
            if (await checkNoSafetyPlan(user)) {
              await sendNudge(user, 'no_safety_plan', 'no_safety_plan', {}, '/safety-plan');
              fired = true;
            }
            break;

          case 'therapist_upsell':
            if (await checkTherapistUpsell(user)) {
              await sendNudge(user, 'therapist_upsell', 'therapist_upsell', {}, '/therapy/browse');
              fired = true;
            }
            break;

          case 'dormant_nudge':
            if (checkDormant(user)) {
              await sendNudge(user, 'dormant_nudge', 'dormant_nudge', {}, '/mood');
              fired = true;
            }
            break;
        }
      }

      if (fired) sent++;
    } catch (err) {
      console.error(`[reengagement] Error processing user ${user.id}:`, err.message);
    }
  }

  console.log(`[reengagement] Sent ${sent} nudges to ${users.length} eligible users`);
}

module.exports = { runReengagementJob };
