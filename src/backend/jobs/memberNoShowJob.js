'use strict';

const { query } = require('../db');

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[memberNoShow:notify]', e.message));
}

async function runMemberNoShowJob() {
  // In-progress sessions where therapist joined but member never joined after 15 min
  const { rows } = await query(
    `SELECT b.id, b.member_user_id, b.therapist_id,
            tp.user_id AS therapist_user_id,
            ts.therapist_joined_at
     FROM therapist_bookings b
     JOIN therapy_sessions ts ON ts.booking_id = b.id
     JOIN therapist_profiles tp ON tp.id = b.therapist_id
     WHERE b.status = 'in_progress'
       AND ts.therapist_joined_at IS NOT NULL
       AND ts.member_joined_at IS NULL
       AND ts.therapist_joined_at < NOW() - INTERVAL '15 minutes'`
  );

  for (const row of rows) {
    try {
      await query(
        `UPDATE therapist_bookings SET status = 'member_no_show', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );

      // Therapist showed up — escrow proceeds normally after dispute window (no refund to member)
      await notifyUser(row.therapist_user_id, 'therapist_update', {
        message: 'Your client did not join the session. You will be paid in full for this session.',
        booking_id: row.id,
      });

      await notifyUser(row.member_user_id, 'therapist_update', {
        message: 'You missed your therapy session. No refund is available as your therapist was present.',
        booking_id: row.id,
      });

      console.log(`[memberNoShow] Processed member no-show: booking ${row.id}`);
    } catch (err) {
      console.error('[memberNoShow] Error:', row.id, err.message);
    }
  }
}

module.exports = { runMemberNoShowJob };
