const express = require('express');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const cache = require('../services/cache');
const { refundCredit } = require('../utils/creditDeductor');
const { getConfig, invalidateConfig } = require('../utils/config');

const router = express.Router();

// All routes in this file require admin role verified from DB.
router.use(adminAuth);

async function auditLog(adminId, action, targetType, targetId, targetAlias, beforeValue, afterValue) {
  await query(
    `INSERT INTO admin_audit_log
       (admin_id, action, target_type, target_id, target_alias, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminId, action, targetType || null, targetId != null ? String(targetId) : null,
     targetAlias || null, beforeValue || null, afterValue || null]
  ).catch((e) => console.error('[audit]', e.message));
}

// ─── GET /admin/reports ───────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  const [groupResult, peerResult] = await Promise.all([
    query(
      `SELECT gr.id, 'group' AS report_type, gr.reason AS reason, gr.details, gr.status, gr.created_at,
              g.name AS group_name, NULL AS channel, NULL AS description,
              ru.alias AS reported_alias,
              rb.alias AS reporter_alias,
              gm.content AS message_preview
       FROM group_reports gr
       JOIN groups g ON g.id = gr.group_id
       JOIN users ru ON ru.id = gr.reported_user_id
       JOIN users rb ON rb.id = gr.reported_by
       LEFT JOIN group_messages gm ON gm.id = gr.message_id
       WHERE gr.status = 'pending'
       ORDER BY gr.created_at ASC`
    ),
    query(
      `SELECT pr.id, 'peer' AS report_type, NULL AS reason, NULL AS details, pr.status, pr.created_at,
              NULL AS group_name, pr.channel, pr.description,
              pr.peer_alias AS reported_alias,
              u.alias AS reporter_alias,
              NULL AS message_preview
       FROM peer_reports pr
       JOIN users u ON u.id = pr.reporter_id
       WHERE pr.status = 'open'
       ORDER BY pr.created_at ASC`
    ),
  ]);
  const reports = [...groupResult.rows, ...peerResult.rows]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return res.status(200).json({ reports });
});

// ─── PATCH /admin/emergency/:id/acknowledge ───────────────────────────────────
router.patch('/emergency/:id/acknowledge', async (req, res) => {
  const { rows } = await query(
    `UPDATE emergency_logs
        SET status = 'acknowledged', acknowledged_at = NOW(), handled_by = $1
      WHERE id = $2 AND status = 'open'
      RETURNING acknowledged_at`,
    [req.user.id, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Log not found or already acknowledged', code: 'NOT_FOUND' });
  await auditLog(req.user.id, 'emergency.acknowledge', 'emergency', req.params.id, null, 'open', 'acknowledged');
  return res.status(200).json({ acknowledged_at: rows[0].acknowledged_at });
});

// ─── PATCH /admin/emergency/:id/resolve ──────────────────────────────────────
router.patch('/emergency/:id/resolve', async (req, res) => {
  const { rows } = await query(
    `UPDATE emergency_logs
        SET status = 'resolved', resolved_at = NOW()
      WHERE id = $1 AND status IN ('open', 'acknowledged')
      RETURNING resolved_at`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Log not found or already resolved', code: 'NOT_FOUND' });
  await auditLog(req.user.id, 'emergency.resolve', 'emergency', req.params.id, null, null, 'resolved');
  return res.status(200).json({ resolved_at: rows[0].resolved_at });
});

// ─── PATCH /admin/reports/:id/action ─────────────────────────────────────────
router.patch('/reports/:id/action', async (req, res) => {
  const { action, admin_notes } = req.body;
  if (!['warn', 'ban', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'action must be one of: warn, ban, dismiss', code: 'INVALID_ACTION' });
  }

  const { rows: reportRows } = await query(
    `SELECT gr.id, gr.group_id, gr.reported_user_id, gr.status, u.alias AS reported_alias
     FROM group_reports gr
     JOIN users u ON u.id = gr.reported_user_id
     WHERE gr.id = $1`,
    [req.params.id]
  );
  if (!reportRows.length) return res.status(404).json({ error: 'Report not found', code: 'NOT_FOUND' });
  if (reportRows[0].status !== 'pending') {
    return res.status(409).json({ error: 'Report already actioned', code: 'ALREADY_REVIEWED' });
  }

  const { group_id, reported_user_id } = reportRows[0];

  if (action === 'warn') {
    await query(
      `UPDATE group_reports
          SET status = 'actioned', admin_action = 'warn', admin_notes = $1, reviewed_at = NOW()
        WHERE id = $2`,
      [admin_notes || null, req.params.id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'group_warning', $2, 'in_app')`,
      [reported_user_id, JSON.stringify({ group_id, admin_notes })]
    );
  } else if (action === 'ban') {
    const banReason = admin_notes || 'Community guidelines violation';
    // Write ban record
    await query(
      `INSERT INTO group_bans (group_id, user_id, reason, banned_by)
       VALUES ($1, $2, $3, $4)`,
      [group_id, reported_user_id, banReason, req.user.id]
    );
    // Revoke membership
    await query(
      `UPDATE group_memberships SET status = 'banned'
       WHERE group_id = $1 AND user_id = $2`,
      [group_id, reported_user_id]
    );
    // Action the report
    await query(
      `UPDATE group_reports
          SET status = 'actioned', admin_action = 'ban', admin_notes = $1, reviewed_at = NOW()
        WHERE id = $2`,
      [admin_notes || null, req.params.id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'group_warning', $2, 'in_app')`,
      [reported_user_id, JSON.stringify({ group_id, admin_notes: banReason, action: 'ban' })]
    );
  } else {
    // dismiss
    await query(
      `UPDATE group_reports
          SET status = 'dismissed', admin_action = 'dismiss', admin_notes = $1, reviewed_at = NOW()
        WHERE id = $2`,
      [admin_notes || null, req.params.id]
    );
  }

  await auditLog(req.user.id, `report.${action}`, 'report', req.params.id, reportRows[0].reported_alias, 'pending', action);
  return res.status(200).json({ action_taken: action });
});

// ─── GET /admin/emergency-queue ───────────────────────────────────────────────
router.get('/emergency-queue', async (req, res) => {
  const { rows } = await query(
    `SELECT el.id, el.status, el.trigger_type, el.triggered_at, el.acknowledged_at,
            u.alias
     FROM emergency_logs el
     JOIN users u ON u.id = el.user_id
     WHERE el.status IN ('open', 'acknowledged')
     ORDER BY el.triggered_at ASC`
  );
  return res.status(200).json({ queue: rows });
});

// ─── GET /admin/escalations ───────────────────────────────────────────────────
router.get('/escalations', async (req, res) => {
  const { rows } = await query(
    `SELECT pr.id, pr.channel_preference, pr.escalated_at, pr.created_at,
            u.alias
     FROM peer_requests pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.status = 'escalated'
     ORDER BY pr.escalated_at ASC`
  );
  return res.status(200).json({ escalations: rows });
});

// ─── PATCH /admin/escalations/:id/resolve ─────────────────────────────────────
router.patch('/escalations/:id/resolve', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE peer_requests SET status = 'closed', updated_at = NOW()
     WHERE id = $1 AND status = 'escalated'`,
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Escalation not found or already resolved', code: 'NOT_FOUND' });
  await auditLog(req.user.id, 'escalation.resolve', 'escalation', req.params.id, null, 'escalated', 'closed');
  return res.status(200).json({ resolved: true });
});

