const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ─── GET /profile ──────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const { rows: userRows } = await query(
    `SELECT u.alias, u.email, u.consent_version, u.consented_at, u.streak_count,
            u.role, u.created_at, c.balance AS credits_balance,
            u.notif_peer_broadcast, u.notif_checkin_reminder, u.notif_group_messages, u.notif_credit_low,
            u.peer_available_until,
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

  const availableUntil = user.peer_available_until;
  const peerAvailable = availableUntil && new Date(availableUntil) > new Date();

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
    peer_available: !!peerAvailable,
    peer_available_until: peerAvailable ? availableUntil : null,
    persona,
    member_since: user.created_at,
  });
});

// ─── PATCH /profile ───────────────────────────────────────────────────────────
// Updates notification preferences or registers/rotates the FCM token.
router.patch('/', auth, async (req, res) => {
  const ALLOWED = ['notif_peer_broadcast', 'notif_checkin_reminder', 'notif_group_messages', 'notif_credit_low', 'fcm_token'];
  const updates = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key];
    }
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No updatable fields provided', code: 'NO_FIELDS' });
  }
  if ('fcm_token' in updates && updates.fcm_token !== null && typeof updates.fcm_token !== 'string') {
    return res.status(400).json({ error: 'fcm_token must be a string or null', code: 'INVALID_TOKEN' });
  }

  const keys = Object.keys(updates);
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = [...Object.values(updates), req.user.id];

  await query(
    `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`,
    values
  );
  return res.status(200).json({ updated: true });
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
