'use strict';

const express = require('express');
const crypto  = require('crypto');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const { enqueuePushNotification } = require('../utils/fcm');
const logger = require('../utils/logger');

const router = express.Router();

// Graceful decrypt — existing plaintext rows won't parse as iv:tag:cipher; return as-is
function safeDecrypt(value) {
  if (!value) return value;
  try { return decrypt(value); } catch { return value; }
}

const PHI_FIELDS = ['warning_signs', 'helpful_things', 'things_to_avoid', 'reason_to_continue'];

function decryptPlan(row) {
  const out = { ...row };
  for (const f of PHI_FIELDS) if (out[f]) out[f] = safeDecrypt(out[f]);
  out.contacts = decryptContacts(out.contacts);
  return out;
}

function decryptContacts(contacts) {
  if (!contacts) return null;
  return contacts.map((c) => ({
    ...c,
    contact_detail: c.contact_detail ? safeDecrypt(c.contact_detail) : null,
  }));
}

function encryptContacts(contacts) {
  if (!contacts) return null;
  return contacts.map((c) => ({
    ...c,
    contact_detail: c.contact_detail ? encrypt(c.contact_detail) : null,
  }));
}

// push helper — looks up fcm_token and fires; non-fatal
async function pushToUser(userId, type, payload) {
  try {
    const { rows } = await query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
    const token = rows[0]?.fcm_token;
    if (!token) return;
    const titles = {
      trusted_contact_request:        'Someone wants to be your trusted contact',
      trusted_contact_accepted:        'Your trusted contact request was accepted',
      trusted_contact_mood_alert:      `${payload.alias} is feeling very low`,
      trusted_contact_no_peer_alert:   `${payload.alias} was looking for someone to talk to`,
    };
    const bodies = {
      trusted_contact_request:        `${payload.alias} has invited you to their safety plan. Tap to accept or decline.`,
      trusted_contact_accepted:        `${payload.alias} accepted your trusted contact request.`,
      trusted_contact_mood_alert:      'They might need a message right now.',
      trusted_contact_no_peer_alert:   "They couldn't find anyone — they might need a message.",
    };
    await enqueuePushNotification(token, titles[type], bodies[type], { type, route: '/safety-plan' });
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, $2, $3, 'push')`,
      [userId, type, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.warn({ err }, '[trusted-contacts] push failed');
  }
}

// ─── GET /safety-plan ─────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const { rows } = await query('SELECT * FROM safety_plans WHERE user_id = $1', [req.user.id]);
  if (!rows.length) return res.status(200).json({ plan: null });
  return res.status(200).json({ plan: decryptPlan(rows[0]) });
});

// ─── PUT /safety-plan ─────────────────────────────────────────────────────────
router.put('/', auth, async (req, res) => {
  const { warning_signs, helpful_things, things_to_avoid, contacts, emergency_resources, reason_to_continue } = req.body;

  if (contacts !== undefined) {
    if (!Array.isArray(contacts) || contacts.length > 3) {
      return res.status(400).json({ error: 'contacts must be an array of up to 3 items', code: 'INVALID_CONTACTS' });
    }
  }

  const encryptedContacts = contacts !== undefined ? encryptContacts(contacts) : undefined;

  const params = [req.user.id];
  const setClauses = ['updated_at = NOW()'];
  let idx = 2;

  if (warning_signs       !== undefined) { setClauses.push(`warning_signs = $${idx++}`);       params.push(warning_signs ? encrypt(warning_signs) : null); }
  if (helpful_things      !== undefined) { setClauses.push(`helpful_things = $${idx++}`);      params.push(helpful_things ? encrypt(helpful_things) : null); }
  if (things_to_avoid     !== undefined) { setClauses.push(`things_to_avoid = $${idx++}`);     params.push(things_to_avoid ? encrypt(things_to_avoid) : null); }
  if (encryptedContacts   !== undefined) { setClauses.push(`contacts = $${idx++}`);            params.push(JSON.stringify(encryptedContacts)); }
  if (emergency_resources !== undefined) { setClauses.push(`emergency_resources = $${idx++}`); params.push(emergency_resources); }
  if (reason_to_continue  !== undefined) { setClauses.push(`reason_to_continue = $${idx++}`);  params.push(reason_to_continue ? encrypt(reason_to_continue) : null); }

  const { rows } = await query(
    `INSERT INTO safety_plans (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}
     RETURNING updated_at`,
    params
  );

  return res.status(200).json({ updated_at: rows[0].updated_at });
});

// ─── GET /safety-plan/trusted-contacts ────────────────────────────────────────
// Own trusted contacts (outgoing — people the user has invited)
router.get('/trusted-contacts', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT tc.id, tc.status, tc.mood_alerts, tc.mood_threshold, tc.no_peer_alerts,
            tc.created_at, tc.accepted_at,
            u.alias AS contact_alias
     FROM trusted_contacts tc
     LEFT JOIN users u ON u.id = tc.contact_user_id
     WHERE tc.user_id = $1 AND tc.status != 'revoked'
     ORDER BY tc.created_at ASC`,
    [req.user.id]
  );
  return res.status(200).json({ trusted_contacts: rows });
});