// ─── GET /admin/referrals ─────────────────────────────────────────────────────
router.get('/referrals', async (req, res) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (req.query.status) {
    conditions.push(`tr.status = $${idx++}`);
    params.push(req.query.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT tr.id, tr.struggles, tr.specific_needs, tr.preferred_time, tr.contact_method,
            tr.status, tr.admin_notes, tr.support_style_preference,
            tr.created_at, tr.updated_at, u.alias,
            COALESCE(
              json_agg(
                json_build_object(
                  'id',                  ti.id,
                  'status',              ti.status,
                  'display_name',        tp.display_name,
                  'photo_url',           tp.photo_url,
                  'availability_status', tp.availability_status,
                  'specializations',     tp.specializations
                ) ORDER BY ti.created_at ASC
              ) FILTER (WHERE ti.id IS NOT NULL),
              '[]'
            ) AS interests
     FROM therapist_referrals tr
     JOIN users u ON u.id = tr.user_id
     LEFT JOIN therapist_interests ti ON ti.referral_id = tr.id
     LEFT JOIN therapist_profiles tp ON tp.id = ti.therapist_id
     ${where}
     GROUP BY tr.id, u.alias
     ORDER BY tr.created_at ASC`,
    params
  );

  return res.status(200).json({ referrals: rows });
});

// ─── PATCH /admin/referrals/:id ───────────────────────────────────────────────
const VALID_REFERRAL_STATUSES = ['pending', 'in_review', 'arranged', 'escalated', 'closed'];
router.patch('/referrals/:id', async (req, res) => {
  const { status, admin_notes } = req.body;

  if (status !== undefined && !VALID_REFERRAL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_REFERRAL_STATUSES.join(', ')}`, code: 'INVALID_STATUS' });
  }

  const { rows: refRows } = await query(
    'SELECT user_id, status AS before_status FROM therapist_referrals WHERE id = $1',
    [req.params.id]
  );
  if (!refRows.length) return res.status(404).json({ error: 'Referral not found', code: 'NOT_FOUND' });

  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (status !== undefined)      { setClauses.push(`status = $${idx++}`);      params.push(status); }
  if (admin_notes !== undefined) { setClauses.push(`admin_notes = $${idx++}`); params.push(admin_notes); }

  params.push(req.params.id);
  await query(
    `UPDATE therapist_referrals SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  );

  // Refund 1 credit when referral is escalated (no arrangement in 48hrs)
  if (status === 'escalated') {
    await refundCredit(
      refRows[0].user_id, 1, null, 'referral',
      'Your therapist referral could not be arranged in time. 1 credit refunded.'
    );
  }

  // Notify user of status update
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'therapist_referral_update', $2, 'in_app')`,
    [refRows[0].user_id, JSON.stringify({ referral_id: req.params.id, status, admin_notes })]
  );

  if (status !== undefined) {
    await auditLog(req.user.id, 'referral.status_change', 'referral', req.params.id, null, refRows[0].before_status, status);
  }
  return res.status(200).json({ updated: true });
});

// ─── GET /admin/risk-flags ────────────────────────────────────────────────────
router.get('/risk-flags', async (req, res) => {
  const { rows } = await query(
    `SELECT alias, risk_level, updated_at
     FROM users WHERE risk_level IN ('high', 'critical') AND is_active = true
     ORDER BY risk_level DESC, updated_at DESC`
  );
  return res.status(200).json({ flagged_users: rows });
});

// ─── PATCH /admin/risk-flags/:alias/dismiss ───────────────────────────────────
// Manually clears a risk flag back to 'low'. Nightly classifier will re-evaluate.
router.patch('/risk-flags/:alias/dismiss', async (req, res) => {
  const { rows: riskRows } = await query(
    `SELECT risk_level FROM users WHERE alias = $1 AND risk_level IN ('high', 'critical')`,
    [req.params.alias]
  );
  if (!riskRows.length) return res.status(404).json({ error: 'Risk flag not found or already cleared', code: 'NOT_FOUND' });
  const beforeRiskLevel = riskRows[0].risk_level;
  await query(
    `UPDATE users SET risk_level = 'low', updated_at = NOW() WHERE alias = $1`,
    [req.params.alias]
  );
  await auditLog(req.user.id, 'risk_flag.dismiss', 'user', null, req.params.alias, beforeRiskLevel, 'low');
  return res.status(200).json({ dismissed: true });
});

// ─── POST /admin/users/:alias/message ────────────────────────────────────────
router.post('/users/:alias/message', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required', code: 'MISSING_MESSAGE' });
  }

  const { rows } = await query('SELECT id FROM users WHERE alias = $1', [req.params.alias]);
  if (!rows.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'emergency_alert', $2, 'in_app')`,
    [rows[0].id, JSON.stringify({ admin_message: message.trim() })]
  );
  return res.status(200).json({ sent: true });
});

// ─── GET /admin/resources ─────────────────────────────────────────────────────
router.get('/resources', async (req, res) => {
  const { rows } = await query(
    `SELECT id, title, category, content_type, author_name, author_bio, source_url,
            estimated_read_minutes, tags, status, published_at, created_at, updated_at
     FROM psychoeducation_articles
     ORDER BY updated_at DESC`
  );
  return res.status(200).json({ articles: rows });
});

// ─── POST /admin/resources ────────────────────────────────────────────────────
router.post('/resources', async (req, res) => {
  const { title, category, content, estimated_read_minutes, tags,
          content_type, author_name, author_bio, source_url } = req.body;
  if (!title || !category || !content || !estimated_read_minutes) {
    return res.status(400).json({ error: 'title, category, content, and estimated_read_minutes are required', code: 'MISSING_FIELDS' });
  }
  const type = content_type === 'story' ? 'story' : 'article';

  const { rows } = await query(
    `INSERT INTO psychoeducation_articles
       (title, category, content, estimated_read_minutes, tags, content_type, author_name, author_bio, source_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [title, category, content, estimated_read_minutes, tags || null,
     type, author_name || null, author_bio || null, source_url || null, req.user.id]
  );
  return res.status(201).json({ article_id: rows[0].id });
});

