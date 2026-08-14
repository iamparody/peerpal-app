const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const cache = require('../services/cache');
const { classify } = require('../utils/riskClassifier');
const { stripHtml } = require('../utils/sanitizer');

const router = express.Router();

const VALID_REASONS = ['harmful_content', 'abuse', 'spam', 'other'];
const MAX_MSG_LEN = 1000;
const RESPONSE_MAX_LEN = 500;

// Helper: verify active membership for a user in a group
async function getActiveMembership(group_id, user_id) {
  const { rows } = await query(
    `SELECT id FROM group_memberships
     WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [group_id, user_id]
  );
  return rows[0] || null;
}

// ─── GET /groups ──────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const cacheKey = `groups:list:${req.user.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  const { rows } = await query(
    `SELECT g.id, g.name, g.condition_category, g.description, g.is_active,
            COUNT(gm.id) FILTER (WHERE gm.status = 'active') AS member_count,
            EXISTS(
              SELECT 1 FROM group_memberships um
              WHERE um.group_id = g.id AND um.user_id = $1 AND um.status = 'active'
            ) AS is_member
     FROM groups g
     LEFT JOIN group_memberships gm ON gm.group_id = g.id
     WHERE g.is_active = true
     GROUP BY g.id
     ORDER BY g.name ASC`,
    [req.user.id]
  );
  const result = { groups: rows };
  await cache.set(cacheKey, result, 60);
  return res.status(200).json(result);
});

// ─── GET /groups/:id ──────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const { rows: groupRows } = await query(
    `SELECT g.id, g.name, g.condition_category, g.description, g.is_active,
            COUNT(gm.id) FILTER (WHERE gm.status = 'active') AS member_count
     FROM groups g
     LEFT JOIN group_memberships gm ON gm.group_id = g.id
     WHERE g.id = $1 AND g.is_active = true
     GROUP BY g.id`,
    [req.params.id]
  );
  if (!groupRows.length) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });

  const { rows: memberRows } = await query(
    'SELECT status FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  const membership = memberRows[0] || null;

  return res.status(200).json({
    group: groupRows[0],
    is_member: membership?.status === 'active',
    membership_status: membership?.status || null,
  });
});

// ─── POST /groups/:id/join ────────────────────────────────────────────────────
router.post('/:id/join', auth, async (req, res) => {
  if (!req.body.agreement_confirmed) {
    return res.status(400).json({ error: 'agreement_confirmed must be true', code: 'AGREEMENT_REQUIRED' });
  }

  const { rows: groupRows } = await query('SELECT id FROM groups WHERE id = $1 AND is_active = true', [req.params.id]);
  if (!groupRows.length) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });

  // Check for existing ban
  const { rows: banRows } = await query(
    `SELECT id FROM group_bans
     WHERE group_id = $1 AND user_id = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
    [req.params.id, req.user.id]
  );
  if (banRows.length) return res.status(403).json({ error: 'You are banned from this group', code: 'BANNED' });

  // Check existing membership
  const { rows: existing } = await query(
    'SELECT id, status FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (existing.length && existing[0].status === 'active') {
    return res.status(409).json({ error: 'Already a member', code: 'ALREADY_MEMBER' });
  }

  // UPSERT — re-join if previously left
  const { rows } = await query(
    `INSERT INTO group_memberships (group_id, user_id, status, agreed_at)
     VALUES ($1, $2, 'active', NOW())
     ON CONFLICT (group_id, user_id) DO UPDATE
       SET status = 'active', agreed_at = NOW()
     RETURNING id`,
    [req.params.id, req.user.id]
  );
  return res.status(201).json({ membership_id: rows[0].id });
});

// ─── POST /groups/:id/leave ───────────────────────────────────────────────────
router.post('/:id/leave', auth, async (req, res) => {
  const { rowCount } = await query(
    `UPDATE group_memberships SET status = 'left'
     WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Active membership not found', code: 'NOT_MEMBER' });
  return res.status(200).json({ left: true });
});

