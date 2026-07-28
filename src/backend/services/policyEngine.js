/**
 * Policy Engine — Phase 31.4
 *
 * Single source of truth for all permission and prerequisite checks.
 * Used by: routes/training.js, routes/policy.js, jobs/versionDriftJob.js,
 *          and the future routing engine (Phase 31.5).
 *
 * Safety invariants enforced here:
 * - A permission is only active if status=active AND all required skills are
 *   held at or above their minimum scenario version.
 * - Prerequisite enforcement blocks skill issuance silently — callers get a
 *   clear error, not a silent false.
 * - No function here can set status=revoked; only status=inactive is set
 *   automatically. Revocation is a human action.
 */

const { query } = require('../db');
const GRACE_PERIOD_DAYS = 30;

// ─── isPermissionActive ───────────────────────────────────────────────────────
// Returns true only if:
//   1. The peer holds the permission (peer_permissions row exists)
//   2. status = 'active'
//   3. Every required skill is held (peer_skills.is_active = true) AND
//      scenario_version_completed >= required min_version
//
// This is called in the hot path of routing — keep it fast.

async function isPermissionActive(userId, permissionSlug) {
  const { rows: permRows } = await query(
    `SELECT p.id, p.required_skills
     FROM permissions p
     WHERE p.slug = $1 AND p.is_active = true`,
    [permissionSlug]
  );
  if (!permRows.length) return false;

  const { id: permId, required_skills: required } = permRows[0];

  const { rows: ppRows } = await query(
    `SELECT status FROM peer_permissions
     WHERE user_id = $1 AND permission_id = $2`,
    [userId, permId]
  );
  if (!ppRows.length || ppRows[0].status !== 'active') return false;

  // Verify every required skill at the required version
  for (const req of required) {
    const { rows } = await query(
      `SELECT ps.is_active, ps.scenario_version_completed
       FROM peer_skills ps
       WHERE ps.user_id = $1 AND ps.skill_id = $2`,
      [userId, req.skill_id]
    );
    if (!rows.length || !rows[0].is_active) return false;
    if (rows[0].scenario_version_completed < req.min_version) return false;
  }

  return true;
}

// ─── getPermissionStatus ──────────────────────────────────────────────────────
// Returns a structured status object used by GET /api/policy/permission-status.
// Also used internally to build reason strings for notifications.

async function getPermissionStatus(userId, permissionSlug) {
  const { rows: permRows } = await query(
    `SELECT p.id, p.name, p.required_skills, p.disclaimer
     FROM permissions p
     WHERE p.slug = $1 AND p.is_active = true`,
    [permissionSlug]
  );
  if (!permRows.length) return { held: false, status: 'unknown', reason: 'permission_not_found' };

  const { id: permId, name, required_skills: required, disclaimer } = permRows[0];

  const { rows: ppRows } = await query(
    `SELECT status, granted_at, last_active_at, scenario_version_at_grant
     FROM peer_permissions
     WHERE user_id = $1 AND permission_id = $2`,
    [userId, permId]
  );

  if (!ppRows.length) {
    // Check what's missing
    const missing = await getMissingSkills(userId, required);
    return {
      held: false,
      status: 'not_held',
      reason: 'skills_incomplete',
      missing_skills: missing,
      action_required: missing.length
        ? `Complete the following scenario(s) to unlock this permission: ${missing.join(', ')}.`
        : null,
    };
  }

  const pp = ppRows[0];

  if (pp.status === 'suspended') {
    return { held: true, status: 'suspended', reason: 'under_review', granted_at: pp.granted_at, action_required: 'Your permission is under review. Check back soon or contact support.' };
  }
  if (pp.status === 'revoked') {
    return { held: true, status: 'revoked', reason: 'revoked_by_reviewer', granted_at: pp.granted_at, action_required: 'This permission has been revoked. Contact support for more information.' };
  }
  if (pp.status === 'inactive') {
    // Determine why — inactivity vs version drift
    const outdated = await getOutdatedSkills(userId, required);
    if (outdated.length) {
      return {
        held: true, status: 'inactive', reason: 'skill_version_outdated',
        outdated_skills: outdated,
        granted_at: pp.granted_at, last_active_at: pp.last_active_at,
        action_required: `Re-complete the following scenario(s) to restore this permission: ${outdated.join(', ')}.`,
      };
    }
    return {
      held: true, status: 'inactive', reason: 'inactivity',
      granted_at: pp.granted_at, last_active_at: pp.last_active_at,
      action_required: 'Your permission lapsed due to inactivity. Complete a peer session to reactivate it.',
    };
  }

  // Status = active — verify underlying skills are still valid
  const outdated = await getOutdatedSkills(userId, required);
  if (outdated.length) {
    // Skills drifted but permission hasn't been updated yet (will be caught by next drift job run)
    return {
      held: true, status: 'active', warning: 'skill_version_outdated',
      outdated_skills: outdated,
      granted_at: pp.granted_at, last_active_at: pp.last_active_at,
      disclaimer,
      action_required: `Your permission is still active but will expire soon. Re-complete: ${outdated.join(', ')}.`,
    };
  }

  return {
    held: true, status: 'active',
    granted_at: pp.granted_at, last_active_at: pp.last_active_at,
    disclaimer,
  };
}