// ─── PATCH /admin/resources/:id ───────────────────────────────────────────────
router.patch('/resources/:id', async (req, res) => {
  const { title, category, content, estimated_read_minutes, tags,
          content_type, author_name, author_bio, source_url } = req.body;
  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (title                  !== undefined) { setClauses.push(`title = $${idx++}`);                  params.push(title); }
  if (category               !== undefined) { setClauses.push(`category = $${idx++}`);               params.push(category); }
  if (content                !== undefined) { setClauses.push(`content = $${idx++}`);                params.push(content); }
  if (estimated_read_minutes !== undefined) { setClauses.push(`estimated_read_minutes = $${idx++}`); params.push(estimated_read_minutes); }
  if (tags                   !== undefined) { setClauses.push(`tags = $${idx++}`);                   params.push(tags); }
  if (content_type           !== undefined) { setClauses.push(`content_type = $${idx++}`);           params.push(content_type === 'story' ? 'story' : 'article'); }
  if (author_name            !== undefined) { setClauses.push(`author_name = $${idx++}`);            params.push(author_name || null); }
  if (author_bio             !== undefined) { setClauses.push(`author_bio = $${idx++}`);             params.push(author_bio || null); }
  if (source_url             !== undefined) { setClauses.push(`source_url = $${idx++}`);             params.push(source_url || null); }

  if (params.length === 0) {
    return res.status(400).json({ error: 'No fields to update', code: 'MISSING_FIELDS' });
  }

  params.push(req.params.id);
  const { rowCount } = await query(
    `UPDATE psychoeducation_articles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  );
  if (!rowCount) return res.status(404).json({ error: 'Article not found', code: 'NOT_FOUND' });
  await cache.delPattern('resources:');
  return res.status(200).json({ updated: true });
});

// ─── PATCH /admin/resources/:id/publish ──────────────────────────────────────
router.patch('/resources/:id/publish', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE psychoeducation_articles
        SET status = 'published', published_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Article not found', code: 'NOT_FOUND' });
  await cache.delPattern('resources:');
  return res.status(200).json({ published: true });
});

// ─── PATCH /admin/resources/:id/archive ──────────────────────────────────────
router.patch('/resources/:id/archive', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE psychoeducation_articles SET status = 'archived', updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Article not found', code: 'NOT_FOUND' });
  await cache.delPattern('resources:');
  return res.status(200).json({ archived: true });
});

// ─── GET /admin/feedback ─────────────────────────────────────────────────────
router.get('/feedback', async (req, res) => {
  const { rows: avgRows } = await query(
    `SELECT type, ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS count
     FROM feedback WHERE rating IS NOT NULL
     GROUP BY type ORDER BY type`
  );
  const { rows: comments } = await query(
    `SELECT type, rating, comment, created_at
     FROM feedback WHERE comment IS NOT NULL
     ORDER BY created_at DESC LIMIT 20`
  );
  return res.status(200).json({ averages: avgRows, recent_comments: comments });
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const [dau, checkins, peerSessions, aiSessions, creditsPurchased] = await Promise.all([
    query(`SELECT COUNT(DISTINCT user_id) AS count FROM moods WHERE created_at::date = $1`, [today]),
    query(`SELECT COUNT(*) AS count FROM moods WHERE created_at::date = $1`, [today]),
    query(`SELECT COUNT(*) AS count FROM sessions WHERE type = 'peer' AND started_at::date = $1`, [today]),
    query(`SELECT COUNT(*) AS count FROM sessions WHERE type = 'ai' AND started_at::date = $1`, [today]),
    query(`SELECT COALESCE(SUM(amount_credits), 0) AS total FROM credit_transactions WHERE type = 'purchase' AND status = 'confirmed' AND created_at::date = $1`, [today]),
  ]);

  return res.status(200).json({
    date: today,
    daily_active_users: parseInt(dau.rows[0].count),
    checkins_today: parseInt(checkins.rows[0].count),
    peer_sessions_today: parseInt(peerSessions.rows[0].count),
    ai_sessions_today: parseInt(aiSessions.rows[0].count),
    credits_purchased_today: parseInt(creditsPurchased.rows[0].total),
  });
});

// ─── GET /admin/stats/growth ──────────────────────────────────────────────────
// Growth and sustainability signals: user totals, MAU, conversion, peer fulfillment, AI cost.
router.get('/stats/growth', async (req, res) => {
  try {
    const AI_COST_PER_SESSION_KSH = await getConfig('ai_cost_per_session_ksh', 2.60);

    const [totalRes, mauRes, paidRes, peerRes, aiRes] = await Promise.all([
      // Total registered members
      query(`SELECT COUNT(*) AS total FROM users WHERE role = 'member'`),

      // Monthly Active Users — any session or check-in in last 30 days
      query(`
        SELECT COUNT(DISTINCT user_id) AS mau FROM (
          SELECT user_id FROM sessions  WHERE started_at  > NOW() - INTERVAL '30 days'
          UNION
          SELECT user_id FROM moods     WHERE created_at  > NOW() - INTERVAL '30 days'
        ) a
      `),

      // Users with at least one confirmed purchase
      query(`SELECT COUNT(DISTINCT user_id) AS paid FROM credit_transactions WHERE type = 'purchase' AND status = 'confirmed'`),

      // Peer fulfillment: locked/active = matched, escalated = not matched (last 30 days, excluding still-open)
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('locked','active','closed') AND escalated_at IS NULL)::int AS fulfilled,
          COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated
        FROM peer_requests
        WHERE created_at > NOW() - INTERVAL '30 days' AND status != 'open'
      `),

      // AI sessions in last 30 days (for cost estimate)
      query(`SELECT COUNT(*) AS count FROM sessions WHERE type = 'ai' AND started_at > NOW() - INTERVAL '30 days'`),
    ]);

    const totalUsers  = parseInt(totalRes.rows[0].total);
    const mau         = parseInt(mauRes.rows[0].mau);
    const paidUsers   = parseInt(paidRes.rows[0].paid);
    const fulfilled   = peerRes.rows[0].fulfilled;
    const escalated   = peerRes.rows[0].escalated;
    const aiSessions  = parseInt(aiRes.rows[0].count);

    const conversionRate   = totalUsers > 0 ? parseFloat(((paidUsers / totalUsers) * 100).toFixed(1)) : 0;
    const totalPeerHandled = fulfilled + escalated;
    const fulfillmentRate  = totalPeerHandled > 0 ? parseFloat(((fulfilled / totalPeerHandled) * 100).toFixed(1)) : null;
    const aiCostKsh        = parseFloat((aiSessions * AI_COST_PER_SESSION_KSH).toFixed(0));
    const aiCostPerMau     = mau > 0 ? parseFloat((aiCostKsh / mau).toFixed(2)) : 0;

    return res.status(200).json({
      total_users: totalUsers,
      mau,
      paid_users: paidUsers,
      conversion_rate: conversionRate,
      peer_fulfillment_rate: fulfillmentRate,
      ai_sessions_30d: aiSessions,
      ai_cost_30d_ksh: aiCostKsh,
      ai_cost_per_mau_ksh: aiCostPerMau,
    });
  } catch (err) {
    console.error('stats/growth error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch growth stats', code: 'QUERY_ERROR' });
  }
});

