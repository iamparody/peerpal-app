const { query } = require('../db');
const logger = require('../utils/logger');


// Runs daily at 18:00 UTC (9pm Nairobi EAT).
// Sends a gentle journal prompt to users who had 2+ mood entries today,
// have reminders enabled, and haven't written a journal entry today.
async function runDailySummaryJob() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { rows: users } = await query(
    `SELECT u.id FROM users u
     WHERE u.is_active = true
       AND u.role = 'member'
       AND u.notif_checkin_reminder = true
       AND (
         SELECT COUNT(*) FROM moods m
         WHERE m.user_id = u.id AND m.created_at >= $1
       ) >= 2
       AND NOT EXISTS (
         SELECT 1 FROM journals j
         WHERE j.user_id = u.id AND j.created_at >= $1
       )`,
    [todayStart]
  );

  for (const user of users) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'journal_prompt', '{}', 'push')`,
      [user.id]
    );
  }
}

module.exports = { runDailySummaryJob };
