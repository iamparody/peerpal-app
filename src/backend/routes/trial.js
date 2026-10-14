const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
});

// POST /trial/claim
router.post('/claim', claimLimiter, auth, async (req, res) => {
  const { rows } = await query(
    'SELECT trial_claimed_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (rows[0]?.trial_claimed_at) {
    return res.status(409).json({ code: 'TRIAL_ALREADY_CLAIMED', message: 'Trial already claimed' });
  }
  const { rows: updated } = await query(
    `UPDATE users
     SET trial_claimed_at       = NOW(),
         trial_ends_at          = NOW() + INTERVAL '7 days',
         trial_ai_sessions_used = 0,
         trial_credits_issued   = 0
     WHERE id = $1
     RETURNING trial_ends_at`,
    [req.user.id]
  );
  return res.json({ trial_ends_at: updated[0].trial_ends_at, message: 'Trial active' });
});

// GET /trial/status
router.get('/status', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT trial_claimed_at, trial_ends_at, trial_ai_sessions_used
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });

  const isClaimed = !!u.trial_claimed_at;
  const now = Date.now();
  const endsAt = u.trial_ends_at ? new Date(u.trial_ends_at).getTime() : null;
  const isActive = isClaimed && endsAt && endsAt > now;

  let daysRemaining = 0;
  if (isActive) {
    daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));
  }

  const { rows: dripRows } = await query(
    `SELECT COALESCE(SUM(amount_credits), 0)::int AS today_credits
     FROM credit_transactions
     WHERE user_id = $1
       AND type = 'trial_drip'
       AND DATE(created_at AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE AT TIME ZONE 'Africa/Nairobi'`,
    [req.user.id]
  );

  const aiUsed = u.trial_ai_sessions_used || 0;

  return res.json({
    is_active:            isActive,
    is_claimed:           isClaimed,
    days_remaining:       daysRemaining,
    trial_credits_today:  dripRows[0].today_credits,
    ai_sessions_used:     aiUsed,
    ai_sessions_remaining: Math.max(0, 10 - aiUsed),
  });
});

module.exports = router;