// ─── GET /admin/stats/daily ───────────────────────────────────────────────────
// Uses integer series offset (date - integer = date in PG) to avoid interval cast ambiguity
router.get('/stats/daily', async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
  try {
    const { rows } = await query(
      `WITH date_series AS (
         SELECT (CURRENT_DATE - n)::date AS d
         FROM generate_series(0, $1::int - 1) AS gs(n)
       )
       SELECT
         ds.d::text AS date,
         COUNT(DISTINCT m.user_id)::int    AS dau,
         COUNT(DISTINCT s_ai.id)::int      AS ai_sessions,
         COUNT(DISTINCT s_peer.id)::int    AS peer_sessions,
         COUNT(DISTINCT el.id)::int        AS emergencies,
         COUNT(DISTINCT u.id)::int         AS new_users
       FROM date_series ds
       LEFT JOIN moods          m      ON m.created_at::date      = ds.d
       LEFT JOIN sessions       s_ai   ON s_ai.started_at::date   = ds.d AND s_ai.type  = 'ai'
       LEFT JOIN sessions       s_peer ON s_peer.started_at::date = ds.d AND s_peer.type = 'peer'
       LEFT JOIN emergency_logs el     ON el.triggered_at::date   = ds.d
       LEFT JOIN users          u      ON u.created_at::date      = ds.d AND u.role      = 'member'
       GROUP BY ds.d
       ORDER BY ds.d ASC`,
      [days]
    );
    return res.status(200).json({ days, series: rows });
  } catch (err) {
    console.error('stats/daily error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch daily stats', code: 'QUERY_ERROR' });
  }
});

// ─── GET /admin/users/patterns ────────────────────────────────────────────────
// therapist_interests uses member_user_id; valid statuses: pending|matched|closed
router.get('/users/patterns', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         u.alias,
         u.last_checkin_at,
         (SELECT COUNT(*) FROM emergency_logs el    WHERE el.user_id = u.id)::int AS emergency_count,
         (SELECT COUNT(*) FROM therapist_interests ti WHERE ti.member_user_id = u.id AND ti.status NOT IN ('matched','closed'))::int AS open_referrals,
         (SELECT COUNT(*) FROM sessions s            WHERE s.user_id = u.id AND s.type = 'peer' AND s.started_at > NOW() - INTERVAL '7 days')::int AS peer_sessions_7d
       FROM users u
       WHERE u.role = 'member' AND u.is_active = true
         AND (
           (SELECT COUNT(*) FROM emergency_logs el    WHERE el.user_id = u.id) >= 3
           OR
           (SELECT COUNT(*) FROM therapist_interests ti WHERE ti.member_user_id = u.id AND ti.status NOT IN ('matched','closed')) >= 2
           OR
           (SELECT COUNT(*) FROM sessions s            WHERE s.user_id = u.id AND s.type = 'peer' AND s.started_at > NOW() - INTERVAL '7 days') >= 5
         )
       ORDER BY emergency_count DESC, peer_sessions_7d DESC`
    );
    return res.status(200).json({ patterns: rows });
  } catch (err) {
    console.error('users/patterns error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch patterns', code: 'QUERY_ERROR' });
  }
});

// ─── GET /admin/therapists ────────────────────────────────────────────────────
router.get('/therapists', async (req, res) => {
  const { rows } = await query(
    `SELECT tp.id, tp.display_name, tp.full_name, tp.photo_url, tp.credentials,
            tp.years_experience, tp.specializations, tp.languages, tp.session_formats,
            tp.location, tp.statement, tp.plain_language_intro, tp.cultural_competencies,
            tp.approach_plain, tp.availability_status, tp.is_active, tp.created_at
     FROM therapist_profiles tp
     ORDER BY tp.created_at DESC`
  );
  return res.status(200).json({ therapists: rows });
});

// ─── POST /admin/therapists ───────────────────────────────────────────────────
// Creates a user with role=therapist then inserts a therapist_profiles row.
// No password is ever set by admin — an invite email with a set-password link is sent instead.
router.post('/therapists', async (req, res) => {
  const {
    email,
    display_name, full_name, credentials, years_experience,
    specializations, languages, session_formats, location,
    statement, plain_language_intro, cultural_competencies, approach_plain,
    photo_url, availability_status,
  } = req.body;

  if (!email || !display_name || !full_name || !credentials) {
    return res.status(400).json({
      error: 'email, display_name, full_name, and credentials are required',
      code: 'MISSING_FIELDS',
    });
  }

  const crypto = require('crypto');
  const bcrypt = require('bcrypt');
  const { generateAlias } = require('../utils/aliasGenerator');
  const { sendTherapistInvite } = require('../services/emailService');

  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const alias = await generateAlias();

  const { rows: userRows } = await query(
    `INSERT INTO users (email, password_hash, alias, role, consent_version, email_verified)
     VALUES ($1, $2, $3, 'therapist', '1.0', true)
     RETURNING id`,
    [email.toLowerCase().trim(), placeholderHash, alias]
  );
  const userId = userRows[0].id;

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteHash  = crypto.createHash('sha256').update(inviteToken).digest('hex');
  await query(
    `UPDATE users SET reset_token_hash = $1, reset_token_expires = NOW() + INTERVAL '72 hours'
     WHERE id = $2`,
    [inviteHash, userId]
  );

  const { rows: profileRows } = await query(
    `INSERT INTO therapist_profiles
       (user_id, display_name, full_name, credentials, years_experience,
        specializations, languages, session_formats, location, statement,
        plain_language_intro, cultural_competencies, approach_plain,
        photo_url, availability_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      userId,
      display_name.trim(),
      full_name.trim(),
      credentials.trim(),
      years_experience || 0,
      specializations || [],
      languages || [],
      session_formats || [],
      location || null,
      statement || null,
      plain_language_intro || null,
      cultural_competencies || [],
      approach_plain || null,
      photo_url || null,
      availability_status || 'available',
    ]
  );

  try {
    await sendTherapistInvite(email.toLowerCase().trim(), display_name.trim(), inviteToken);
  } catch (err) {
    console.error('[therapist.invite] Email failed:', err.message);
  }
  await auditLog(req.user.id, 'therapist.create', 'therapist', userId, alias, null, email.toLowerCase().trim());
  return res.status(201).json({ therapist_id: profileRows[0].id, alias });
});

