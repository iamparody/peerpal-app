const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { grantConsent, withdrawConsent, CONSENT_VERSION } = require('../services/trainingData');

const router = express.Router();

// ─── GET /profile ──────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const { rows: userRows } = await query(
    `SELECT u.alias, u.email, u.consent_version, u.consented_at, u.streak_count,
            u.role, u.created_at, c.balance AS credits_balance,
            u.notif_peer_broadcast, u.notif_checkin_reminder, u.notif_group_messages, u.notif_credit_low,
            p.persona_name, p.tone, p.response_style, p.formality
     FROM users u
     LEFT JOIN credits c ON c.user_id = u.id
     LEFT JOIN ai_personas p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );
  if (!userRows.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

  const user = userRows[0];
  // Mask email: first 3 chars + ***@domain
  const emailParts = user.email.split('@');
  const maskedEmail = `${emailParts[0].slice(0, 3)}***@${emailParts[1]}`;

  const persona = user.persona_name
    ? { persona_name: user.persona_name, tone: user.tone, response_style: user.response_style, formality: user.formality }
    : null;

  return res.status(200).json({
    alias: user.alias,
    email: maskedEmail,
    consent_version: user.consent_version,
    consented_at: user.consented_at,
    streak_count: user.streak_count,
    credits_balance: user.credits_balance,
    notif_peer_broadcast: user.notif_peer_broadcast ?? true,
    notif_checkin_reminder: user.notif_checkin_reminder ?? true,
    notif_group_messages: user.notif_group_messages ?? true,
    notif_credit_low: user.notif_credit_low ?? true,
    persona,
    member_since: user.created_at,
  });
});

// ─── POST /profile/delete-data ────────────────────────────────────────────────
router.post('/delete-data', auth, async (req, res) => {
  // Schedule deletion in 24 hours — actual purge performed by deletionJob
  await query(
    `UPDATE users SET scheduled_deletion_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
     WHERE id = $1`,
    [req.user.id]
  );
  return res.status(200).json({ scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000) });
});

// ─── POST /profile/training-consent ──────────────────────────────────────────
// Opt in to contributing anonymised conversations for AI training.
router.post('/training-consent', auth, async (req, res) => {
  await grantConsent(req.user.id);
  return res.status(200).json({ training_consent: true, consent_version: CONSENT_VERSION });
});

// ─── DELETE /profile/training-consent ────────────────────────────────────────
// Withdraw training consent and untag all existing records for this user.
router.delete('/training-consent', auth, async (req, res) => {
  await withdrawConsent(req.user.id);
  return res.status(200).json({ training_consent: false });
});

// ─── GET /profile/training-consent ───────────────────────────────────────────
router.get('/training-consent', auth, async (req, res) => {
  const { rows } = await query(
    'SELECT training_consent, training_consented_at, training_consent_version FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json(rows[0]);
});

// ─── PATCH /profile/deactivate ────────────────────────────────────────────────
router.patch('/deactivate', auth, async (req, res) => {
  // Soft deactivate + schedule 30-day deletion
  await query(
    `UPDATE users
        SET is_active = false,
            scheduled_deletion_at = NOW() + INTERVAL '30 days',
            updated_at = NOW()
      WHERE id = $1`,
    [req.user.id]
  );
  return res.status(200).json({ deactivated: true });
});

module.exports = router;
