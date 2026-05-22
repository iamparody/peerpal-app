const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { escalatePeerRequest } = require('../jobs/peerEscalation');
const { ICE_SERVERS } = require('../ws/signaling');
const cache = require('../services/cache');
const { deductCredit } = require('../utils/creditDeductor');

const router = express.Router();

// In-process escalation timers: { [request_id]: Timeout }
const escalationTimers = new Map();

const VALID_CHANNELS = ['text', 'voice'];

// ─── POST /peer/request ───────────────────────────────────────────────────────
router.post('/request', auth, async (req, res) => {
  const { channel_preference } = req.body;

  if (!VALID_CHANNELS.includes(channel_preference)) {
    return res.status(400).json({
      error: `channel_preference must be one of: ${VALID_CHANNELS.join(', ')}`,
      code: 'INVALID_CHANNEL',
    });
  }

  const { rows: reqRows } = await query(
    `INSERT INTO peer_requests (user_id, channel_preference)
     VALUES ($1, $2) RETURNING id`,
    [req.user.id, channel_preference]
  );
  const requestId = reqRows[0].id;

  // Deduct credits at submission: 1cr text, 2cr voice
  const creditCost = channel_preference === 'voice' ? 2 : 1;
  const { blocked } = await deductCredit(req.user.id, creditCost, null, channel_preference);
  if (blocked) {
    await query('DELETE FROM peer_requests WHERE id = $1', [requestId]);
    return res.status(402).json({ error: 'Insufficient credits — top up to request peer support', code: 'INSUFFICIENT_CREDITS' });
  }

  // Broadcast to all active members except requester — push + in-app
  const notifPayload = JSON.stringify({ request_id: requestId, channel_preference });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'peer_request_broadcast', $1, 'push'
       FROM users WHERE id != $2 AND is_active = true AND role = 'member'`,
    [notifPayload, req.user.id]
  );
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'peer_request_broadcast', $1, 'in_app'
       FROM users WHERE id != $2 AND is_active = true AND role = 'member'`,
    [notifPayload, req.user.id]
  );

  // 90s escalation timer
  const timer = setTimeout(async () => {
    escalationTimers.delete(requestId);
    try { await escalatePeerRequest(requestId); } catch (e) { console.error('Escalation error:', e); }
  }, 90000);
  escalationTimers.set(requestId, timer);

  // Store request_id as the job identifier so the DB record is auditable
  await query(
    'UPDATE peer_requests SET escalation_job_id = $1, updated_at = NOW() WHERE id = $2',
    [requestId, requestId]
  );

  return res.status(201).json({ request_id: requestId });
});

