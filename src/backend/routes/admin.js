const express = require('express');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const cache = require('../services/cache');
const { refundCredit } = require('../utils/creditDeductor');

const router = express.Router();

// All routes in this file require admin role verified from DB.
router.use(adminAuth);

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
  return res.status(200).json({ resolved_at: rows[0].resolved_at });
});

// ─── PATCH /admin/reports/:id/action ─────────────────────────────────────────
router.patch('/reports/:id/action', async (req, res) => {
  const { action, admin_notes } = req.body;
  if (!['warn', 'ban', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'action must be one of: warn, ban, dismiss', code: 'INVALID_ACTION' });
  }

  const { rows: reportRows } = await query(
    `SELECT gr.id, gr.group_id, gr.reported_user_id, gr.status
     FROM group_reports gr WHERE gr.id = $1`,
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
            tr.created_at, tr.updated_at, u.alias
     FROM therapist_referrals tr
     JOIN users u ON u.id = tr.user_id
     ${where}
     ORDER BY tr.created_at ASC`,
    params
  );

  // Attach expressed therapist interests to each referral
  for (const referral of rows) {
    const { rows: interests } = await query(
      `SELECT ti.id, ti.status,
              tp.display_name, tp.photo_url, tp.availability_status, tp.specializations
       FROM therapist_interests ti
       JOIN therapist_profiles tp ON tp.id = ti.therapist_id
       WHERE ti.referral_id = $1
       ORDER BY ti.created_at ASC`,
      [referral.id]
    );
    referral.interests = interests;
  }

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
    'SELECT user_id FROM therapist_referrals WHERE id = $1',
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
router.post('/therapists', async (req, res) => {
  const {
    email, password,
    display_name, full_name, credentials, years_experience,
    specializations, languages, session_formats, location,
    statement, plain_language_intro, cultural_competencies, approach_plain,
    photo_url, availability_status,
  } = req.body;

  if (!email || !password || !display_name || !full_name || !credentials) {
    return res.status(400).json({
      error: 'email, password, display_name, full_name, and credentials are required',
      code: 'MISSING_FIELDS',
    });
  }

  const bcrypt = require('bcrypt');
  const { generateAlias } = require('../utils/aliasGenerator');

  const passwordHash = await bcrypt.hash(password, 12);
  const alias = await generateAlias();

  const { rows: userRows } = await query(
    `INSERT INTO users (email, password_hash, alias, role, consent_version, email_verified)
     VALUES ($1, $2, $3, 'therapist', '1.0', true)
     RETURNING id`,
    [email.toLowerCase().trim(), passwordHash, alias]
  );
  const userId = userRows[0].id;

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
    `SELECT user_id, permission_id, resolved FROM permission_flags WHERE id = $1`,
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

  return res.json({ resolved: true, action_taken });
});

module.exports = router;
