'use strict';

const { query } = require('../db');

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[preSessionReminder:notify]', e.message));
}

async function runPreSessionReminderJob() {
  // Confirmed bookings starting in 14–16 minutes
  const { rows } = await query(
    `SELECT b.id, b.member_user_id, b.therapist_id, b.session_format, b.scheduled_at,
            u.alias AS member_alias, tp.user_id AS therapist_user_id
     FROM therapist_bookings b
     JOIN users u ON u.id = b.member_user_id
     JOIN therapist_profiles tp ON tp.id = b.therapist_id
     WHERE b.status = 'confirmed'
       AND b.scheduled_at BETWEEN NOW() + INTERVAL '14 minutes' AND NOW() + INTERVAL '16 minutes'`
  );

  for (const row of rows) {
    try {
      await notifyUser(row.member_user_id, 'therapist_update', {
        message: 'Your therapy session starts in 15 minutes. Tap to join when it begins.',
        booking_id: row.id,
        session_format: row.session_format,
      });

      await notifyUser(row.therapist_user_id, 'therapist_update', {
        message: `Session in 15 minutes — your client is ${row.member_alias}. Tap to start when ready.`,
        booking_id: row.id,
      });

      console.log(`[preSessionReminder] Reminders sent for booking ${row.id}`);
    } catch (err) {
      console.error('[preSessionReminder] Error:', row.id, err.message);
    }
  }
}

module.exports = { runPreSessionReminderJob };
