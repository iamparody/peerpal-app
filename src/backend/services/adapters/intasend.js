'use strict';

const crypto = require('crypto');

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.intasend.com'
  : 'https://sandbox.intasend.com';

/**
 * Normalise a Kenyan phone number to 2547XXXXXXXX / 2541XXXXXXXX format.
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +254XXXXXXXX
 */
function normalisePhone(phone) {
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0'))   p = '254' + p.slice(1);
  if (p.startsWith('+'))   p = p.slice(1);
  if (!p.startsWith('254')) p = '254' + p;
  return p;
}

/**
 * Initiate an M-Pesa STK push via IntaSend.
 * Returns { reference: invoiceId, type: 'stk' }
 */
async function initiatePayment({ amount, phone, bookingId }) {
  const res = await fetch(`${BASE_URL}/api/v1/payment/mpesa-stk-push/`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.INTASEND_SECRET_KEY}`,
    },
    body: JSON.stringify({
      amount,
      phone_number: normalisePhone(phone),
      api_ref:      `PEERPAL-${bookingId}`,
      narrative:    'PeerPal therapy session',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IntaSend STK push failed [${res.status}]: ${text}`);
  }

  const data      = await res.json();
  const invoiceId = data.invoice?.invoice_id ?? data.id;

  if (!invoiceId) throw new Error('IntaSend STK push: no invoice_id in response');

  return { reference: invoiceId, type: 'stk' };
}

/**
 * Verify an IntaSend webhook.
 *
 * IntaSend verification uses a shared CHALLENGE STRING (not HMAC).
 * The dashboard webhook config has a "Challenge" field — we set it to
 * INTASEND_WEBHOOK_CHALLENGE. Every incoming payload includes that exact
 * value in payload.challenge. We reject anything that doesn't match.
 *
 * rawBody: Buffer captured before JSON parsing (req.rawBody)
 * headers: req.headers (not used for challenge, kept for interface parity)
 */
function verifyWebhook(rawBody, headers) {
  const payload = JSON.parse(rawBody.toString('utf8'));
  const invoice = payload.invoice ?? payload;

  const expected  = process.env.INTASEND_WEBHOOK_CHALLENGE;
  const received  = payload.challenge;

  if (!expected)  throw new Error('INTASEND_WEBHOOK_CHALLENGE env var is not set');
  if (!received)  throw new Error('IntaSend webhook: missing challenge in payload');

  // Timing-safe comparison
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('IntaSend webhook challenge mismatch');
  }

  const success   = invoice.state === 'COMPLETE';
  const reference = invoice.invoice_id;
  const apiRef    = invoice.api_ref ?? '';
  const amount    = parseFloat(invoice.net_amount ?? invoice.value ?? 0);

  if (!reference) throw new Error('IntaSend webhook: missing invoice_id');

  return { success, reference, apiRef, amount };
}

module.exports = { initiatePayment, verifyWebhook, normalisePhone };
