const express = require('express');
const { query, transaction } = require('../db');
const auth = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const { PACKAGES, getPackages } = require('../utils/daraja');
const { initiatePayment, verifyWebhook } = require('../services/payment');
const cache = require('../services/cache');
const { randomUUID } = require('crypto');

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
// Initiates an IntaSend M-Pesa STK Push for credit package purchase.
// Phone number is normalised inside the payment adapter.
router.post('/purchase', auth, paymentLimiter, async (req, res) => {
  const packageId = req.body.package || req.body.package_id;
  const PKGS = await getPackages();
  if (!packageId || !PKGS[packageId]) {
    return res.status(400).json({
      error: `package must be one of: ${Object.keys(PKGS).join(', ')}`,
      code: 'INVALID_PACKAGE',
    });
  }

  const pkg = PKGS[packageId];

  const phone = req.body.phone;
  if (!phone) {
    return res.status(400).json({
      error: 'Phone number required for M-Pesa payment.',
      code: 'PHONE_REQUIRED',
    });
  }

  // Pre-generate ID so we can reference it in the STK api_ref before inserting
  const transactionId = randomUUID();

  let paymentRef;
  let checkoutUrl;
  try {
    const result = await initiatePayment({
      amount: pkg.price_ksh,
      phone,
      email: req.user.email,
      bookingId: `CREDIT-${transactionId}`,
    });
    paymentRef = result.reference;
    checkoutUrl = result.checkoutUrl;
  } catch (err) {
    console.error('Credits STK Push failed:', err.message);
    return res.status(502).json({ error: 'Could not send M-Pesa prompt. Please try again.', code: 'PAYMENT_ERROR' });
  }

  // Atomic insert — payment_reference is stored with the row from the start
  await query(
    `INSERT INTO credit_transactions
       (id, user_id, type, amount_credits, amount_currency, payment_method, channel, status, payment_reference)
     VALUES ($1, $2, 'purchase', $3, $4, 'mpesa', 'purchase', 'pending', $5)`,
    [transactionId, req.user.id, pkg.credits, pkg.price_ksh, paymentRef]
  );

  if (checkoutUrl) {
    return res.status(200).json({ checkout_url: checkoutUrl });
  }

  return res.status(200).json({
    pending: true,
    transaction_id: transactionId,
    message: 'Check your phone — enter your M-Pesa PIN to complete payment.',
  });
});

// ─── POST /credits/payment-webhook ───────────────────────────────────────────
// No auth — called by IntaSend. Challenge verification via verifyWebhook().
router.post('/payment-webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' });

  let event;
  try {
    event = verifyWebhook(req.rawBody, req.headers);
  } catch (err) {
    console.error('[credits/payment-webhook] verification failed:', err.message);
    return;
  }

  const { success, reference: invoiceId } = event;

  if (!success) {
    await query(
      `UPDATE credit_transactions SET status = 'failed' WHERE payment_reference = $1 AND status = 'pending'`,
      [invoiceId]
    ).catch((e) => console.error('[credits/payment-webhook] fail-update error:', e.message));
    return;
  }

  // Claim, credit and AI allowance in one transaction. The UPDATE ... AND status = 'pending'
  // is the idempotency guard: a concurrent duplicate fire blocks on the row lock, re-checks
  // status after the first commits, matches nothing and exits. (Previously a SELECT then a
  // separate UPDATE let two fires both see 'pending' and both credit the balance.)
  // If anything fails the row stays 'pending' and the balance untouched, so it can be reconciled.
  let claimed;
  try {
    const packages = await getPackages();
    claimed = await transaction(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE credit_transactions SET status = 'confirmed'
         WHERE id = (SELECT id FROM credit_transactions
                     WHERE payment_reference = $1 AND status = 'pending' LIMIT 1)
           AND status = 'pending'
         RETURNING id, user_id, amount_credits`,
        [invoiceId]
      );
      if (!rows.length) return null;
      const { user_id, amount_credits } = rows[0];

      const { rowCount } = await tx.query(
        'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
        [amount_credits, user_id]
      );
      if (!rowCount) throw new Error(`credits row missing for user ${user_id}`);

      // Award AI conversation allowance for the purchased bundle
      const purchasedPkg = Object.values(packages).find((p) => p.credits === amount_credits);
      if (purchasedPkg?.ai_conversations) {
        await tx.query(
          'UPDATE credits SET ai_conversations_cap = ai_conversations_cap + $1 WHERE user_id = $2',
          [purchasedPkg.ai_conversations, user_id]
        );
      }
      return rows[0];
    });
  } catch (err) {
    console.error('[credits/payment-webhook] RECONCILIATION NEEDED invoice=%s err=%s', invoiceId, err.message);
    return;
  }

  if (!claimed) {
    console.warn('[credits/payment-webhook] no pending transaction for invoice', invoiceId);
    return;
  }

  const { user_id, amount_credits } = claimed;
  await cache.del(`credits:${user_id}`);

  const notifPayload = JSON.stringify({ credits_added: amount_credits });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'credit_purchase_confirmed', $2, 'push'),
            ($1, 'credit_purchase_confirmed', $2, 'in_app')`,
    [user_id, notifPayload]
  ).catch((e) => console.error('[credits/payment-webhook] notify error:', e.message));

  // Funnel step hook: purchase → converted
  await query(
    `UPDATE users SET reengagement_step = 'converted'
     WHERE id = $1 AND reengagement_step != 'converted'`,
    [user_id]
  ).catch((e) => console.error('[reengagement-hook/purchase]', e.message));
});

module.exports = router;