// ─── GET /peer/requests/open ──────────────────────────────────────────────────
router.get('/requests/open', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, channel_preference, created_at
     FROM peer_requests
     WHERE status = 'open' AND user_id != $1
     ORDER BY created_at ASC`,
    [req.user.id]
  );
  return res.status(200).json({ requests: rows });
});

// ─── GET /peer/quiz/status ────────────────────────────────────────────────────
router.get('/quiz/status', auth, async (req, res) => {
  const { rows } = await query('SELECT peer_quiz_done FROM users WHERE id = $1', [req.user.id]);
  return res.status(200).json({ peer_quiz_done: rows[0]?.peer_quiz_done ?? false });
});

// ─── POST /peer/quiz/complete ─────────────────────────────────────────────────
router.post('/quiz/complete', auth, async (req, res) => {
  await query('UPDATE users SET peer_quiz_done = true, updated_at = NOW() WHERE id = $1', [req.user.id]);
  return res.status(200).json({ peer_quiz_done: true });
});

// ─── PATCH /peer/request/:id/accept ──────────────────────────────────────────
router.patch('/request/:id/accept', auth, async (req, res) => {
  // Quiz gate — must complete readiness check before first accept
  const { rows: quizRows } = await query('SELECT peer_quiz_done FROM users WHERE id = $1', [req.user.id]);
  if (!quizRows[0]?.peer_quiz_done) {
    return res.status(403).json({ error: 'Complete the peer readiness check first', code: 'QUIZ_REQUIRED' });
  }

  // Atomic lock — only succeeds if status is still 'open'
  const { rows: locked, rowCount } = await query(
    `UPDATE peer_requests
        SET status = 'locked', accepted_by = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'open'
      RETURNING id, channel_preference, user_id`,
    [req.user.id, req.params.id]
  );

  if (!rowCount) {
    // Either not found or already accepted/escalated
    const { rows: check } = await query('SELECT status, user_id FROM peer_requests WHERE id = $1', [req.params.id]);
    if (!check.length) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (check[0].user_id === req.user.id) return res.status(403).json({ error: 'Cannot accept your own request', code: 'FORBIDDEN' });
    return res.status(409).json({ error: 'Request is no longer open', code: 'REQUEST_UNAVAILABLE' });
  }

  const { id: requestId, channel_preference, user_id: requesterId } = locked[0];

  // Own-request guard (belt-and-suspenders — the lock query doesn't catch this)
  if (requesterId === req.user.id) {
    await query(`UPDATE peer_requests SET status = 'open', accepted_by = NULL WHERE id = $1`, [requestId]);
    return res.status(403).json({ error: 'Cannot accept your own request', code: 'FORBIDDEN' });
  }

  // Cancel the 90s escalation timer
  const timer = escalationTimers.get(requestId);
  if (timer) { clearTimeout(timer); escalationTimers.delete(requestId); }

  // Create the session (user_id = requester)
  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (user_id, type, channel, status, peer_request_id)
     VALUES ($1, 'peer', $2, 'active', $3) RETURNING id`,
    [requesterId, channel_preference, requestId]
  );
  const sessionId = sessionRows[0].id;

  // Activate the peer request with the session
  await query(
    `UPDATE peer_requests SET session_id = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
    [sessionId, requestId]
  );

  // Backfill session_id on the requester's debit transaction (created at submission with session_id=NULL)
  await query(
    `UPDATE credit_transactions
     SET session_id = $1
     WHERE id = (
       SELECT id FROM credit_transactions
       WHERE user_id = $2 AND channel = $3 AND type = 'debit' AND session_id IS NULL
       ORDER BY created_at DESC LIMIT 1
     )`,
    [sessionId, requesterId, channel_preference]
  );

  // Notify requester — in-app only (blueprint: session_confirmation)
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'session_confirmation', $2, 'in_app')`,
    [requesterId, JSON.stringify({ session_id: sessionId, channel: channel_preference })]
  );

  return res.status(200).json({ session_id: sessionId, channel: channel_preference, request_id: requestId });
});

// ─── GET /peer/request/:id/status ─────────────────────────────────────────────
// Polled by waiting screen to detect when request is accepted or escalated.
router.get('/request/:id/status', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT pr.id, pr.status, pr.channel_preference, pr.session_id
     FROM peer_requests pr
     WHERE pr.id = $1 AND pr.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  return res.status(200).json(rows[0]);
});

