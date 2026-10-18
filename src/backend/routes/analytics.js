const express = require('express');
const { query } = require('../db');
const { verifyToken } = require('../utils/jwt');
const { publicFormLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const VALID_EVENTS = new Set([
  'session_start',
  'peer_request_created',
  'peer_session_completed',
  'ai_session_completed',
]);

// POST /analytics/event — no auth required; user_id extracted from token if present
router.post('/event', publicFormLimiter, async (req, res) => {
  const { event_name, properties } = req.body;

  if (!event_name || !VALID_EVENTS.has(event_name)) {
    return res.status(400).json({ error: 'Invalid event_name', code: 'INVALID_EVENT' });
  }

  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(authHeader.slice(7));
      userId = payload?.sub ?? null;
    } catch { /* anonymous if token invalid */ }
  }

  // Non-fatal — analytics must never break the app
  query(
    'INSERT INTO events (user_id, event_name, properties) VALUES ($1, $2, $3)',
    [userId, event_name, JSON.stringify(properties ?? {})]
  ).catch(() => {});

  return res.status(200).json({ ok: true });
});

module.exports = router;
