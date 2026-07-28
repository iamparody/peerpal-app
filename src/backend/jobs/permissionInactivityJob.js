const { query } = require('../db');

// Runs nightly at 01:00 UTC (4am Nairobi EAT).
// Expires peer_permissions that have been inactive beyond the per-row threshold.
// "Active" means: COALESCE(last_active_at, granted_at) >= NOW() - expires_if_inactive_days.
// Only the specific permission lapses — unrelated permissions on the same peer are unaffected.
// Safety invariant: no automated action can revoke a permission; only status=inactive is set here.
async function runPermissionInactivityJob() {
  // Batch-expire and return affected rows in one statement
  const { rows: expired } = await query(`
    WITH expired AS (
      UPDATE peer_permissions pp
      SET status = 'inactive'
      FROM permissions p
      WHERE pp.permission_id = p.id
        AND pp.status = 'active'
        AND COALESCE(pp.last_active_at, pp.granted_at)
            < NOW() - (pp.expires_if_inactive_days || ' days')::INTERVAL
      RETURNING
        pp.user_id,
        pp.permission_id,
        p.slug        AS permission_slug,
        p.name        AS permission_name,
        pp.expires_if_inactive_days,
        EXTRACT(DAYS FROM (
          NOW() - COALESCE(pp.last_active_at, pp.granted_at)
        ))::int AS days_inactive
    )
    SELECT * FROM expired
  `);

  if (!expired.length) return;

  console.log(`[permissionInactivityJob] Lapsed ${expired.length} permission(s)`);

  for (const row of expired) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'peer_permission_inactive', $2, 'push')`,
      [
        row.user_id,
        JSON.stringify({
          permission_id:   row.permission_id,
          permission_slug: row.permission_slug,
          permission_name: row.permission_name,
          days_inactive:   row.days_inactive,
        }),
      ]
    );
  }
}

module.exports = { runPermissionInactivityJob };
