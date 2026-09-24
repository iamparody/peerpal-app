'use strict';

const { query } = require('../db');
const { initiatePayout } = require('../utils/therapistPayout');
const { v4: uuidv4 } = require('uuid');

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[escrowRelease:notify]', e.message));
}

async function runEscrowReleaseJob() {
  // Completed bookings held for 24+ hours with no open dispute
  const { rows } = await query(
    `SELECT b.id, b.therapist_id, b.therapist_payout_kes,
            tp.mpesa_number, tp.user_id AS therapist_user_id
     FROM therapist_bookings b
     JOIN therapist_profiles tp ON tp.id = b.therapist_id
     JOIN therapy_sessions ts ON ts.booking_id = b.id
     WHERE b.status = 'completed'
       AND b.escrow_status = 'held'
       AND ts.ended_at < NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM therapy_disputes d
         WHERE d.booking_id = b.id AND d.status = 'open'
       )`
  );

  for (const row of rows) {
    try {
      const payoutId = uuidv4();
      await query(
        `INSERT INTO therapist_payouts
           (id, therapist_id, booking_id, amount_kes, mpesa_number, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'pending', $1)`,
        [payoutId, row.therapist_id, row.id, row.therapist_payout_kes, row.mpesa_number]
      );

      await query(
        `UPDATE therapist_bookings SET escrow_status = 'released', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );

      await initiatePayout(payoutId).catch((e) =>
        console.error('[escrowRelease] initiatePayout failed:', payoutId, e.message)
      );

      await notifyUser(row.therapist_user_id, 'therapist_update', {
        message: `Payout of KES ${row.therapist_payout_kes} has been initiated to your M-Pesa.`,
      });

      console.log(`[escrowRelease] Released: booking ${row.id}, payout ${payoutId}`);
    } catch (err) {
      console.error('[escrowRelease] Error:', row.id, err.message);
    }
  }
}

module.exports = { runEscrowReleaseJob };
