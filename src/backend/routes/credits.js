const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { PACKAGES, initializeTransaction, verifyWebhookSignature } = require('../utils/paystack');
const cache = require('../services/cache');

const router = express.Router();

// ─── GET /credits/balance ─────────────────────────────────────────────────────
router.get('/balance', auth, async (req, res) => {
  const cacheKey = `credits:${req.user.id}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) return res.status(200).json(cached);

  const { rows } = await query('SELECT balance FROM credits WHERE user_id = $1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Credits record not found', code: 'NOT_FOUND' });
  const result = { balance: rows[0].balance };
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
router.post('/purchase', auth, async (req, res) => {
  const { package_id } = req.body;
  if (!package_id || !PACKAGES[package_id]) {
    return res.status(400).json({
      error: `package_id must be one of: ${Object.keys(PACKAGES).join(', ')}`,
      code: 'INVALID_PACKAGE',
    });
  }

  const pkg = PACKAGES[package_id];

  const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
  const email = userRows[0]?.email;

  // Insert pending transaction
  const { rows: txRows } = await query(
    `INSERT INTO credit_transactions
       (user_id, type, amount_credits, amount_currency, payment_method, channel, status)
     VALUES ($1, 'purchase', $2, $3, 'mpesa', 'purchase', 'pending')
     RETURNING id`,
    [req.user.id, pkg.credits, pkg.price_ksh]
  );
  const transactionId = txRows[0].id;

  let paystackData;
  try {
    paystackData = await initializeTransaction(email, pkg.amount_kobo, {
      user_id: req.user.id,
      package_id,
      transaction_id: transactionId,
    });
  } catch (err) {
    await query(`UPDATE credit_transactions SET status = 'failed' WHERE id = $1`, [transactionId]);
    console.error('Paystack init failed:', err.message);
    return res.status(502).json({ error: 'Payment service error', code: 'PAYMENT_ERROR' });
  }

  await query(
    `UPDATE credit_transactions SET payment_reference = $1 WHERE id = $2`,
    [paystackData.reference, transactionId]
  );

  return res.status(200).json({
    payment_url: paystackData.authorization_url,
    reference: paystackData.reference,
  });
});

// Credit deduction is now handled server-side at request submission (peer.js, referrals.js).
// The /credits/deduct endpoint has been removed as of credit system v2.

// ─── POST /credits/webhook ────────────────────────────────────────────────────
// No auth — public endpoint verified by Paystack HMAC signature only.
// req.body is a raw Buffer (set by express.raw in app.js for this path).
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Malformed JSON', code: 'BAD_REQUEST' });
  }

  // Ignore all events except charge.success
  if (event.event !== 'charge.success') {
    return res.status(200).json({ received: true });
  }

  const reference = event.data?.reference;
  const { user_id, package_id, transaction_id } = event.data?.metadata || {};

  if (!reference || !user_id || !package_id) {
    return res.status(200).json({ received: true });
  }

  const pkg = PACKAGES[package_id];
  if (!pkg) return res.status(200).json({ received: true });

  // Idempotency: skip if this reference is already confirmed
  const { rows: existing } = await query(
    `SELECT id FROM credit_transactions WHERE payment_reference = $1 AND status = 'confirmed'`,
    [reference]
  );
  if (existing.length) return res.status(200).json({ received: true });

  // Credit the balance
  await query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [pkg.credits, user_id]
  );
  await cache.del(`credits:${user_id}`);

  // Confirm the transaction record
  if (transaction_id) {
    await query(
      `UPDATE credit_transactions
         SET status = 'confirmed', payment_reference = $1
       WHERE id = $2 AND user_id = $3`,
      [reference, transaction_id, user_id]
    );
  } else {
    await query(
      `INSERT INTO credit_transactions
         (user_id, type, amount_credits, amount_currency, payment_method, payment_reference, channel, status)
       VALUES ($1, 'purchase', $2, $3, 'mpesa', $4, 'purchase', 'confirmed')`,
      [user_id, pkg.credits, pkg.price_ksh, reference]
    );
  }

  // Notify user — push + in-app (two rows, one per channel)
  const notifPayload = JSON.stringify({ credits_added: pkg.credits, package_id, reference });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'credit_purchase_confirmed', $2, 'push'),
            ($1, 'credit_purchase_confirmed', $2, 'in_app')`,
    [user_id, notifPayload]
  );

  return res.status(200).json({ received: true });
});

module.exports = router;
