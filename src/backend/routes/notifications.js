const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const NOTIF_PREF_COLUMNS = ['notif_peer_broadcast', 'notif_peer_night', 'notif_checkin_reminder', 'notif_group_messages', 'notif_credit_low'];

// ─── GET /notifications ───────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT id, type, payload, channel, status, created_at, read_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  const { rows: countRows } = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
    [req.user.id]
  );
  const total = parseInt(countRows[0].count);
  return res.status(200).json({ notifications: rows, total, page, pages: Math.ceil(total / limit) });
});

// ─── PATCH /notifications/read-all ───────────────────────────────────────────
// Must come before /:id to avoid route shadowing
router.patch('/read-all', auth, async (req, res) => {
  const { rowCount } = await query(
    `UPDATE notifications SET status = 'read', read_at = NOW()
     WHERE user_id = $1 AND status != 'read'`,
    [req.user.id]
  );
  return res.status(200).json({ updated_count: rowCount });
});

// ─── PATCH /notifications/preferences ────────────────────────────────────────
router.patch('/preferences', auth, async (req, res) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  for (const col of NOTIF_PREF_COLUMNS) {
    if (req.body[col] !== undefined) {
      if (typeof req.body[col] !== 'boolean') {
        return res.status(400).json({ error: `${col} must be a boolean`, code: 'INVALID_PREFERENCE' });
      }
      setClauses.push(`${col} = $${idx++}`);
      params.push(req.body[col]);
    }
  }

  if (!setClauses.length) {
    return res.status(400).json({ error: 'At least one preference field required', code: 'MISSING_FIELDS' });
  }

  params.push(req.user.id);
  await query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    params
  );
  return res.status(200).json({ updated: true });
});

// ─── PATCH /notifications/:id/read ────────────────────────────────────────────
router.patch('/:id/read', auth, async (req, res) => {
  const { rowCount } = await query(
    `UPDATE notifications SET status = 'read', read_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Notification not found', code: 'NOT_FOUND' });
  return res.status(200).json({ read: true });
});

module.exports = router;
