const { query } = require('../db');
const { enqueuePushNotification } = require('../utils/fcm');
const { getReengagementCopy } = require('../config/reengagementCopy');

// Schema facts (verified against migrations):
// sessions:         user_id, status IN ('active','completed','abandoned'), ended_at
// therapy_sessions: booking_id → therapist_bookings.member_user_id, ended_at (no status/member_id)
// credits:          user_id, balance (separate table — not a column on users)
// peer_requests:    user_id, status='cancelled' (added migration 100), session_id, updated_at
// moods:            user_id, mood_level, created_at
// journals:         user_id, created_at
// ai_interactions:  user_id, created_at
// safety_plans:     user_id

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

function hadRecentPush(user) {
  if (!user.last_reengagement_push_at) return false;
  return (Date.now() - new Date(user.last_reengagement_push_at).getTime()) < 86400000;
}

async function markPushSent(userId) {
  await query(`UPDATE users SET last_reengagement_push_at = NOW() WHERE id = $1`, [userId]);
}

async function sendNudge(user, type, notifType, vars = {}, route = '/mood') {
  const copy = getReengagementCopy(type, vars);
  if (!copy) return;
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel) VALUES ($1, $2, $3, 'push')`,
    [user.id, notifType, JSON.stringify({ message: copy.body, route })]
  );
  if (user.fcm_token) {
    await enqueuePushNotification(user.fcm_token, copy.title, copy.body, { type: notifType, route });
  }
  await markPushSent(user.id);
}

// ─── Evaluators ───────────────────────────────────────────────────────────────

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
  return streak >= 3;
}

async function checkBadMoodFollowup(user) {
  const { rows } = await query(
    `SELECT created_at FROM moods
     WHERE user_id = $1
       AND mood_level IN ('low', 'very_low')
       AND created_at BETWEEN NOW() - INTERVAL '12 hours' AND NOW() - INTERVAL '6 hours'
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!rows.length) return false;
  const moodAt = rows[0].created_at;

  const { rows: laterMood } = await query(
    `SELECT 1 FROM moods WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterMood.length) return false;

  // sessions.user_id is the requester; check if any session started after the mood
  const { rows: laterSession } = await query(
    `SELECT 1 FROM sessions WHERE user_id = $1 AND started_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  if (laterSession.length) return false;

  const { rows: laterAI } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > $2 LIMIT 1`,
    [user.id, moodAt]
  );
  return !laterAI.length;
}

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

async function checkPeerSessionFollowup(user) {
  // sessions.user_id is the session participant (requester side)
  const { rows } = await query(
    `SELECT 1 FROM sessions
     WHERE user_id = $1
       AND status = 'completed'
       AND ended_at BETWEEN NOW() - INTERVAL '28 hours' AND NOW() - INTERVAL '20 hours'
     LIMIT 1`,
    [user.id]
  );
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

async function checkTherapySessionFollowup(user) {
  // therapy_sessions has no status/member_id — join via therapist_bookings
  const { rows } = await query(
    `SELECT 1 FROM therapy_sessions ts
     JOIN therapist_bookings tb ON tb.id = ts.booking_id
     WHERE tb.member_user_id = $1
       AND tb.status = 'completed'
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

async function checkStreakAtRisk(user) {
  if (!user.streak_count || user.streak_count < 1) return false;
  const { rows } = await query(
    `SELECT 1 FROM moods
     WHERE user_id = $1
       AND created_at >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date
     LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

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

async function checkCreditZero(userId) {
  const { rows } = await query(
    `SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length > 0 && parseInt(rows[0].balance) === 0;
}

async function checkCreditLow(userId) {
  const { rows } = await query(
    `SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length > 0 && parseInt(rows[0].balance) === 1;
}

async function checkJournalDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM journals WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

async function checkAIDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM ai_interactions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

async function checkNoSafetyPlan(user) {
  const accountAge = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (accountAge < 14) return false;
  const { rows } = await query(
    `SELECT 1 FROM safety_plans WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  return !rows.length;
}

async function checkTherapistUpsell(user) {
  const { rows: peerSessions } = await query(
    `SELECT COUNT(*) AS cnt FROM sessions
     WHERE user_id = $1 AND status = 'completed'`,
    [user.id]
  );
  if (parseInt(peerSessions[0].cnt) < 3) return false;

  const { rows: booked } = await query(
    `SELECT 1 FROM therapist_bookings WHERE member_user_id = $1 LIMIT 1`,
    [user.id]
  );
  if (booked.length) return false;

  const { rows: already } = await query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'therapist_upsell' LIMIT 1`,
    [user.id]
  );
  return !already.length;
}

function checkDormant(user) {
  if (!user.last_mood_at) return true;
  return (Date.now() - new Date(user.last_mood_at).getTime()) / 86400000 >= 3;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function runReengagementJob() {
  const { rows: users } = await query(
    `SELECT u.id, u.fcm_token, u.streak_count, u.created_at,
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
      if (hadRecentPush(user)) continue;

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
              await sendNudge(user, 'streak_reminder', 'streak_reminder', { n: user.streak_count || 0 }, '/mood');
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
            if (await checkCreditZero(user.id)) {
              await sendNudge(user, 'credit_zero', 'credit_zero', {}, '/credits');
              fired = true;
            }
            break;

          case 'credit_low':
            if (await checkCreditLow(user.id)) {
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
