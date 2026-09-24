const { query } = require('../db');
const { refundCredit } = require('./creditDeductor');
const { getAccessToken } = require('./daraja');

const DARAJA_BASE = process.env.DARAJA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// Attempt M-Pesa reversal via Daraja Reversal API.
// Only valid for same-day transactions — fails gracefully for older payments.
async function attemptMpesaReversal(payment_reference, amount_kes) {
  if (!payment_reference) return { reversed: false, reason: 'no_reference' };

  const token = await getAccessToken();

  const body = {
    Initiator:              process.env.DARAJA_B2C_INITIATOR_NAME,
    SecurityCredential:     process.env.DARAJA_B2C_SECURITY_CREDENTIAL,
    CommandID:              'TransactionReversal',
    TransactionID:          payment_reference,
    Amount:                 amount_kes,
    ReceiverParty:          process.env.DARAJA_BUSINESS_SHORT_CODE,
    ReceiverIdentifierType: '11',
    QueueTimeOutURL:        process.env.DARAJA_B2C_TIMEOUT_URL,
    ResultURL:              process.env.DARAJA_B2C_CALLBACK_URL,
    Remarks:                'PeerPal therapy session refund',
    Occasion:               'refund',
  };

  try {
    const res = await fetch(`${DARAJA_BASE}/mpesa/reversal/v1/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.ResponseCode === '0') {
      return { reversed: true };
    }
    return { reversed: false, reason: data.ResponseDescription };
  } catch (err) {
    return { reversed: false, reason: err.message };
  }
}

// Full refund: credit + M-Pesa reversal attempt.
// Used for: member cancellation with sufficient notice, therapist no-show, admin suspension.
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

  // Refund the booking credit charge
  if (booking.credit_charged > 0 && booking.member_id) {
    await refundCredit(
      booking.member_id,
      booking.credit_charged,
      null,
      'therapy_booking',
      'Your therapy session has been refunded'
    );
  }

  // Attempt M-Pesa reversal for cash payments
  let mpesaResult = { reversed: false, reason: 'no_payment' };
  if (booking.payment_status === 'paid' && booking.payment_reference) {
    mpesaResult = await attemptMpesaReversal(booking.payment_reference, booking.rate_kes);
  }

  await query(
    `UPDATE therapist_bookings
     SET payment_status = 'refunded', escrow_status = 'refunded', updated_at = NOW()
     WHERE id = $1`,
    [booking_id]
  );

  // Notify member
  if (booking.member_id) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'account_notice', $2, 'in_app')`,
      [booking.member_id, JSON.stringify({
        message: 'Your therapy session has been cancelled and fully refunded.',
        booking_id,
        mpesa_reversed: mpesaResult.reversed,
      })]
    );
  }

  return { refunded: true, mpesa_reversed: mpesaResult.reversed };
}

// Partial refund: member receives member_pct % of the rate; remainder released to therapist.
// Used for: late cancellations, dispute resolutions where partial fault is established.
async function issuePartialRefund(booking_id, member_pct) {
  if (member_pct < 0 || member_pct > 100) throw new Error('member_pct must be 0–100');

  const { rows } = await query(
    `SELECT b.*, u.id AS member_id
     FROM therapist_bookings b
     LEFT JOIN users u ON u.id = b.member_user_id
     WHERE b.id = $1`,
    [booking_id]
  );

  if (!rows.length) throw new Error(`Booking not found: ${booking_id}`);
  const booking = rows[0];

  const member_amount_kes = Math.round(booking.rate_kes * member_pct / 100);
  const therapist_amount_kes = booking.rate_kes - member_amount_kes - booking.platform_fee_kes;

  // Credit refund (proportional to credit charged)
  const credit_refund = Math.round(booking.credit_charged * member_pct / 100);
  if (credit_refund > 0 && booking.member_id) {
    await refundCredit(
      booking.member_id,
      credit_refund,
      null,
      'therapy_booking',
      `Partial refund for therapy session (${member_pct}%)`
    );
  }

  // Attempt partial M-Pesa reversal for cash portion
  let mpesaResult = { reversed: false };
  if (member_amount_kes > 0 && booking.payment_reference) {
    mpesaResult = await attemptMpesaReversal(booking.payment_reference, member_amount_kes);
  }

  await query(
    `UPDATE therapist_bookings
     SET payment_status = 'partial_refund',
         escrow_status  = 'released',
         therapist_payout_kes = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [Math.max(0, therapist_amount_kes), booking_id]
  );

  return {
    refunded: true,
    member_amount_kes,
    therapist_amount_kes: Math.max(0, therapist_amount_kes),
    mpesa_reversed: mpesaResult.reversed,
  };
}

module.exports = { issueFullRefund, issuePartialRefund, attemptMpesaReversal };
