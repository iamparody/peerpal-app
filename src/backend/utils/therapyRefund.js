const { query } = require('../db');
const { refundCredit } = require('./creditDeductor');

// Full credit refund to member's PeerPal balance.
// Used for: therapist no-show, admin cancellation, dispute resolution.
// Refunds are always platform credit — no M-Pesa reversals.
async function issueFullRefund(booking_id) {
  const { rows } = await query(
    `SELECT b.*, u.id AS member_id
     FROM therapist_bookings b
     JOIN users u ON u.id = b.member_user_id
     WHERE b.id = $1`,
    [booking_id]
  );

  if (!rows.length) throw new Error(`Booking not found: ${booking_id}`);
  const booking = rows[0];

  if (booking.payment_status === 'refunded') return { already_refunded: true };

  if (booking.credit_charged > 0 && booking.member_id) {
    await refundCredit(
      booking.member_id,
      booking.credit_charged,
      null,
      'therapy_booking',
      'Your therapy session credit has been refunded to your PeerPal balance'
    );
  }

  await query(
    `UPDATE therapist_bookings
     SET payment_status = 'refunded', escrow_status = 'refunded', updated_at = NOW()
     WHERE id = $1`,
    [booking_id]
  );

  if (booking.member_id) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'account_notice', $2, 'in_app')`,
      [booking.member_id, JSON.stringify({
        message: 'Your therapy session credit has been refunded to your PeerPal balance.',
        booking_id,
      })]
    );
  }

  return { refunded: true };
}

module.exports = { issueFullRefund };
