'use strict';

const crypto = require('crypto');

/**
 * Initiate a Paystack hosted checkout (redirect flow).
 * Returns { reference, checkoutUrl, type: 'redirect' }
 *
 * NOTE: Paystack uses a different UX model than IntaSend STK push.
 * When this adapter is active, TherapistBookingScreen must redirect to
 * checkoutUrl instead of showing the "waiting for M-Pesa PIN" screen.
 * Set PAYMENT_PROVIDER=paystack and ensure the frontend handles checkoutUrl.
 */
async function initiatePayment({ amount, email, bookingId }) {
  const redirectUrl = `${process.env.APP_URL || 'https://app.peer-pal.com'}/therapy/my?payment=success`;

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    body: JSON.stringify({
      email,
      amount:       amount * 100,   // kobo (1 KES = 100 kobo)
      currency:     'KES',
      reference:    `PEERPAL-${bookingId}`,
      callback_url: redirectUrl,
      metadata:     { booking_id: bookingId },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack initialize failed [${res.status}]: ${text}`);
  }

  const data = await res.json();
  return {
    reference:   data.data.reference,
    checkoutUrl: data.data.authorization_url,
    type:        'redirect',
  };
}

/**
 * Verify a Paystack webhook using HMAC-SHA512.
 *
 * Paystack signs the raw HTTP body with your secret key and sends the hex
 * digest in the X-Paystack-Signature header. We must verify against the
 * original raw bytes — NOT against re-stringified req.body (key order differs).
 *
 * rawBody: Buffer captured before JSON parsing (req.rawBody from express.json verify callback)
 * headers: req.headers
 */
function verifyWebhook(rawBody, headers) {
  const sig = headers['x-paystack-signature'];

  if (!sig) throw new Error('Paystack webhook: missing X-Paystack-Signature header');

  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)           // Buffer — exact original bytes
    .digest('hex');

  const sigBuf      = Buffer.from(sig,      'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Paystack webhook signature mismatch');
  }

  const payload   = JSON.parse(rawBody.toString('utf8'));
  const success   = payload.event === 'charge.success';
  const reference = payload.data?.reference ?? '';
  const amount    = (payload.data?.amount ?? 0) / 100;   // back to KES

  return { success, reference, apiRef: reference, amount };
}

module.exports = { initiatePayment, verifyWebhook };