// ─── GET /groups/:id/messages ─────────────────────────────────────────────────
router.get('/:id/messages', auth, async (req, res) => {
  if (!(await getActiveMembership(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Not a member of this group', code: 'NOT_MEMBER' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));
  const offset = (page - 1) * limit;

  // Pinned messages — all of them, shown fixed at top
  const { rows: pinned } = await query(
    `SELECT gm.id, u.alias,
            CASE WHEN gm.is_deleted THEN '[deleted]' ELSE gm.content END AS content,
            gm.is_pinned, gm.is_deleted, gm.created_at
     FROM group_messages gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.is_pinned = true
     ORDER BY gm.created_at DESC`,
    [req.params.id]
  );

  // Non-pinned paginated messages
  const { rows: messages } = await query(
    `SELECT gm.id, u.alias,
            CASE WHEN gm.is_deleted THEN '[deleted]' ELSE gm.content END AS content,
            gm.is_pinned, gm.is_deleted, gm.created_at
     FROM group_messages gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.is_pinned = false
     ORDER BY gm.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.params.id, limit, offset]
  );
  const { rows: countRows } = await query(
    'SELECT COUNT(*) FROM group_messages WHERE group_id = $1 AND is_pinned = false',
    [req.params.id]
  );
  const total = parseInt(countRows[0].count);

  return res.status(200).json({ messages, pinned, total, page, pages: Math.ceil(total / limit) });
});

// ─── POST /groups/:id/messages ────────────────────────────────────────────────
router.post('/:id/messages', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can post in groups', code: 'ADMIN_ONLY' });
  }

  if (!(await getActiveMembership(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Not a member of this group', code: 'NOT_MEMBER' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  const cleanContent = stripHtml(content);
  if (cleanContent.length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  if (cleanContent.length > MAX_MSG_LEN) {
    return res.status(400).json({ error: `Message must be ${MAX_MSG_LEN} characters or fewer`, code: 'CONTENT_TOO_LONG' });
  }

  const { rows } = await query(
    'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
    [req.params.id, req.user.id, cleanContent]
  );
  const messageId = rows[0].id;

  // Notify all active members with notif_group_messages=true except poster
  const payload = JSON.stringify({ group_id: req.params.id, message_id: messageId });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT u.id, 'group_message', $1, 'in_app'
       FROM group_memberships gm
       JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $2
        AND gm.status = 'active'
        AND gm.user_id != $3
        AND u.notif_group_messages = true`,
    [payload, req.params.id, req.user.id]
  );

  return res.status(201).json({ message_id: messageId });
});

// ─── POST /groups/:id/messages/:msgId/report ──────────────────────────────────
router.post('/:id/messages/:msgId/report', auth, async (req, res) => {
  const { reason, details } = req.body;
  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `reason must be one of: ${VALID_REASONS.join(', ')}`,
      code: 'INVALID_REASON',
    });
  }

  // Confirm message belongs to this group
  const { rows: msgRows } = await query(
    'SELECT user_id FROM group_messages WHERE id = $1 AND group_id = $2',
    [req.params.msgId, req.params.id]
  );
  if (!msgRows.length) return res.status(404).json({ error: 'Message not found', code: 'NOT_FOUND' });

  const reportedUserId = msgRows[0].user_id;

  const { rows } = await query(
    `INSERT INTO group_reports
       (group_id, reported_user_id, reported_by, message_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.params.id, reportedUserId, req.user.id, req.params.msgId, reason, details || null]
  );

  // Alert admins — in-app
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'emergency_alert', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
    [JSON.stringify({ source: 'group_report', report_id: rows[0].id, group_id: req.params.id })]
  );

  return res.status(201).json({ report_id: rows[0].id });
});

// ─── GET /groups/:id/feed ─────────────────────────────────────────────────────
// Returns: group meta, latest announcement, active prompt + response count,
// paginated responses (only if there's an active prompt).
// Members only.
router.get('/:id/feed', auth, async (req, res) => {
  const { rows: memberRows } = await query(
    'SELECT status FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  const membership = memberRows[0] || null;
  if (!membership || membership.status !== 'active') {
    return res.status(403).json({ error: 'Not a member of this group', code: 'NOT_MEMBER' });
  }

  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const [groupResult, announcementResult, promptResult] = await Promise.all([
    query(
      `SELECT g.id, g.name, g.condition_category, g.description,
              COUNT(gm.id) FILTER (WHERE gm.status = 'active') AS member_count
       FROM groups g
       LEFT JOIN group_memberships gm ON gm.group_id = g.id
       WHERE g.id = $1 AND g.is_active = true
       GROUP BY g.id`,
      [req.params.id]
    ),
    query(
      `SELECT id, content, created_at FROM group_messages
       WHERE group_id = $1 AND post_type = 'announcement' AND is_deleted = false
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    ),
    query(
      `SELECT gm.id, gm.content, gm.created_at,
              (SELECT COUNT(*) FROM group_messages r
               WHERE r.parent_id = gm.id AND r.post_type = 'response' AND r.is_deleted = false
              ) AS response_count
       FROM group_messages gm
       WHERE gm.group_id = $1 AND gm.post_type = 'prompt' AND gm.is_deleted = false
       ORDER BY gm.created_at DESC LIMIT 1`,
      [req.params.id]
    ),
  ]);

  if (!groupResult.rows.length) {
    return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });
  }

  const group        = groupResult.rows[0];
  const announcement = announcementResult.rows[0] || null;
  const prompt       = promptResult.rows[0] || null;

  let responses = [];
  let pages = 0;

  if (prompt) {
    const [{ rows: responseRows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT gm.id, u.alias, gm.content, gm.created_at
         FROM group_messages gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.parent_id = $1 AND gm.post_type = 'response' AND gm.is_deleted = false
         ORDER BY gm.created_at ASC
         LIMIT $2 OFFSET $3`,
        [prompt.id, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM group_messages
         WHERE parent_id = $1 AND post_type = 'response' AND is_deleted = false`,
        [prompt.id]
      ),
    ]);
    responses = responseRows;
    pages = Math.ceil(parseInt(countRows[0].count) / limit);
  }

  return res.status(200).json({
    group: { ...group, is_member: true },
    announcement,
    prompt,
    responses,
    page,
    pages,
  });
});

