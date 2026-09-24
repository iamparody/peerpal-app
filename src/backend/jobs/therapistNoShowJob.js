'use strict';

const { query } = require('../db');
const { issueFullRefund } = require('../utils/therapyRefund');

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[therapistNoShow:notify]', e.message));
}

async function runTherapistNoShowJob() {
  // Find confirmed bookings where scheduled_at passed 10+ min ago and therapist never joined
  const { rows: noShows } = await query(
    `SELECT b.id, b.member_user_id, b.therapist_id, b.scheduled_at,
            tp.user_id AS therapist_user_id, tp.no_show_count
     FROM therapist_bookings b
     JOIN therapist_profiles tp ON tp.id = b.therapist_id
     LEFT JOIN therapy_sessions ts ON ts.booking_id = b.id
     WHERE b.status = 'confirmed'
       AND b.scheduled_at < NOW() - INTERVAL '10 minutes'
       AND (ts.id IS NULL OR ts.therapist_joined_at IS NULL)`
  );

  for (const row of noShows) {
    try {
      await query(
        `UPDATE therapist_bookings SET status = 'therapist_no_show', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );

      await issueFullRefund(row.id).catch((e) =>
        console.error('[therapistNoShow] refund failed:', row.id, e.message)
      );

      await notifyUser(row.member_user_id, 'therapist_update', {
        message: 'Your therapist did not join the session. A full refund has been issued.',
        booking_id: row.id,
      });

      const newCount = (row.no_show_count || 0) + 1;
      await query(
        `UPDATE therapist_profiles SET no_show_count = $1, updated_at = NOW() WHERE id = $2`,
        [newCount, row.therapist_id]
      );

      if (newCount >= 3) {
        await query(
          `UPDATE therapist_profiles SET suspended = true, is_active = false, updated_at = NOW() WHERE id = $1`,
          [row.therapist_id]
        );
        console.warn('[therapistNoShow] Auto-suspended therapist (3+ no-shows):', row.therapist_id);
        await notifyUser(row.therapist_user_id, 'therapist_update', {
          message: 'Your account has been suspended due to repeated no-shows. Contact support to appeal.',
        });
      }

      console.log(`[therapistNoShow] Processed no-show: booking ${row.id}`);
    } catch (err) {
      console.error('[therapistNoShow] Error processing booking:', row.id, err.message);
    }
  }
}

module.exports = { runTherapistNoShowJob };