// ─── PATCH /admin/therapists/:id ─────────────────────────────────────────────
router.patch('/therapists/:id', async (req, res) => {
  const {
    display_name, full_name, credentials, years_experience,
    specializations, languages, session_formats, location,
    statement, plain_language_intro, cultural_competencies, approach_plain,
    photo_url, availability_status, is_active,
  } = req.body;

  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (display_name           !== undefined) { setClauses.push(`display_name = $${idx++}`);           params.push(display_name); }
  if (full_name              !== undefined) { setClauses.push(`full_name = $${idx++}`);              params.push(full_name); }
  if (credentials            !== undefined) { setClauses.push(`credentials = $${idx++}`);            params.push(credentials); }
  if (years_experience       !== undefined) { setClauses.push(`years_experience = $${idx++}`);       params.push(years_experience); }
  if (specializations        !== undefined) { setClauses.push(`specializations = $${idx++}`);        params.push(specializations); }
  if (languages              !== undefined) { setClauses.push(`languages = $${idx++}`);              params.push(languages); }
  if (session_formats        !== undefined) { setClauses.push(`session_formats = $${idx++}`);        params.push(session_formats); }
  if (location               !== undefined) { setClauses.push(`location = $${idx++}`);               params.push(location); }
  if (statement              !== undefined) { setClauses.push(`statement = $${idx++}`);              params.push(statement); }
  if (plain_language_intro   !== undefined) { setClauses.push(`plain_language_intro = $${idx++}`);   params.push(plain_language_intro); }
  if (cultural_competencies  !== undefined) { setClauses.push(`cultural_competencies = $${idx++}`);  params.push(cultural_competencies); }
  if (approach_plain         !== undefined) { setClauses.push(`approach_plain = $${idx++}`);         params.push(approach_plain); }
  if (photo_url              !== undefined) { setClauses.push(`photo_url = $${idx++}`);              params.push(photo_url); }
  if (availability_status    !== undefined) { setClauses.push(`availability_status = $${idx++}`);    params.push(availability_status); }
  if (is_active              !== undefined) { setClauses.push(`is_active = $${idx++}`);              params.push(is_active); }

  if (params.length === 0) return res.status(400).json({ error: 'No fields to update', code: 'MISSING_FIELDS' });

  params.push(req.params.id);
  const { rowCount } = await query(
    `UPDATE therapist_profiles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  );
  if (!rowCount) return res.status(404).json({ error: 'Therapist not found', code: 'NOT_FOUND' });
  await auditLog(req.user.id, 'therapist.edit', 'therapist', req.params.id, null, null, null);
  return res.status(200).json({ updated: true });
});

// ─── PATCH /admin/therapists/:id/availability ─────────────────────────────────
router.patch('/therapists/:id/availability', async (req, res) => {
  const { availability_status } = req.body;
  if (!['available', 'limited', 'unavailable'].includes(availability_status)) {
    return res.status(400).json({ error: 'availability_status must be: available, limited, or unavailable', code: 'INVALID_STATUS' });
  }
  const { rowCount } = await query(
    'UPDATE therapist_profiles SET availability_status = $1, updated_at = NOW() WHERE id = $2',
    [availability_status, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Therapist not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true });
});

// ─── PATCH /admin/therapist-interests/:id/status ──────────────────────────────
router.patch('/therapist-interests/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'matched', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be: pending, matched, or closed', code: 'INVALID_STATUS' });
  }
  const { rowCount } = await query(
    'UPDATE therapist_interests SET status = $1 WHERE id = $2',
    [status, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Interest not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true });
});

// ─── GET /admin/peer-requests ────────────────────────────────────────────────
// Live view of all peer requests from the last 24 hours — open, stuck,
// escalated, and completed — so admins can see what's happening in the queue.
router.get('/peer-requests', async (req, res) => {
  const { rows } = await query(
    `SELECT pr.id, pr.status, pr.channel_preference, pr.topic_slug,
            pr.created_at, pr.broaden_at, pr.escalate_at, pr.escalated_at,
            pr.decline_count,
            u.alias AS requester_alias,
            au.alias AS accepted_by_alias,
            s.id AS session_id, s.status AS session_status,
            pr.routing_audit
     FROM peer_requests pr
     JOIN users u ON u.id = pr.user_id
     LEFT JOIN users au ON au.id = pr.accepted_by
     LEFT JOIN sessions s ON s.id = pr.session_id
     WHERE pr.created_at > NOW() - INTERVAL '24 hours'
     ORDER BY pr.created_at DESC
     LIMIT 100`
  );
  return res.status(200).json({ peer_requests: rows });
});

// ─── GET /admin/activity ──────────────────────────────────────────────────────
// Recent cross-app activity feed: sessions started/ended, emergencies,
// peer escalations, reports — gives admins a live pulse of the platform.
router.get('/activity', async (req, res) => {
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 30));

  const [sessions, emergencies, escalations, reports] = await Promise.all([
    query(
      `SELECT 'session' AS event_type, s.id AS ref_id,
              s.type || '_' || s.channel AS sub_type,
              s.status, s.started_at AS event_at,
              u.alias
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.started_at > NOW() - INTERVAL '24 hours'
       ORDER BY s.started_at DESC LIMIT $1`,
      [limit]
    ),
    query(
      `SELECT 'emergency' AS event_type, el.id AS ref_id,
              el.trigger_type AS sub_type,
              el.status, el.triggered_at AS event_at,
              u.alias
       FROM emergency_logs el
       JOIN users u ON u.id = el.user_id
       WHERE el.triggered_at > NOW() - INTERVAL '24 hours'
       ORDER BY el.triggered_at DESC LIMIT $1`,
      [limit]
    ),
    query(
      `SELECT 'peer_escalation' AS event_type, pr.id AS ref_id,
              pr.channel_preference AS sub_type,
              pr.status, COALESCE(pr.escalated_at, pr.updated_at) AS event_at,
              u.alias
       FROM peer_requests pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.status = 'escalated'
         AND pr.updated_at > NOW() - INTERVAL '24 hours'
       ORDER BY pr.updated_at DESC LIMIT $1`,
      [limit]
    ),
    query(
      `SELECT 'report' AS event_type, pr.id AS ref_id,
              'peer' AS sub_type,
              pr.status, pr.created_at AS event_at,
              u.alias
       FROM peer_reports pr
       JOIN users u ON u.id = pr.reporter_id
       WHERE pr.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY pr.created_at DESC LIMIT $1`,
      [limit]
    ),
  ]);

  const feed = [
    ...sessions.rows,
    ...emergencies.rows,
    ...escalations.rows,
    ...reports.rows,
  ].sort((a, b) => new Date(b.event_at) - new Date(a.event_at)).slice(0, limit);

  return res.status(200).json({ feed });
});

// ─── GET /admin/competency-stats ─────────────────────────────────────────────
router.get('/competency-stats', async (req, res) => {
  const since = req.query.since
    ? new Date(req.query.since).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [matchTime, fallback, abandoned, decline, unmet, skillRates] = await Promise.all([
    query(`
      SELECT pr.topic_slug,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (s.started_at - pr.created_at))
             )::int AS median_seconds
      FROM peer_requests pr
      JOIN sessions s ON s.id = pr.session_id
      WHERE pr.created_at >= $1 AND pr.accepted_by IS NOT NULL AND pr.topic_slug IS NOT NULL
      GROUP BY pr.topic_slug ORDER BY median_seconds`, [since]),

    query(`
      SELECT topic_slug,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE routing_audit::text LIKE '%tier2_broadcast%'
                                 OR routing_audit::text LIKE '%no_peer_fallback%') AS fallbacks
      FROM peer_requests
      WHERE created_at >= $1 AND topic_slug IS NOT NULL
      GROUP BY topic_slug`, [since]),

    query(`
      SELECT COALESCE(topic_slug,'unspecified') AS topic_slug, COUNT(*) AS count
      FROM peer_requests
      WHERE status = 'escalated' AND created_at >= $1
      GROUP BY topic_slug ORDER BY count DESC`, [since]),

    query(`
      SELECT COALESCE(SUM(decline_count),0) AS total_declines,
             COUNT(*) FILTER (WHERE decline_count > 0) AS requests_with_declines,
             COUNT(*) AS total_requests
      FROM peer_requests WHERE created_at >= $1`, [since]),

    query(`
      SELECT COALESCE(topic_slug,'unspecified') AS topic_slug, COUNT(*) AS unmet
      FROM peer_requests
      WHERE status = 'escalated' AND created_at >= $1
      GROUP BY topic_slug ORDER BY unmet DESC`, [since]),

    query(`
      SELECT s.name, s.slug, s.skill_group,
             COUNT(*) FILTER (WHERE sa.completed_at IS NOT NULL) AS attempts,
             COUNT(*) FILTER (WHERE sa.passed = true) AS passed,
             ROUND(
               COUNT(*) FILTER (WHERE sa.passed = true)::numeric /
               NULLIF(COUNT(*) FILTER (WHERE sa.completed_at IS NOT NULL), 0) * 100
             , 1) AS pass_rate_pct
      FROM skills s
      LEFT JOIN skill_scenarios ss ON ss.skill_id = s.id
      LEFT JOIN skill_attempts sa ON sa.scenario_id = ss.id
      WHERE s.is_active = true
      GROUP BY s.id, s.name, s.slug, s.skill_group
      ORDER BY s.skill_group, s.name`, []),
  ]);

  return res.json({
    since,
    match_time_by_topic: matchTime.rows,
    fallback_rate_by_topic: fallback.rows,
    abandoned_by_topic: abandoned.rows,
    confidence_decline: decline.rows[0] || { total_declines: 0, requests_with_declines: 0, total_requests: 0 },
    unmet_demand_by_topic: unmet.rows,
    skill_completion_rates: skillRates.rows,
  });
});

// ─── GET /admin/permission-flags ─────────────────────────────────────────────
router.get('/permission-flags', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const resolved = req.query.resolved === 'true';

  const [{ rows: flags }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT pf.id, pf.flagged_at, pf.signal_type, pf.signal_data,
              pf.resolved, pf.action_taken, pf.reviewed_at,
              u.alias AS peer_alias, u.email AS peer_email,
              p.slug AS permission_slug, p.name AS permission_name
       FROM permission_flags pf
       JOIN users u ON u.id = pf.user_id
       JOIN permissions p ON p.id = pf.permission_id
       WHERE pf.resolved = $1
       ORDER BY pf.flagged_at DESC
       LIMIT $2 OFFSET $3`,
      [resolved, limit, offset]
    ),
    query(
      `SELECT COUNT(*) AS total FROM permission_flags WHERE resolved = $1`,
      [resolved]
    ),
  ]);

  return res.json({
    flags,
    total: Number(countRows[0].total),
    page,
    pages: Math.ceil(Number(countRows[0].total) / limit),
  });
});

