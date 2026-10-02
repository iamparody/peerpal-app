'use strict';

const { query } = require('../db');

/**
 * Runs every 2 minutes.
 * Deletes draft bookings whose payment window has expired and releases their slot locks.
 *
 * credit_charged = 0 guard: if a webhook just promoted the booking to 'pending'
 * but the expiry job runs in the same instant, the WHERE status='draft' clause
 * already prevents deletion. The credit_charged check is a belt-and-suspenders
 * safety measure in case of any partial-update race.
 */
async function runDraftBookingExpiryJob() {
  const { rows } = await query(
    `SELECT b.id, b.slot_lock_id
     FROM therapist_bookings b
     WHERE b.status = 'draft'
       AND b.credit_charged = 0
       AND b.expires_at < NOW()`
  );

  if (!rows.length) return;

  const ids     = rows.map(r => r.id);
  const lockIds = rows.map(r => r.slot_lock_id).filter(Boolean);

  await query(
    `DELETE FROM therapist_bookings WHERE id = ANY($1::uuid[]) AND status = 'draft' AND credit_charged = 0`,
    [ids]
  );

  if (lockIds.length) {
    await query(
      `DELETE FROM booking_slot_locks WHERE id = ANY($1::uuid[])`,
      [lockIds]
    );
  }

  console.log(`[draftBookingExpiryJob] Expired ${ids.length} draft booking(s)`);
}

module.exports = { runDraftBookingExpiryJob };