// ─── POST /groups/:id/respond ─────────────────────────────────────────────────
// Member submits a response to the active prompt. Runs risk classification:
//   critical|high → hold (is_deleted=true), notify admin
//   medium        → publish, risk_flagged=true, notify admin (category only)
//   null          → publish clean
router.post('/:id/respond', auth, async (req, res) => {
  if (!(await getActiveMembership(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Not a member of this group', code: 'NOT_MEMBER' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  const cleanContent = stripHtml(content).trim();
  if (cleanContent.length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  if (cleanContent.length > RESPONSE_MAX_LEN) {
    return res.status(400).json({
      error: `Response must be ${RESPONSE_MAX_LEN} characters or fewer`,
      code: 'CONTENT_TOO_LONG',
    });
  }

  // Must have an active prompt to respond to
  const { rows: promptRows } = await query(
    `SELECT id FROM group_messages
     WHERE group_id = $1 AND post_type = 'prompt' AND is_deleted = false
     ORDER BY created_at DESC LIMIT 1`,
    [req.params.id]
  );
  if (!promptRows.length) {
    return res.status(400).json({ error: 'No active prompt to respond to', code: 'NO_PROMPT' });
  }
  const promptId = promptRows[0].id;

  const hit      = classify(cleanContent);
  const severity = hit?.severity || null;
  const isHeld   = severity === 'critical' || severity === 'high';
  const isFlagged = severity === 'medium';

  const { rows } = await query(
    `INSERT INTO group_messages
       (group_id, user_id, content, post_type, parent_id, is_deleted, risk_flagged)
     VALUES ($1, $2, $3, 'response', $4, $5, $6)
     RETURNING id`,
    [req.params.id, req.user.id, cleanContent, promptId, isHeld, isFlagged]
  );
  const messageId = rows[0].id;

  if (isHeld || isFlagged) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT id, 'emergency_alert', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
      [JSON.stringify({
        source: 'group_response',
        group_id: req.params.id,
        message_id: messageId,
        held: isHeld,
        category: hit.category,
        keyword: hit.keyword,
      })]
    );
  }

  // Neutral response regardless of outcome — user never learns classification result
  return res.status(201).json({ message_id: messageId });
});

// ─── POST /groups/:id/prompt ──────────────────────────────────────────────────
// Admin only: post a new weekly prompt. Previous prompts are NOT deleted —
// new one is simply the most-recent prompt by created_at.
router.post('/:id/prompt', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only', code: 'FORBIDDEN' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  const cleanContent = stripHtml(content).trim();
  if (cleanContent.length > RESPONSE_MAX_LEN) {
    return res.status(400).json({
      error: `Prompt must be ${RESPONSE_MAX_LEN} characters or fewer`,
      code: 'CONTENT_TOO_LONG',
    });
  }

  const { rows: groupRows } = await query(
    'SELECT id FROM groups WHERE id = $1 AND is_active = true', [req.params.id]
  );
  if (!groupRows.length) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });

  const { rows } = await query(
    `INSERT INTO group_messages (group_id, user_id, content, post_type)
     VALUES ($1, $2, $3, 'prompt') RETURNING id`,
    [req.params.id, req.user.id, cleanContent]
  );
  return res.status(201).json({ prompt_id: rows[0].id });
});

