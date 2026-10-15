const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, getClient } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const redeemLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
});

// POST /promo/redeem
router.post('/redeem', redeemLimiter, auth, async (req, res) => {
  const raw = req.body?.code;
  if (!raw) return res.status(400).json({ error: 'Code is required' });
  const code = raw.toString().trim().toUpperCase();

  const { rows: codeRows } = await query(
    `SELECT id, credit_value, max_uses, uses_count, valid_until, is_active
     FROM promo_codes WHERE code = $1`,
    [code]
  );

  if (!codeRows.length) {
    return res.status(404).json({ error: 'That code does not exist' });
  }

  const pc = codeRows[0];

  if (!pc.is_active) {
    return res.status(410).json({ error: 'That code is no longer active' });
  }
  if (pc.valid_until && new Date(pc.valid_until) < new Date()) {
    return res.status(410).json({ error: 'That code has expired' });
  }
  if (pc.max_uses !== null && pc.uses_count >= pc.max_uses) {
    return res.status(410).json({ error: 'This code has reached its limit' });
  }

  const { rows: alreadyRows } = await query(
    'SELECT 1 FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2',
    [pc.id, req.user.id]
  );
  if (alreadyRows.length) {
    return res.status(409).json({ error: 'You have already used this code' });
  }

  // Atomic redemption: lock the promo_code row, add credits, record everything
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock row to prevent race on max_uses
    const { rows: locked } = await client.query(
      'SELECT uses_count, max_uses FROM promo_codes WHERE id = $1 FOR UPDATE',
      [pc.id]
    );
    if (locked[0].max_uses !== null && locked[0].uses_count >= locked[0].max_uses) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This code has reached its limit' });
    }

    // Add credits
    await client.query(
      'UPDATE credits SET balance = balance + $1 WHERE user_id = $2',
      [pc.credit_value, req.user.id]
    );

    // Write transaction record
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount_credits, type, payment_method, channel, status)
       VALUES ($1, $2, 'promo', 'bonus', 'purchase', 'confirmed')`,
      [req.user.id, pc.credit_value]
    );

    // Record redemption
    await client.query(
      'INSERT INTO promo_code_redemptions (promo_code_id, user_id, credits_awarded) VALUES ($1, $2, $3)',
      [pc.id, req.user.id, pc.credit_value]
    );

    // Increment uses_count
    await client.query(
      'UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1',
      [pc.id]
    );

    await client.query('COMMIT');

    const { rows: balanceRows } = await query(
      'SELECT balance FROM credits WHERE user_id = $1',
      [req.user.id]
    );

    return res.json({
      credits_awarded: pc.credit_value,
      new_balance: balanceRows[0]?.balance ?? 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already used this code' });
    }
    console.error('[promo/redeem]', err);
    return res.status(500).json({ error: 'Something went wrong' });
  } finally {
    client.release();
  }
});

module.exports = router;