// ─── checkPrerequisites ───────────────────────────────────────────────────────
// Returns true if the user holds all prerequisites for a skill (is_active = true).
// Used before creating a skill_attempt row. Extracted here so training.js and
// future routes share the same logic.

async function checkPrerequisites(userId, skillId) {
  const { rows } = await query(
    'SELECT prerequisite_skill_ids FROM skills WHERE id = $1',
    [skillId]
  );
  const prereqIds = rows[0]?.prerequisite_skill_ids || [];
  if (!prereqIds.length) return true;

  const { rows: held } = await query(
    `SELECT COUNT(*) AS cnt FROM peer_skills
     WHERE user_id = $1 AND skill_id = ANY($2) AND is_active = true`,
    [userId, prereqIds]
  );
  return parseInt(held[0].cnt, 10) >= prereqIds.length;
}

// ─── syncPermissions ──────────────────────────────────────────────────────────
// After a skill is earned, grant any permissions the peer now fully qualifies for.
// Does not revoke or suspend — only activates. Safe to call multiple times.

async function syncPermissions(userId) {
  const { rows: perms } = await query(
    'SELECT id, required_skills FROM permissions WHERE is_active = true'
  );

  for (const perm of perms) {
    const required = perm.required_skills;
    if (!required.length) continue;

    const skillIds = required.map(r => r.skill_id);
    const { rows: held } = await query(
      `SELECT skill_id FROM peer_skills
       WHERE user_id = $1 AND skill_id = ANY($2) AND is_active = true`,
      [userId, skillIds]
    );
    if (held.length < required.length) continue;

    const heldSet = new Set(held.map(r => r.skill_id));
    if (!required.every(r => heldSet.has(r.skill_id))) continue;

    await query(`
      INSERT INTO peer_permissions (user_id, permission_id, scenario_version_at_grant)
      VALUES ($1, $2, 1)
      ON CONFLICT (user_id, permission_id) DO UPDATE
        SET status = 'active', last_active_at = NOW()
        WHERE peer_permissions.status = 'inactive'
    `, [userId, perm.id]);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getMissingSkills(userId, required) {
  const missing = [];
  for (const req of required) {
    const { rows } = await query(
      `SELECT s.slug FROM skills s
       LEFT JOIN peer_skills ps ON ps.skill_id = s.id AND ps.user_id = $1
       WHERE s.id = $2 AND (ps.is_active IS NULL OR ps.is_active = false)`,
      [userId, req.skill_id]
    );
    if (rows.length) missing.push(rows[0].slug);
  }
  return missing;
}

async function getOutdatedSkills(userId, required) {
  const outdated = [];
  for (const req of required) {
    const { rows } = await query(
      `SELECT s.slug, s.current_version, ps.scenario_version_completed
       FROM skills s
       LEFT JOIN peer_skills ps ON ps.skill_id = s.id AND ps.user_id = $1
       WHERE s.id = $2`,
      [userId, req.skill_id]
    );
    if (!rows.length) continue;
    const r = rows[0];
    if (!r.scenario_version_completed || r.scenario_version_completed < r.current_version) {
      outdated.push(r.slug);
    }
  }
  return outdated;
}

module.exports = {
  isPermissionActive,
  getPermissionStatus,
  checkPrerequisites,
  syncPermissions,
  GRACE_PERIOD_DAYS,
};
