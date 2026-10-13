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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ISO week string: YYYY-WNN (e.g. 2026-W42)
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// EAT = UTC+3. Quiet hours: 21:00–07:00 EAT (18:00–04:00 UTC)
function isQuietHours() {
  const utcHour = new Date().getUTCHours();
  return utcHour >= 18 || utcHour < 4;
}

function hadRecentPush(user) {
  if (!user.last_reengagement_push_at) return false;
  return (Date.now() - new Date(user.last_reengagement_push_at).getTime()) < 86400000;
}

async function markPushSent(userId) {
  await query(`UPDATE users SET last_reengagement_push_at = NOW() WHERE id = $1`, [userId]);
}

// Inserts notification record with event_ref for idempotent delivery.
// Returns true if send succeeded, false if already sent (unique violation = duplicate suppressed).
async function sendNudge(user, type, notifType, vars = {}, route = '/mood', eventRef = null) {
  const copy = getReengagementCopy(type, vars);
  if (!copy) return false;

  try {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel, event_ref)
       VALUES ($1, $2, $3, 'push', $4)`,
      [user.id, notifType, JSON.stringify({ message: copy.body, route }), eventRef]
    );
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation — duplicate job run suppressed. Not an error.
      console.log(`[reengagement] duplicate suppressed user=${user.id} type=${notifType} event_ref=${eventRef}`);
      return false;
    }
    throw err;
  }

  if (user.fcm_token) {
    await enqueuePushNotification(user.fcm_token, copy.title, copy.body, { type: notifType, route });
  }
  await markPushSent(user.id);
  return true;
}

// ─── Evaluators — return record ID (or date string) when condition is met, null otherwise ──

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

// Returns mood record id if followup is warranted
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

// Returns peer_request id if unmatched
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

// Returns session id if followup is warranted
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
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'session_followup_peer'
       AND event_ref = $2
     LIMIT 1`,
    [user.id, `session:${sessionId}`]
  );
  return already.length ? null : sessionId;
}

// Returns booking id if followup is warranted
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
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'session_followup_therapy'
       AND event_ref = $2
     LIMIT 1`,
    [user.id, `booking:${bookingId}`]
  );
  return already.length ? null : bookingId;
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

async function checkCreditZero(userId) {
  const { rows } = await query(
    `SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length && parseInt(rows[0].balance) === 0 ? isoDate() : null;
}

async function checkCreditLow(userId) {
  const { rows } = await query(
    `SELECT balance FROM credits WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length && parseInt(rows[0].balance) === 1 ? isoDate() : null;
}

async function checkJournalDormant(user) {
  const { rows } = await query(
    `SELECT 1 FROM journals WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`,
    [user.id]
  );
  return rows.length ? null : isoWeek();
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
  const { rows } = await query(
    `SELECT 1 FROM safety_plans WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  if (rows.length) return null;
  // Send at most every 2 weeks — use odd/even week number as gate
  const week = parseInt(isoWeek().split('-W')[1], 10);
  return week % 2 === 0 ? isoWeek() : null;
}

async function checkTherapistUpsell(user) {
  const { rows: peerSessions } = await query(
    `SELECT COUNT(*) AS cnt FROM sessions
     WHERE user_id = $1 AND status = 'completed'`,
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

function checkDormant(user) {
  if (!user.last_mood_at) return isoWeek();
  return (Date.now() - new Date(user.last_mood_at).getTime()) / 86400000 >= 3 ? isoWeek() : null;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

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

async function runReengagementJob() {
  if (isQuietHours()) {
    console.log('[reengagement] quiet hours — skipping run');
    return;
  }

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
          case 'low_mood_streak': {
            const ref = await checkLowMoodStreak(user);
            if (ref) {
              fired = await sendNudge(user, 'low_mood_streak', 'low_mood_streak', {}, '/peer', `lowmoodstreak:${ref}`);
            }
            break;
          }
          case 'bad_mood_followup': {
            const moodId = await checkBadMoodFollowup(user);
            if (moodId) {
              fired = await sendNudge(user, 'bad_mood_followup', 'bad_mood_followup', {}, '/mood', `mood:${moodId}`);
            }
            break;
          }
          case 'unmatched_request': {
            const requestId = await checkUnmatchedRequest(user);
            if (requestId) {
              fired = await sendNudge(user, 'unmatched_request', 'unmatched_request', {}, '/peer', `request:${requestId}`);
            }
            break;
          }
          case 'session_followup_peer': {
            const sessionId = await checkPeerSessionFollowup(user);
            if (sessionId) {
              fired = await sendNudge(user, 'session_followup_peer', 'session_followup_peer', {}, '/mood', `session:${sessionId}`);
            }
            break;
          }
          case 'session_followup_therapy': {
            const bookingId = await checkTherapySessionFollowup(user);
            if (bookingId) {
              fired = await sendNudge(user, 'session_followup_therapy', 'session_followup_therapy', {}, '/journal', `booking:${bookingId}`);
            }
            break;
          }
          case 'streak_reminder': {
            const ref = await checkStreakAtRisk(user);
            if (ref) {
              fired = await sendNudge(user, 'streak_reminder', 'streak_reminder', { n: user.streak_count || 0 }, '/mood', `streakremind:${ref}`);
            }
            break;
          }
          case 'streak_broken': {
            const ref = await checkStreakBroken(user);
            if (ref) {
              fired = await sendNudge(user, 'streak_broken', 'streak_broken', {}, '/mood', `streakbreak:${ref}`);
            }
            break;
          }
          case 'credit_zero': {
            const ref = await checkCreditZero(user.id);
            if (ref) {
              fired = await sendNudge(user, 'credit_zero', 'credit_zero', {}, '/credits', `creditzero:${ref}`);
            }
            break;
          }
          case 'credit_low': {
            const ref = await checkCreditLow(user.id);
            if (ref) {
              fired = await sendNudge(user, 'credit_low', 'credit_low', {}, '/credits', `creditlow:${ref}`);
            }
            break;
          }
          case 'journal_prompt_reengagement': {
            const ref = await checkJournalDormant(user);
            if (ref) {
              fired = await sendNudge(user, 'dormant_nudge', 'journal_prompt', {}, '/journal', `journaldormant:${ref}`);
            }
            break;
          }
          case 'ai_dormant': {
            const ref = await checkAIDormant(user);
            if (ref) {
              fired = await sendNudge(user, 'ai_dormant', 'ai_dormant', {}, '/ai', `aidormant:${ref}`);
            }
            break;
          }
          case 'no_safety_plan': {
            const ref = await checkNoSafetyPlan(user);
            if (ref) {
              fired = await sendNudge(user, 'no_safety_plan', 'no_safety_plan', {}, '/safety-plan', `safetyplan:${ref}`);
            }
            break;
          }
          case 'therapist_upsell': {
            const ref = await checkTherapistUpsell(user);
            if (ref) {
              fired = await sendNudge(user, 'therapist_upsell', 'therapist_upsell', {}, '/therapy/browse', `therapistupsell:${ref}`);
            }
            break;
          }
          case 'dormant_nudge': {
            const ref = checkDormant(user);
            if (ref) {
              fired = await sendNudge(user, 'dormant_nudge', 'dormant_nudge', {}, '/mood', `dormant:${ref}`);
            }
            break;
          }
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
