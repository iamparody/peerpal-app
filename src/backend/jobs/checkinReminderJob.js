const { query } = require('../db');
const logger = require('../utils/logger');


// Runs daily at 17:00 UTC (8pm Nairobi EAT = UTC+3).
// Sends push reminder to active users who haven't checked in today and have reminders enabled.
async function runCheckinReminderJob() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Users who opted in to reminders AND haven't logged a mood today
  const { rows: users } = await query(
    `SELECT u.id FROM users u
     WHERE u.is_active = true
       AND u.role = 'member'
       AND u.notif_checkin_reminder = true
       AND NOT EXISTS (
         SELECT 1 FROM moods m
         WHERE m.user_id = u.id AND m.created_at >= $1
       )`,
    [todayStart]
  );

  for (const user of users) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'check_in_reminder', '{}', 'push')`,
      [user.id]
    );
  }

}

module.exports = { runCheckinReminderJob };