// ─── PATCH /admin/permission-flags/:id/resolve ───────────────────────────────
router.patch('/permission-flags/:id/resolve', async (req, res) => {
  const { action_taken } = req.body;
  const VALID_ACTIONS = [
    'no_action', 'refresher_recommended', 'refresher_required',
    'temporary_suspension', 'revocation',
  ];
  if (!VALID_ACTIONS.includes(action_taken)) {
    return res.status(400).json({
      error: `action_taken must be one of: ${VALID_ACTIONS.join(', ')}`,
      code: 'INVALID_ACTION',
    });
  }

  const { rows: flagRows } = await query(
    `SELECT pf.user_id, pf.permission_id, pf.resolved, u.alias AS peer_alias
     FROM permission_flags pf
     JOIN users u ON u.id = pf.user_id
     WHERE pf.id = $1`,
    [req.params.id]
  );
  if (!flagRows.length) {
    return res.status(404).json({ error: 'Flag not found', code: 'NOT_FOUND' });
  }
  if (flagRows[0].resolved) {
    return res.status(409).json({ error: 'Flag already resolved', code: 'ALREADY_RESOLVED' });
  }

  const { user_id, permission_id } = flagRows[0];
  const adminId = req.user.id;

  await query(
    `UPDATE permission_flags
     SET resolved = true, action_taken = $1, reviewer_id = $2, reviewed_at = NOW()
     WHERE id = $3`,
    [action_taken, adminId, req.params.id]
  );

  if (action_taken === 'refresher_required') {
    await query(
      `UPDATE peer_permissions SET status = 'inactive'
       WHERE user_id = $1 AND permission_id = $2 AND status = 'active'`,
      [user_id, permission_id]
    );
  } else if (action_taken === 'temporary_suspension') {
    await query(
      `UPDATE peer_permissions SET status = 'suspended'
       WHERE user_id = $1 AND permission_id = $2 AND status IN ('active', 'inactive')`,
      [user_id, permission_id]
    );
  } else if (action_taken === 'revocation') {
    await query(
      `UPDATE peer_permissions
       SET status = 'revoked', revoked_by = $3, revoked_at = NOW()
       WHERE user_id = $1 AND permission_id = $2`,
      [user_id, permission_id, adminId]
    );
  }

  await auditLog(req.user.id, 'permission_flag.resolve', 'permission_flag', req.params.id, flagRows[0].peer_alias, null, action_taken);
  return res.json({ resolved: true, action_taken });
});

