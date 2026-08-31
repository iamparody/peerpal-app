const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../db');
const { generateAccessToken } = require('../utils/jwt');
const { generateAlias } = require('../utils/aliasGenerator');
const auth = require('../middleware/auth');
const {
  authLimiter,
  loginCooldownMiddleware,
  recordFailedLogin,
  clearLoginRecord,
  checkResendLimit,
} = require('../middleware/rateLimit');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── POST /auth/register ──────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'INVALID_PASSWORD' });
    }

    const emailLower = email.toLowerCase().trim();

    const { rows: existing } = await query('SELECT email_verified FROM users WHERE email = $1', [emailLower]);
    if (existing.length > 0) {
      if (!existing[0].email_verified) {
        return res.status(409).json({ error: 'Account pending verification', code: 'PENDING_VERIFICATION' });
      }
      return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_TAKEN' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const alias = await generateAlias();

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = hashToken(verifyToken);

    const { rows } = await query(
      `INSERT INTO users (alias, email, password_hash, role, email_verify_token_hash, email_verify_expires)
       VALUES ($1, $2, $3, 'member', $4, NOW() + INTERVAL '24 hours')
       RETURNING id, alias, role`,
      [alias, emailLower, password_hash, verifyHash]
    );
    const user = rows[0];

    await query('INSERT INTO credits (user_id, balance) VALUES ($1, 0)', [user.id]);

    // Fire-and-forget — enqueueEmail returns immediately; email delivers in background
    sendVerificationEmail(emailLower, alias, verifyToken);

    const token = generateAccessToken(user);

    return res.status(201).json({ token, alias: user.alias, userId: user.id, email_verified: false });
  } catch (err) {
    console.error('Registration error:', err);
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({ error: err.message, stack: err.stack });
    }
    return res.status(500).json({ error: 'Registration failed', code: 'REGISTRATION_ERROR' });
  }
});

// ─── GET /auth/verify-email?token= ───────────────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Token is required', code: 'MISSING_TOKEN' });
  }

  const hash = hashToken(token);

  const { rows } = await query(
    'SELECT id, email_verify_expires FROM users WHERE email_verify_token_hash = $1',
    [hash]
  );

  if (!rows.length) {
    return res.status(400).json({
      error: 'Link expired or invalid. Request a new one.',
      code: 'INVALID_TOKEN',
    });
  }

  const user = rows[0];
  const isExpired = new Date(user.email_verify_expires) < new Date();

  // Single-use: always clear the token regardless of outcome
  await query(
    'UPDATE users SET email_verify_token_hash = NULL, email_verify_expires = NULL WHERE id = $1',
    [user.id]
  );

  if (isExpired) {
    return res.status(400).json({
      error: 'Link expired or invalid. Request a new one.',
      code: 'TOKEN_EXPIRED',
    });
  }

  await query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);

  return res.status(200).json({ message: 'Email verified successfully' });
});

// ─── POST /auth/resend-verification ──────────────────────────────────────────
router.post('/resend-verification', auth, async (req, res) => {
  const { rows } = await query(
    'SELECT email, alias, email_verified FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
  }

  const user = rows[0];

  if (user.email_verified) {
    return res.status(400).json({ error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
  }

  if (!checkResendLimit(req.user.id)) {
    return res.status(429).json({
      error: 'Too many resend requests — please wait an hour before trying again',
      code: 'RESEND_RATE_LIMITED',
    });
  }

  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyHash = hashToken(verifyToken);

  await query(
    `UPDATE users SET email_verify_token_hash = $1, email_verify_expires = NOW() + INTERVAL '24 hours'
     WHERE id = $2`,
    [verifyHash, req.user.id]
  );

  try {
    await sendVerificationEmail(user.email, user.alias, verifyToken);
  } catch (err) {
    console.error('Resend verification email failed:', err.message);
  }

  return res.status(200).json({ message: 'Verification email sent' });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', loginCooldownMiddleware, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', code: 'MISSING_FIELDS' });
  }

  const { rows } = await query(
    'SELECT id, alias, role, password_hash, is_active, email_verified FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (!rows.length) {
    recordFailedLogin(req.ip);
    return res.status(401).json({ error: 'No account associated with that email', code: 'NO_ACCOUNT' });
  }

  if (!rows[0].is_active) {
    recordFailedLogin(req.ip);
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    recordFailedLogin(req.ip);
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  clearLoginRecord(req.ip);

  if (req.body.fcm_token) {
    await query('UPDATE users SET fcm_token = $1 WHERE id = $2', [req.body.fcm_token, user.id]);
  }

  // Send a fresh verification email if account is unverified — user is about to be redirected
  // to /email-sent so the email should actually arrive in their inbox.
  if (!user.email_verified) {
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = hashToken(verifyToken);
    await query(
      `UPDATE users SET email_verify_token_hash = $1, email_verify_expires = NOW() + INTERVAL '24 hours'
       WHERE id = $2`,
      [verifyHash, user.id]
    );
    sendVerificationEmail(email.toLowerCase().trim(), user.alias, verifyToken);
  }

  const token = generateAccessToken({ id: user.id, alias: user.alias, role: user.role });

  return res.status(200).json({
    token,
    alias: user.alias,
    userId: user.id,
    role: user.role,
    email_verified: user.email_verified,
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  await query(
    `INSERT INTO token_blacklist (jti, expires_at)
     VALUES ($1, NOW() + INTERVAL '7 days')
     ON CONFLICT (jti) DO NOTHING`,
    [req.user.jti]
  );
  return res.status(200).json({ message: 'Logged out successfully' });
});

// ─── POST /auth/recover ───────────────────────────────────────────────────────
router.post('/recover', authLimiter, async (req, res) => {
  const { email } = req.body;

  // Always return 200 — prevents email enumeration
  if (!email) return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });

  const { rows } = await query(
    'SELECT id, alias FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase().trim()]
  );

  if (rows.length > 0) {
    const { id: userId, alias } = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = hashToken(resetToken);

    await query(
      `UPDATE users SET reset_token_hash = $1, reset_token_expires = NOW() + INTERVAL '1 hour'
       WHERE id = $2`,
      [resetHash, userId]
    );

    try {
      await sendPasswordResetEmail(email.toLowerCase().trim(), alias, resetToken);
    } catch (err) {
      console.error('Password reset email failed:', err.message);
    }
  }

  return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required', code: 'MISSING_TOKEN' });
  }
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'INVALID_PASSWORD' });
  }

  const hash = hashToken(token);

  const { rows } = await query(
    'SELECT id, reset_token_expires FROM users WHERE reset_token_hash = $1',
    [hash]
  );

  if (!rows.length) {
    return res.status(400).json({
      error: 'Link expired or invalid. Request a new one.',
      code: 'INVALID_TOKEN',
    });
  }

  const user = rows[0];
  const isExpired = new Date(user.reset_token_expires) < new Date();

  // Single-use: always clear the token
  await query(
    'UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE id = $1',
    [user.id]
  );

  if (isExpired) {
    return res.status(400).json({
      error: 'Link expired or invalid. Request a new one.',
      code: 'TOKEN_EXPIRED',
    });
  }

  const password_hash = await bcrypt.hash(new_password, 12);

  // Update password and invalidate all existing sessions via jwt_issued_before
  await query(
    'UPDATE users SET password_hash = $1, jwt_issued_before = NOW() WHERE id = $2',
    [password_hash, user.id]
  );

  return res.status(200).json({ message: 'Password updated successfully' });
});

module.exports = router;