// ─── POST /groups/:id/announce ────────────────────────────────────────────────
// Admin only: post an announcement (broadcast, no replies).
router.post('/:id/announce', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only', code: 'FORBIDDEN' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  const cleanContent = stripHtml(content).trim();
  if (cleanContent.length > MAX_MSG_LEN) {
    return res.status(400).json({
      error: `Announcement must be ${MAX_MSG_LEN} characters or fewer`,
      code: 'CONTENT_TOO_LONG',
    });
  }

  const { rows: groupRows } = await query(
    'SELECT id FROM groups WHERE id = $1 AND is_active = true', [req.params.id]
  );
  if (!groupRows.length) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });

  const { rows } = await query(
    `INSERT INTO group_messages (group_id, user_id, content, post_type)
     VALUES ($1, $2, $3, 'announcement') RETURNING id`,
    [req.params.id, req.user.id, cleanContent]
  );

  // Notify all active members
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT gm.user_id, 'group_message', $1, 'in_app'
     FROM group_memberships gm
     WHERE gm.group_id = $2 AND gm.status = 'active' AND gm.user_id != $3
       AND EXISTS(SELECT 1 FROM users u WHERE u.id = gm.user_id AND u.notif_group_messages = true)`,
    [JSON.stringify({ group_id: req.params.id, message_id: rows[0].id }), req.params.id, req.user.id]
  );

  return res.status(201).json({ announcement_id: rows[0].id });
});

// ─── DELETE /groups/:id/responses/:msgId ─────────────────────────────────────
// Admin only: soft-delete a member response (sets is_deleted=true).
router.delete('/:id/responses/:msgId', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only', code: 'FORBIDDEN' });
  }

  const { rowCount } = await query(
    `UPDATE group_messages SET is_deleted = true, deleted_by = $1
     WHERE id = $2 AND group_id = $3 AND post_type = 'response' AND is_deleted = false`,
    [req.user.id, req.params.msgId, req.params.id]
  );
  if (!rowCount) {
    return res.status(404).json({ error: 'Response not found', code: 'NOT_FOUND' });
  }
  return res.status(200).json({ removed: true });
});

module.exports = router;