// ─── GET /admin/group-categories ─────────────────────────────────────────────
router.get('/group-categories', async (req, res) => {
  const { rows } = await query(
    `SELECT slug, label, sort_order FROM group_categories ORDER BY sort_order ASC, slug ASC`
  );
  return res.status(200).json({ categories: rows });
});

// ─── POST /admin/group-categories ────────────────────────────────────────────
router.post('/group-categories', async (req, res) => {
  const { slug, label } = req.body;
  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, digits, or underscores', code: 'INVALID_SLUG' });
  }
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'label is required', code: 'MISSING_FIELD' });
  }
  const { rows: maxRows } = await query(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM group_categories`);
  const nextOrder = (maxRows[0].max || 0) + 1;
  try {
    const { rows } = await query(
      `INSERT INTO group_categories (slug, label, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [slug.toLowerCase(), label.trim(), nextOrder]
    );
    return res.status(201).json({ category: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category slug already exists', code: 'DUPLICATE' });
    throw err;
  }
});

// ─── PATCH /admin/group-categories/:slug ─────────────────────────────────────
router.patch('/group-categories/:slug', async (req, res) => {
  const { label, sort_order } = req.body;
  const setClauses = [];
  const params = [];
  let idx = 1;
  if (label !== undefined)      { setClauses.push(`label = $${idx++}`);      params.push(label.trim()); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${idx++}`); params.push(sort_order); }
  if (!setClauses.length) return res.status(400).json({ error: 'No fields to update', code: 'MISSING_FIELDS' });
  params.push(req.params.slug);
  const { rowCount } = await query(
    `UPDATE group_categories SET ${setClauses.join(', ')} WHERE slug = $${idx}`,
    params
  );
  if (!rowCount) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true });
});

// ─── DELETE /admin/group-categories/:slug ────────────────────────────────────
router.delete('/group-categories/:slug', async (req, res) => {
  const { rows: usageRows } = await query(
    `SELECT COUNT(*) AS cnt FROM groups WHERE category_slug = $1`,
    [req.params.slug]
  );
  if (parseInt(usageRows[0].cnt) > 0) {
    return res.status(409).json({ error: 'Category is in use by one or more groups', code: 'IN_USE' });
  }
  const { rowCount } = await query(`DELETE FROM group_categories WHERE slug = $1`, [req.params.slug]);
  if (!rowCount) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
  return res.status(200).json({ deleted: true });
});

// ─── POST /admin/groups ──────────────────────────────────────────────────────
router.post('/groups', async (req, res) => {
  const { name, category_slug, description } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required', code: 'MISSING_FIELD' });
  }

  const { rows: catRows } = await query(
    `SELECT slug FROM group_categories WHERE slug = $1`, [category_slug]
  );
  if (!catRows.length) {
    return res.status(400).json({ error: 'category_slug is not a valid category', code: 'INVALID_CATEGORY' });
  }

  const { rows } = await query(
    `INSERT INTO groups (name, category_slug, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name.trim(), category_slug, description?.trim() || null, req.user.id]
  );
  return res.status(201).json({ group_id: rows[0].id });
});

