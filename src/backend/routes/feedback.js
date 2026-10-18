const express = require('express');
const { query } = require('../db');
const { publicFormLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const VALID_TYPES = ['peer_session', 'ai_chat', 'bug', 'general'];

// ─── POST /feedback ───────────────────────────────────────────────────────────
// No auth — fully anonymous by design (blueprint section 7.15)
router.post('/', publicFormLimiter, async (req, res) => {
  const { type, rating, comment, session_id } = req.body;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}`, code: 'INVALID_TYPE' });
  }
  if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'rating must be an integer 1–5', code: 'INVALID_RATING' });
  }
  if (comment && comment.length > 300) {
    return res.status(400).json({ error: 'comment must be 300 characters or fewer', code: 'COMMENT_TOO_LONG' });
  }

  const { rows } = await query(
    `INSERT INTO feedback (type, rating, comment, session_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [type, rating || null, comment || null, session_id || null]
  );
  return res.status(201).json({ feedback_id: rows[0].id });
});

module.exports = router;
