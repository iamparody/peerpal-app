'use strict';
// flagAggregationJob.js
// Nightly job — 03:00 UTC (6am Nairobi EAT).
// Reads quality signals from separate tables, computes per-user thresholds,
// and inserts supervision flags into permission_flags.
//
// SAFETY INVARIANT: session_reflections is NEVER joined to permission_flags.
// Application code bridges the gap: read reflections first, compute which users
// crossed a threshold, then in a separate DB call fetch permissions and insert flags.

const { query } = require('../db');
const { SUPERVISION_THRESHOLDS } = require('../config/screening');

async function getActivePermissionIds(userId) {
  const { rows } = await query(
    `SELECT permission_id FROM peer_permissions WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  return rows.map((r) => r.permission_id);
}

async function maybeFlagPermission(userId, permissionId, signalType, signalData) {
  await query(
    `INSERT INTO permission_flags (user_id, permission_id, signal_type, signal_data)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM permission_flags
       WHERE user_id = $1 AND permission_id = $2 AND signal_type = $3 AND resolved = false
     )`,
    [userId, permissionId, signalType, JSON.stringify(signalData)]
  );
}

async function flagAllActivePermissions(userId, signalType, signalData) {
  const permissionIds = await getActivePermissionIds(userId);
  for (const permissionId of permissionIds) {
    await maybeFlagPermission(userId, permissionId, signalType, signalData);
  }
}

async function runFlagAggregationJob() {
  console.log('[flagAggregation] Starting...');
  const t = SUPERVISION_THRESHOLDS;
  let processed = 0;

  // ── Signal: low_feedback ─────────────────────────────────────────────────────
  // Source: feedback table (anonymous) + peer_requests — no session_reflections
  {
    const { rows } = await query(
      `SELECT pr.accepted_by AS peer_user_id,
              COUNT(*) FILTER (WHERE f.rating IS NOT NULL) AS rated_sessions,
              COUNT(*) FILTER (WHERE f.rating < 3)         AS low_sessions
       FROM peer_requests pr
       JOIN feedback f ON f.session_id = pr.session_id AND f.type = 'peer_session'
       WHERE pr.accepted_by IS NOT NULL
         AND f.created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY pr.accepted_by
       HAVING COUNT(*) FILTER (WHERE f.rating IS NOT NULL) >= $2`,
      [t.low_feedback.window_days, t.low_feedback.min_sessions]
    );

    for (const row of rows) {
      const ratio = Number(row.low_sessions) / Number(row.rated_sessions);
      if (ratio >= t.low_feedback.ratio) {
        await flagAllActivePermissions(row.peer_user_id, 'low_feedback', {
          rated_sessions: Number(row.rated_sessions),
          low_sessions: Number(row.low_sessions),
          ratio: ratio.toFixed(2),
          window_days: t.low_feedback.window_days,
        });
        processed++;
      }
    }
  }

  // ── Signal: moderation_intervention ─────────────────────────────────────────
  // Source: peer_reports joined to peer_requests
  {
    const { rows } = await query(
      `SELECT pr.accepted_by AS peer_user_id, COUNT(*) AS report_count
       FROM peer_reports rpt
       JOIN peer_requests pr ON pr.session_id = rpt.session_id
       WHERE pr.accepted_by IS NOT NULL
         AND rpt.created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY pr.accepted_by
       HAVING COUNT(*) >= $2`,
      [t.moderation_intervention.window_days, t.moderation_intervention.count]
    );

    for (const row of rows) {
      await flagAllActivePermissions(row.peer_user_id, 'moderation_intervention', {
        report_count: Number(row.report_count),
        window_days: t.moderation_intervention.window_days,
      });
      processed++;
    }
  }

  // ── Signal: unprepared_reflections ───────────────────────────────────────────
  // Source: session_reflections — read in isolation, never joined to permission_flags.
  // Permissions are fetched in a completely separate query below.
  {
    const { rows: reflRows } = await query(
      `SELECT peer_user_id,
              COUNT(*)                                          AS total_sessions,
              COUNT(*) FILTER (WHERE felt_prepared = false)    AS unprepared_sessions
       FROM session_reflections
       WHERE submitted_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY peer_user_id
       HAVING COUNT(*) >= $2`,
      [t.unprepared_reflections.window_days, t.unprepared_reflections.min_sessions]
    );

    for (const row of reflRows) {
      const ratio = Number(row.unprepared_sessions) / Number(row.total_sessions);
      if (ratio >= t.unprepared_reflections.ratio) {
        // Separate DB operation — no join between session_reflections and permission_flags
        await flagAllActivePermissions(row.peer_user_id, 'unprepared_reflections', {
          total_sessions: Number(row.total_sessions),
          unprepared_sessions: Number(row.unprepared_sessions),
          ratio: ratio.toFixed(2),
          window_days: t.unprepared_reflections.window_days,
        });
        processed++;
      }
    }
  }

  // ── Signal: category_drift ───────────────────────────────────────────────────
  // Source: session_reflections — read in isolation (same invariant as above).
  {
    const { rows: driftRows } = await query(
      `SELECT peer_user_id,
              COUNT(*)                                                   AS total_sessions,
              COUNT(*) FILTER (WHERE topic_stayed_in_category = false)  AS drifted_sessions
       FROM session_reflections
       WHERE submitted_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY peer_user_id
       HAVING COUNT(*) >= $2`,
      [t.category_drift.window_days, t.category_drift.min_sessions]
    );

    for (const row of driftRows) {
      const ratio = Number(row.drifted_sessions) / Number(row.total_sessions);
      if (ratio >= t.category_drift.ratio) {
        // Separate DB operation — no join between session_reflections and permission_flags
        await flagAllActivePermissions(row.peer_user_id, 'category_drift', {
          total_sessions: Number(row.total_sessions),
          drifted_sessions: Number(row.drifted_sessions),
          ratio: ratio.toFixed(2),
          window_days: t.category_drift.window_days,
        });
        processed++;
      }
    }
  }

  console.log(`[flagAggregation] Done. Users processed for flagging: ${processed}`);
}

module.exports = { runFlagAggregationJob };