// ─── GET /admin/groups ───────────────────────────────────────────────────────
router.get('/groups', async (req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.name, g.category_slug, gc.label AS category_label,
            g.description, g.is_active, g.created_at,
            COUNT(gm.id) FILTER (WHERE gm.status = 'active') AS member_count,
            (SELECT MAX(gm2.created_at) FROM group_messages gm2
             WHERE gm2.group_id = g.id AND gm2.is_deleted = false) AS last_post_at
     FROM groups g
     JOIN group_categories gc ON gc.slug = g.category_slug
     LEFT JOIN group_memberships gm ON gm.group_id = g.id
     GROUP BY g.id, gc.label
     ORDER BY g.name ASC`
  );
  return res.status(200).json({ groups: rows });
});

// ─── PATCH /admin/groups/:id ─────────────────────────────────────────────────
router.patch('/groups/:id', async (req, res) => {
  const { name, category_slug, description } = req.body;
  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty', code: 'MISSING_FIELD' });
    setClauses.push(`name = $${idx++}`); params.push(name.trim());
  }
  if (category_slug !== undefined) {
    const { rows: catRows } = await query(`SELECT slug FROM group_categories WHERE slug = $1`, [category_slug]);
    if (!catRows.length) return res.status(400).json({ error: 'category_slug is not valid', code: 'INVALID_CATEGORY' });
    setClauses.push(`category_slug = $${idx++}`); params.push(category_slug);
  }
  if (description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(description?.trim() || null); }

  if (params.length === 0) return res.status(400).json({ error: 'No fields to update', code: 'MISSING_FIELDS' });

  params.push(req.params.id);
  const { rowCount } = await query(
    `UPDATE groups SET ${setClauses.join(', ')} WHERE id = $${idx}`, params
  );
  if (!rowCount) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true });
});

// ─── PATCH /admin/groups/:id/status ──────────────────────────────────────────
router.patch('/groups/:id/status', async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be boolean', code: 'INVALID_FIELD' });
  }
  const { rowCount } = await query(
    `UPDATE groups SET is_active = $1, updated_at = NOW() WHERE id = $2`,
    [is_active, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });
  return res.status(200).json({ updated: true, is_active });
});

// ─── DELETE /admin/groups/:id ─────────────────────────────────────────────────
router.delete('/groups/:id', async (req, res) => {
  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS cnt FROM group_memberships WHERE group_id = $1 AND status = 'active'`,
    [req.params.id]
  );
  if (parseInt(countRows[0].cnt) > 0) {
    return res.status(409).json({ error: 'Cannot delete a group that has active members', code: 'HAS_MEMBERS' });
  }
  const { rowCount } = await query(`DELETE FROM groups WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });
  return res.status(200).json({ deleted: true });
});

// ─── GET /admin/groups/:id/feed ───────────────────────────────────────────────
// Group state for admin panel — no membership check. Returns live content + held responses.
router.get('/groups/:id/feed', async (req, res) => {
  const [groupResult, announcementResult, promptResult, pollResult, heldResult] = await Promise.all([
    query(
      `SELECT g.id, g.name, g.category_slug, gc.label AS category_label, g.description,
              COUNT(gm.id) FILTER (WHERE gm.status = 'active') AS member_count
       FROM groups g
       JOIN group_categories gc ON gc.slug = g.category_slug
       LEFT JOIN group_memberships gm ON gm.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.id, gc.label`,
      [req.params.id]
    ),
    query(
      `SELECT id, content, created_at
       FROM group_messages
       WHERE group_id = $1 AND post_type = 'announcement' AND is_deleted = false
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    ),
    query(
      `SELECT gm.id, gm.content, gm.created_at,
              (SELECT COUNT(*)::int FROM group_messages r
               WHERE r.parent_id = gm.id AND r.post_type = 'response' AND r.is_deleted = false
              ) AS response_count
       FROM group_messages gm
       WHERE gm.group_id = $1 AND gm.post_type = 'prompt' AND gm.is_deleted = false
       ORDER BY gm.created_at DESC LIMIT 1`,
      [req.params.id]
    ),
    query(
      `SELECT gp.id, gp.question, gp.min_votes_to_show,
              (SELECT COUNT(*)::int FROM group_poll_votes WHERE poll_id = gp.id) AS total_votes,
              json_agg(
                json_build_object('id', gpo.id, 'label', gpo.label,
                  'votes', (SELECT COUNT(*)::int FROM group_poll_votes WHERE option_id = gpo.id)
                ) ORDER BY gpo.position
              ) AS options
       FROM group_polls gp
       JOIN group_poll_options gpo ON gpo.poll_id = gp.id
       WHERE gp.group_id = $1 AND gp.is_active = true
       GROUP BY gp.id
       ORDER BY gp.created_at DESC LIMIT 1`,
      [req.params.id]
    ),
    query(
      `SELECT gm.id, gm.content, gm.created_at, gm.risk_flagged, u.alias
       FROM group_messages gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.post_type = 'response' AND gm.is_deleted = true
       ORDER BY gm.created_at DESC
       LIMIT 30`,
      [req.params.id]
    ),
  ]);

  if (!groupResult.rows.length) {
    return res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND' });
  }

  return res.status(200).json({
    group: groupResult.rows[0],
    announcement: announcementResult.rows[0] || null,
    prompt: promptResult.rows[0] || null,
    poll: pollResult.rows[0] || null,
    held: heldResult.rows,
  });
});

// ─── GET /admin/groups/held ───────────────────────────────────────────────────
// All held group responses (is_deleted=true, post_type=response) across all groups.
router.get('/groups/held', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT gm.id, gm.content, gm.created_at, gm.risk_flagged,
              u.alias,
              g.id AS group_id, g.name AS group_name,
              p.content AS prompt_content
       FROM group_messages gm
       JOIN users u ON u.id = gm.user_id
       JOIN groups g ON g.id = gm.group_id
       LEFT JOIN group_messages p ON p.id = gm.parent_id
       WHERE gm.post_type = 'response' AND gm.is_deleted = true
       ORDER BY gm.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM group_messages WHERE post_type = 'response' AND is_deleted = true`
    ),
  ]);

  return res.status(200).json({
    held: dataResult.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
  });
});

// ─── POST /admin/groups/held/:msgId/publish ───────────────────────────────────
// Publish a held response (set is_deleted=false).
router.post('/groups/held/:msgId/publish', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE group_messages SET is_deleted = false
     WHERE id = $1 AND post_type = 'response' AND is_deleted = true`,
    [req.params.msgId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Held response not found', code: 'NOT_FOUND' });
  return res.status(200).json({ published: true });
});

// ─── DELETE /admin/groups/held/:msgId ────────────────────────────────────────
// Hard-delete a held response (confirmed harmful content).
router.delete('/groups/held/:msgId', async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM group_messages WHERE id = $1 AND post_type = 'response'`,
    [req.params.msgId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Response not found', code: 'NOT_FOUND' });
  return res.status(200).json({ deleted: true });
});

// ─── GET /admin/audit-log ────────────────────────────────────────────────────
router.get('/audit-log', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 30;
  const offset = (page - 1) * limit;
  const action = req.query.action || null;

  const params = [];
  let where = '';
  if (action) {
    params.push(`${action}%`);
    where = `WHERE al.action LIKE $${params.length}`;
  }

  const [logsRes, countRes] = await Promise.all([
    query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.target_alias,
              al.before_value, al.after_value, al.created_at,
              u.alias AS admin_alias
       FROM admin_audit_log al
       JOIN users u ON u.id = al.admin_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*) AS total FROM admin_audit_log al ${where}`,
      params
    ),
  ]);

  return res.json({
    logs:  logsRes.rows,
    total: parseInt(countRes.rows[0].total),
    page,
    pages: Math.ceil(parseInt(countRes.rows[0].total) / limit),
  });
});

// ─── GET /admin/config ────────────────────────────────────────────────────────
// Returns all platform_config keys and their current values.
router.get('/config', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT key, value, updated_at FROM platform_config ORDER BY key ASC`
    );
    return res.json({ config: rows });
  } catch (err) {
    console.error('admin/config GET error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch config', code: 'QUERY_ERROR' });
  }
});

// ─── PATCH /admin/config/:key ─────────────────────────────────────────────────
// Upserts a single config key. Body: { value: any }
router.patch('/config/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: 'value is required', code: 'MISSING_VALUE' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO platform_config (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING key, value, updated_at`,
      [key, JSON.stringify(value)]
    );
    await invalidateConfig(key);
    await auditLog(req.user.id, `config.update`, 'config', key, key, null, JSON.stringify(value));
    return res.json({ config: rows[0] });
  } catch (err) {
    console.error('admin/config PATCH error:', err.message);
    return res.status(500).json({ error: 'Failed to update config', code: 'QUERY_ERROR' });
  }
});

module.exports = router;