// ─── PATCH /peer/request/:id/close ───────────────────────────────────────────
router.patch('/request/:id/close', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT pr.id, pr.session_id, pr.user_id, pr.accepted_by
     FROM peer_requests pr WHERE pr.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });

  const { session_id, user_id: requesterId, accepted_by: responderId } = rows[0];

  if (req.user.id !== requesterId && req.user.id !== responderId) {
    return res.status(403).json({ error: 'Not a participant in this session', code: 'FORBIDDEN' });
  }

  const { rows: sessionRows } = await query(
    `UPDATE sessions SET status = 'completed', ended_at = NOW()
     WHERE id = $1 RETURNING ended_at, started_at`,
    [session_id]
  );

  await query(
    `UPDATE peer_requests SET status = 'closed', updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  );

  // Record duration on the requester's debit transaction
  if (sessionRows[0]?.started_at && sessionRows[0]?.ended_at) {
    const durationMinutes = Math.round(
      (new Date(sessionRows[0].ended_at) - new Date(sessionRows[0].started_at)) / 60000
    );
    await query(
      `UPDATE credit_transactions SET duration_minutes = $1 WHERE session_id = $2 AND type = 'debit'`,
      [durationMinutes, session_id]
    );
  }

  // Award 1 credit to the peer who accepted the session
  if (responderId) {
    await query(
      'UPDATE credits SET balance = balance + 1, updated_at = NOW() WHERE user_id = $1',
      [responderId]
    );
    await query(
      `INSERT INTO credit_transactions
         (user_id, type, amount_credits, payment_method, session_id, channel, status)
       VALUES ($1, 'bonus', 1, 'bonus', $2, 'purchase', 'confirmed')`,
      [responderId, session_id]
    );
    await cache.del(`credits:${responderId}`);
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'milestone', $2, 'in_app')`,
      [responderId, JSON.stringify({ message: 'You earned 1 credit for completing a peer session.' })]
    );
  }

  return res.status(200).json({ ended_at: sessionRows[0]?.ended_at });
});

// ─── GET /peer/session/:id ────────────────────────────────────────────────────
router.get('/session/:id', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.type, s.channel, s.status, s.credit_cost, s.started_at, s.ended_at,
            pr.id AS request_id, pr.channel_preference, pr.user_id AS requester_id, pr.accepted_by AS responder_id
     FROM sessions s
     JOIN peer_requests pr ON pr.session_id = s.id
     WHERE s.id = $1 AND s.type = 'peer'
       AND (s.user_id = $2 OR pr.accepted_by = $2)`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });

  const session = rows[0];
  return res.status(200).json({ session, ice_servers: ICE_SERVERS });
});

// ─── GET /peer/history ────────────────────────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT s.id, s.channel, s.status, s.created_at, s.ended_at
     FROM sessions s
     WHERE s.user_id = $1 AND s.type = 'peer'
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND type = 'peer'`,
    [req.user.id]
  );
  const total = parseInt(countRows[0].count);

  return res.status(200).json({ sessions: rows, total, page, pages: Math.ceil(total / limit) });
});

// ─── GET /peer/stats ─────────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  const { rows: completedRows } = await query(
    `SELECT COUNT(*) AS sessions_completed
     FROM peer_requests WHERE accepted_by = $1 AND status = 'closed'`,
    [req.user.id]
  );
  const sessionsCompleted = parseInt(completedRows[0].sessions_completed);

  // Credits earned specifically from peer sessions (session_id IS NOT NULL excludes signup bonus)
  const { rows: creditRows } = await query(
    `SELECT COALESCE(SUM(amount_credits), 0) AS credits_earned
     FROM credit_transactions
     WHERE user_id = $1 AND type = 'bonus' AND session_id IS NOT NULL`,
    [req.user.id]
  );

  // Rank: how many other peers have more completed sessions + 1
  const { rows: rankRows } = await query(
    `SELECT COUNT(*) + 1 AS rank
     FROM (
       SELECT accepted_by, COUNT(*) AS cnt
       FROM peer_requests WHERE status = 'closed' AND accepted_by IS NOT NULL
       GROUP BY accepted_by
     ) sub
     WHERE sub.cnt > $1`,
    [sessionsCompleted]
  );

  return res.status(200).json({
    sessions_completed: sessionsCompleted,
    credits_earned: parseInt(creditRows[0].credits_earned),
    rank: parseInt(rankRows[0].rank),
  });
});

// ─── GET /peer/leaderboard ────────────────────────────────────────────────────
router.get('/leaderboard', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT u.alias, COUNT(pr.id) AS sessions_completed
     FROM peer_requests pr
     JOIN users u ON u.id = pr.accepted_by
     WHERE pr.status = 'closed' AND pr.accepted_by IS NOT NULL
     GROUP BY u.alias
     ORDER BY sessions_completed DESC
     LIMIT 10`
  );
  return res.status(200).json({ leaderboard: rows });
});

module.exports = router;