// ─── GET /safety-plan/trusted-contacts/incoming ───────────────────────────────
// Pending requests where this user is the invitee
router.get('/trusted-contacts/incoming', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT tc.id, tc.created_at, u.alias AS requester_alias
     FROM trusted_contacts tc
     JOIN users u ON u.id = tc.user_id
     WHERE tc.contact_user_id = $1 AND tc.status = 'pending'
     ORDER BY tc.created_at DESC`,
    [req.user.id]
  );
  return res.status(200).json({ incoming: rows });
});

// ─── POST /safety-plan/trusted-contacts/invite ────────────────────────────────
// Generate a one-time invite token link
router.post('/trusted-contacts/invite', auth, async (req, res) => {
  const { rows: existing } = await query(
    `SELECT COUNT(*) AS cnt FROM trusted_contacts
     WHERE user_id = $1 AND status != 'revoked'`,
    [req.user.id]
  );
  if (parseInt(existing[0].cnt, 10) >= 3) {
    return res.status(400).json({ error: 'Maximum of 3 trusted contacts allowed', code: 'MAX_CONTACTS' });
  }

  const token = crypto.randomBytes(9).toString('base64url');
  await query(
    `INSERT INTO trusted_contacts (user_id, token) VALUES ($1, $2)`,
    [req.user.id, token]
  );

  const baseUrl = process.env.FRONTEND_URL || 'https://app.peerpal.co';
  return res.status(201).json({ invite_url: `${baseUrl}/trusted-invite?token=${token}` });
});

// ─── POST /safety-plan/trusted-contacts/search ────────────────────────────────
// Check if an alias exists — never exposes user_id
router.post('/trusted-contacts/search', auth, async (req, res) => {
  const { alias } = req.body;
  if (!alias || typeof alias !== 'string') {
    return res.status(400).json({ error: 'alias is required', code: 'MISSING_ALIAS' });
  }
  const { rows } = await query(
    `SELECT id FROM users WHERE alias = $1 AND is_active = true AND id != $2`,
    [alias.trim(), req.user.id]
  );
  if (!rows.length) return res.status(404).json({ found: false });
  return res.status(200).json({ found: true, alias: alias.trim() });
});

// ─── POST /safety-plan/trusted-contacts/request ───────────────────────────────
// In-app request to an existing user by alias
router.post('/trusted-contacts/request', auth, async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ error: 'alias is required', code: 'MISSING_ALIAS' });

  const { rows: existing } = await query(
    `SELECT COUNT(*) AS cnt FROM trusted_contacts WHERE user_id = $1 AND status != 'revoked'`,
    [req.user.id]
  );
  if (parseInt(existing[0].cnt, 10) >= 3) {
    return res.status(400).json({ error: 'Maximum of 3 trusted contacts allowed', code: 'MAX_CONTACTS' });
  }

  const { rows: target } = await query(
    `SELECT id, alias FROM users WHERE alias = $1 AND is_active = true AND id != $2`,
    [alias.trim(), req.user.id]
  );
  if (!target.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

  const targetUser = target[0];

  // Prevent duplicate pending request to same person
  const { rows: dup } = await query(
    `SELECT id FROM trusted_contacts
     WHERE user_id = $1 AND contact_user_id = $2 AND status != 'revoked'`,
    [req.user.id, targetUser.id]
  );
  if (dup.length) return res.status(409).json({ error: 'Request already sent', code: 'ALREADY_SENT' });

  const { rows: requester } = await query('SELECT alias FROM users WHERE id = $1', [req.user.id]);

  await query(
    `INSERT INTO trusted_contacts (user_id, contact_user_id) VALUES ($1, $2)`,
    [req.user.id, targetUser.id]
  );

  // Notify the target
  setImmediate(() => pushToUser(targetUser.id, 'trusted_contact_request', { alias: requester[0].alias }));

  return res.status(201).json({ requested: true });
});

// ─── POST /safety-plan/trusted-contacts/accept ────────────────────────────────
// Accept by token (link flow) or by record ID (in-app flow)
router.post('/trusted-contacts/accept', auth, async (req, res) => {
  const { token, request_id } = req.body;
  if (!token && !request_id) {
    return res.status(400).json({ error: 'token or request_id required', code: 'MISSING_PARAM' });
  }

  let record;
  if (token) {
    const { rows } = await query(
      `UPDATE trusted_contacts
       SET contact_user_id = $1, status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE token = $2 AND status = 'pending' AND contact_user_id IS NULL AND user_id != $1
       RETURNING id, user_id`,
      [req.user.id, token]
    );
    record = rows[0];
  } else {
    const { rows } = await query(
      `UPDATE trusted_contacts
       SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND contact_user_id = $2 AND status = 'pending'
       RETURNING id, user_id`,
      [request_id, req.user.id]
    );
    record = rows[0];
  }

  if (!record) return res.status(404).json({ error: 'Invite not found or already used', code: 'NOT_FOUND' });

  const { rows: accepter } = await query('SELECT alias FROM users WHERE id = $1', [req.user.id]);
  setImmediate(() => pushToUser(record.user_id, 'trusted_contact_accepted', { alias: accepter[0].alias }));

  return res.status(200).json({ accepted: true });
});

// ─── POST /safety-plan/trusted-contacts/decline ───────────────────────────────
router.post('/trusted-contacts/decline', auth, async (req, res) => {
  const { request_id } = req.body;
  if (!request_id) return res.status(400).json({ error: 'request_id required', code: 'MISSING_PARAM' });

  const { rowCount } = await query(
    `DELETE FROM trusted_contacts WHERE id = $1 AND contact_user_id = $2 AND status = 'pending'`,
    [request_id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
  return res.status(200).json({ declined: true });
});

// ─── PATCH /safety-plan/trusted-contacts/:id ──────────────────────────────────
// Update permission toggles — inviter only
router.patch('/trusted-contacts/:id', auth, async (req, res) => {
  const { mood_alerts, mood_threshold, no_peer_alerts } = req.body;

  const setClauses = ['updated_at = NOW()'];
  const params = [req.params.id, req.user.id];
  let idx = 3;

  if (mood_alerts    !== undefined) { setClauses.push(`mood_alerts = $${idx++}`);    params.push(mood_alerts); }
  if (mood_threshold !== undefined) {
    if (![1, 2].includes(mood_threshold)) {
      return res.status(400).json({ error: 'mood_threshold must be 1 or 2', code: 'INVALID_THRESHOLD' });
    }
    setClauses.push(`mood_threshold = $${idx++}`); params.push(mood_threshold);
  }
  if (no_peer_alerts !== undefined) { setClauses.push(`no_peer_alerts = $${idx++}`); params.push(no_peer_alerts); }

  const { rowCount } = await query(
    `UPDATE trusted_contacts SET ${setClauses.join(', ')}
     WHERE id = $1 AND user_id = $2 AND status = 'accepted'`,
    params
  );
  if (!rowCount) return res.status(404).json({ error: 'Contact not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true });
});

// ─── DELETE /safety-plan/trusted-contacts/:id ─────────────────────────────────
// Revoke — silent, immediate, inviter only
router.delete('/trusted-contacts/:id', auth, async (req, res) => {
  const { rowCount } = await query(
    `UPDATE trusted_contacts SET status = 'revoked', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'revoked'`,
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Contact not found', code: 'NOT_FOUND' });
  return res.status(200).json({ revoked: true });
});

module.exports = router;
