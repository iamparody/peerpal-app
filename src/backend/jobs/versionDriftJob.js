const { query } = require('../db');
const { GRACE_PERIOD_DAYS } = require('../services/policyEngine');

// Runs nightly at 02:00 UTC (5am Nairobi EAT).
// Finds active peer_permissions where a required skill has been versioned up
// AND the grace period has expired, then sets them inactive.
//
// Grace period: GRACE_PERIOD_DAYS (30) days from version_bumped_at on the skill.
// A peer has 30 days from a content update to re-complete the scenario before
// their dependent permissions lapse. This matches governance.md §4.
//
// Safety invariant: only sets status='inactive', never 'revoked'.

async function runVersionDriftJob() {
  // Find all active peer_permissions whose required skills have a version mismatch
  // and whose grace period has elapsed.
  //
  // Logic:
  //   - Get all active peer_permissions with their permission's required_skills
  //   - For each required skill, check:
  //       skill.current_version > peer_skill.scenario_version_completed
  //       AND skill.version_bumped_at < NOW() - GRACE days
  //   - If any required skill fails this check, expire the permission.

  const { rows: active } = await query(`
    SELECT pp.id       AS pp_id,
           pp.user_id,
           pp.permission_id,
           p.slug      AS permission_slug,
           p.name      AS permission_name,
           p.required_skills
    FROM peer_permissions pp
    JOIN permissions p ON p.id = pp.permission_id
    WHERE pp.status = 'active'
  `);

  if (!active.length) return;

  const toExpire = [];

  for (const pp of active) {
    const required = pp.required_skills; // [{skill_id, min_version}]

    for (const req of required) {
      const { rows } = await query(`
        SELECT s.current_version, s.version_bumped_at,
               ps.scenario_version_completed
        FROM skills s
        LEFT JOIN peer_skills ps
          ON ps.skill_id = s.id AND ps.user_id = $1
        WHERE s.id = $2
      `, [pp.user_id, req.skill_id]);

      if (!rows.length) continue;
      const { current_version, version_bumped_at, scenario_version_completed } = rows[0];

      const peerVersion = scenario_version_completed ?? 0;
      const graceCutoff = new Date(version_bumped_at);
      graceCutoff.setDate(graceCutoff.getDate() + GRACE_PERIOD_DAYS);

      if (peerVersion < current_version && new Date() > graceCutoff) {
        toExpire.push({ pp_id: pp.pp_id, user_id: pp.user_id, permission_slug: pp.permission_slug, permission_name: pp.permission_name });
        break; // one drifted skill is enough to expire the permission
      }
    }
  }

  if (!toExpire.length) return;

  console.log(`[versionDriftJob] Expiring ${toExpire.length} permission(s) due to version drift`);

  for (const row of toExpire) {
    await query(`
      UPDATE peer_permissions SET status = 'inactive'
      WHERE id = $1 AND status = 'active'
    `, [row.pp_id]);

    await query(`
      INSERT INTO notifications (user_id, type, payload, channel)
      VALUES ($1, 'peer_permission_version_drift', $2, 'push')
    `, [
      row.user_id,
      JSON.stringify({
        permission_slug: row.permission_slug,
        permission_name: row.permission_name,
        reason: 'skill_version_outdated',
      }),
    ]);
  }
}

module.exports = { runVersionDriftJob };
