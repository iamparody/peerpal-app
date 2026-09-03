const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { PACKAGES, stkPush, parseCallback, normalisePhone } = require('../utils/daraja');
const cache = require('../services/cache');

const DARAJA_LIVE = !!(
  process.env.DARAJA_CONSUMER_KEY &&
  process.env.DARAJA_CONSUMER_SECRET &&
  process.env.DARAJA_BUSINESS_SHORT_CODE &&
  process.env.DARAJA_PASSKEY &&
  process.env.DARAJA_CALLBACK_URL
);

const router = express.Router();

// ─── GET /credits/balance ─────────────────────────────────────────────────────
router.get('/balance', auth, async (req, res) => {
  const cacheKey = `credits:${req.user.id}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) return res.status(200).json(cached);

  const { rows } = await query(
    'SELECT balance, ai_conversations_used, ai_conversations_cap FROM credits WHERE user_id = $1',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Credits record not found', code: 'NOT_FOUND' });
  const result = {
    balance: rows[0].balance,
    ai_conversations_used: rows[0].ai_conversations_used,
    ai_conversations_cap: rows[0].ai_conversations_cap,
  };
  await cache.set(cacheKey, result, 30);
  return res.status(200).json(result);
});

// ─── GET /credits/transactions ────────────────────────────────────────────────
router.get('/transactions', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT id, type, amount_credits, amount_currency, currency_code, payment_method,
            payment_reference, session_id, channel, status, created_at
     FROM credit_transactions WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  const { rows: countRows } = await query(
    'SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1',
    [req.user.id]
  );
  const total = parseInt(countRows[0].count);
  return res.status(200).json({ transactions: rows, total, page, pages: Math.ceil(total / limit) });
});

// ─── POST /credits/purchase ───────────────────────────────────────────────────
// Initiates an M-Pesa STK Push. Requires user.phone to be set (or phone in body).
// Returns { pending: true, checkout_request_id } when Daraja is live.
// Returns { payment_url: null } placeholder when credentials not yet configured.
router.post('/purchase', auth, async (req, res) => {
  const packageId = req.body.package || req.body.package_id;
  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({
      error: `package must be one of: ${Object.keys(PACKAGES).join(', ')}`,
      code: 'INVALID_PACKAGE',
    });
  }

  const pkg = PACKAGES[packageId];

  if (!DARAJA_LIVE) {
    return res.status(200).json({
      payment_url: null,
      pending: false,
      message: 'Payments coming soon via M-Pesa. Please check back or contact support.',
    });
  }

  // Phone required in request body — used only for this STK Push, never stored
  if (!req.body.phone) {
    return res.status(400).json({
      error: 'Phone number required for M-Pesa payment.',
      code: 'PHONE_REQUIRED',
    });
  }

  let phone;
  try {
    phone = normalisePhone(req.body.phone);
  } catch {
    return res.status(400).json({
      error: 'Please enter a valid Safaricom Kenya number (e.g. 0712 345 678).',
      code: 'INVALID_PHONE',
    });
  }

  // Insert pending transaction — confirmed only after Safaricom callback
  const { rows: txRows } = await query(
    `INSERT INTO credit_transactions
       (user_id, type, amount_credits, amount_currency, payment_method, channel, status)
     VALUES ($1, 'purchase', $2, $3, 'mpesa', 'purchase', 'pending')
     RETURNING id`,
    [req.user.id, pkg.credits, pkg.price_ksh]
  );
  const transactionId = txRows[0].id;

  let checkoutRequestId;
  try {
    const result = await stkPush(
      phone,
      pkg.price_ksh,
      `PeerPal-${transactionId}`,
      `${pkg.credits} credits`
    );
    checkoutRequestId = result.checkoutRequestId;
  } catch (err) {
    await query(`UPDATE credit_transactions SET status = 'failed' WHERE id = $1`, [transactionId]);
    console.error('STK Push failed:', err.message);
    return res.status(502).json({ error: 'Could not send M-Pesa prompt. Please try again.', code: 'PAYMENT_ERROR' });
  }

  // Store checkout_request_id for callback correlation
  await query(
    `UPDATE credit_transactions SET payment_reference = $1 WHERE id = $2`,
    [checkoutRequestId, transactionId]
  );

  return res.status(200).json({
    pending: true,
    checkout_request_id: checkoutRequestId,
    message: 'Check your phone — enter your M-Pesa PIN to complete payment.',
  });
});

// ─── POST /credits/mpesa-callback ────────────────────────────────────────────
// No auth — called by Safaricom. Must respond 200 quickly.
router.post('/mpesa-callback', async (req, res) => {
  // Acknowledge immediately — Safaricom times out after ~5 s
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  let parsed;
  try {
    parsed = parseCallback(req.body);
  } catch (err) {
    console.error('Daraja callback parse error:', err.message);
    return;
  }

  const { success, checkoutRequestId, phone, amount, mpesaReceiptNumber } = parsed;

  if (!success) {
    // Payment cancelled or failed — mark transaction failed
    await query(
      `UPDATE credit_transactions SET status = 'failed' WHERE payment_reference = $1 AND status = 'pending'`,
      [checkoutRequestId]
    ).catch((e) => console.error('Daraja fail-update error:', e.message));
    return;
  }

  // Find the pending transaction by checkout_request_id
  const { rows: txRows } = await query(
    `SELECT id, user_id, amount_credits FROM credit_transactions
     WHERE payment_reference = $1 AND status = 'pending' LIMIT 1`,
    [checkoutRequestId]
  ).catch(() => ({ rows: [] }));

  if (!txRows.length) {
    console.warn('Daraja callback: no pending transaction for checkout_request_id', checkoutRequestId);
    return;
  }

  const { id: transactionId, user_id, amount_credits } = txRows[0];

  // Idempotency: skip if already confirmed
  const { rows: existing } = await query(
    `SELECT id FROM credit_transactions WHERE payment_reference = $1 AND status = 'confirmed'`,
    [checkoutRequestId]
  ).catch(() => ({ rows: [] }));
  if (existing.length) return;

  // Credit the balance
  await query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [amount_credits, user_id]
  ).catch((e) => console.error('Daraja credit error:', e.message));

  // Stack AI conversation allowance for the purchased bundle
  const purchasedPkg = Object.values(PACKAGES).find((p) => p.credits === amount_credits);
  if (purchasedPkg?.ai_conversations) {
    await query(
      'UPDATE credits SET ai_conversations_cap = ai_conversations_cap + $1 WHERE user_id = $2',
      [purchasedPkg.ai_conversations, user_id]
    ).catch((e) => console.error('Daraja AI conv award error:', e.message));
  }

  await cache.del(`credits:${user_id}`);

  // Confirm transaction, store receipt number
  await query(
    `UPDATE credit_transactions
       SET status = 'confirmed', payment_reference = $1
     WHERE id = $2 AND user_id = $3`,
    [mpesaReceiptNumber || checkoutRequestId, transactionId, user_id]
  ).catch((e) => console.error('Daraja confirm error:', e.message));

  // Notify user
  const notifPayload = JSON.stringify({ credits_added: amount_credits, receipt: mpesaReceiptNumber });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'credit_purchase_confirmed', $2, 'push'),
            ($1, 'credit_purchase_confirmed', $2, 'in_app')`,
    [user_id, notifPayload]
  ).catch((e) => console.error('Daraja notify error:', e.message));
});

module.exports = router;
