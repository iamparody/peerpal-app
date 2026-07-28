/**
 * /api/training — Peer Competency Training & Scenario Engine (Phase 31.2)
 *
 * Endpoints:
 *   GET  /skills                        List all skills with caller's current status
 *   GET  /skills/:slug                  Skill detail + available scenario
 *   POST /skills/:slug/start            Start a scenario attempt
 *   POST /scenarios/:attemptId/respond  Submit a choice; returns next node
 *   POST /scenarios/:attemptId/complete Abandon an in-progress attempt
 *   GET  /my-skills                     Caller's earned skills
 *   GET  /my-permissions                Caller's active permissions
 */

const router = require('express').Router();
const { query } = require('../db');
const auth = require('../middleware/auth');

// All training routes require authentication
router.use(auth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSkillIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM skills WHERE slug = $1 AND is_active = true', [slug]);
  return rows[0]?.id || null;
}

async function checkPrerequisites(userId, skillId) {
  const { rows } = await query('SELECT prerequisite_skill_ids FROM skills WHERE id = $1', [skillId]);
  const prereqIds = rows[0]?.prerequisite_skill_ids || [];
  if (prereqIds.length === 0) return true;

  const { rows: held } = await query(
    'SELECT COUNT(*) AS cnt FROM peer_skills WHERE user_id = $1 AND skill_id = ANY($2) AND is_active = true',
    [userId, prereqIds]
  );
  return parseInt(held[0].cnt, 10) >= prereqIds.length;
}

// Evaluate and grant any permissions the user now qualifies for.
// Called after a skill is issued.
async function syncPermissions(userId) {
  const { rows: perms } = await query(
    'SELECT id, required_skills FROM permissions WHERE is_active = true'
  );

  for (const perm of perms) {
    const required = perm.required_skills; // [{skill_id, min_version}]
    if (!required.length) continue;

    const skillIds = required.map(r => r.skill_id);
    const { rows: held } = await query(
      `SELECT skill_id FROM peer_skills
       WHERE user_id = $1 AND skill_id = ANY($2) AND is_active = true`,
      [userId, skillIds]
    );

    if (held.length < required.length) continue;

    // Check min version for each required skill
    const heldMap = Object.fromEntries(held.map(r => [r.skill_id, true]));
    const allMet = required.every(r => heldMap[r.skill_id]);
    if (!allMet) continue;

    await query(`
      INSERT INTO peer_permissions (user_id, permission_id, scenario_version_at_grant)
      VALUES ($1, $2, 1)
      ON CONFLICT (user_id, permission_id) DO UPDATE
        SET status = 'active', last_active_at = NOW()
        WHERE peer_permissions.status = 'inactive'
    `, [userId, perm.id]);
  }
}

// ─── GET /api/training/skills ─────────────────────────────────────────────────

router.get('/skills', async (req, res) => {
  try {
    const { rows: skills } = await query(`
      SELECT s.id, s.slug, s.name, s.description, s.icon_name, s.skill_group,
             s.prerequisite_skill_ids, s.current_version,
             ps.level, ps.is_active AS earned, ps.earned_at,
             -- In-progress attempt
             (SELECT id FROM skill_attempts sa
              WHERE sa.user_id = $1 AND sa.scenario_id IN (
                SELECT id FROM skill_scenarios WHERE skill_id = s.id
              ) AND sa.completed_at IS NULL
              ORDER BY sa.started_at DESC LIMIT 1
             ) AS active_attempt_id
      FROM skills s
      LEFT JOIN peer_skills ps ON ps.skill_id = s.id AND ps.user_id = $1
      WHERE s.is_active = true
      ORDER BY s.skill_group, s.created_at
    `, [req.user.id]);

    // Resolve prerequisite names for display
    const allSlugs = Object.fromEntries(skills.map(s => [s.id, s.slug]));

    const result = skills.map(s => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      icon_name: s.icon_name,
      skill_group: s.skill_group,
      current_version: s.current_version,
      prerequisites: (s.prerequisite_skill_ids || []).map(id => allSlugs[id] || id),
      status: s.earned
        ? (s.is_active ? 'earned' : 'lapsed')  // earned but may be lapsed
        : s.active_attempt_id
          ? 'in_progress'
          : 'locked',
      level: s.level || null,
      earned_at: s.earned_at || null,
      active_attempt_id: s.active_attempt_id || null,
    }));

    res.json({ skills: result });
  } catch (err) {
    console.error('GET /training/skills', err);
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

// ─── GET /api/training/skills/:slug ───────────────────────────────────────────

router.get('/skills/:slug', async (req, res) => {
  try {
    const { rows: skillRows } = await query(`
      SELECT s.id, s.slug, s.name, s.description, s.icon_name, s.skill_group,
             s.prerequisite_skill_ids, s.current_version,
             ps.level, ps.is_active AS earned, ps.earned_at
      FROM skills s
      LEFT JOIN peer_skills ps ON ps.skill_id = s.id AND ps.user_id = $1
      WHERE s.slug = $2 AND s.is_active = true
    `, [req.user.id, req.params.slug]);

    if (!skillRows.length) return res.status(404).json({ error: 'Skill not found' });
    const skill = skillRows[0];

    const prereqsMet = await checkPrerequisites(req.user.id, skill.id);

    // Find the active (non-archived) scenario for this skill
    const { rows: scenarios } = await query(`
      SELECT id, version, title, estimated_minutes, status
      FROM skill_scenarios
      WHERE skill_id = $1 AND is_active = true
      ORDER BY version DESC LIMIT 1
    `, [skill.id]);

    // Most recent attempt by this user
    const { rows: attempts } = await query(`
      SELECT sa.id, sa.started_at, sa.completed_at, sa.passed, sa.score_json
      FROM skill_attempts sa
      JOIN skill_scenarios ss ON ss.id = sa.scenario_id
      WHERE sa.user_id = $1 AND ss.skill_id = $2
      ORDER BY sa.started_at DESC LIMIT 5
    `, [req.user.id, skill.id]);

    res.json({
      skill: {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        icon_name: skill.icon_name,
        skill_group: skill.skill_group,
        current_version: skill.current_version,
        prerequisites_met: prereqsMet,
        status: skill.earned
          ? (skill.earned ? 'earned' : 'lapsed')
          : prereqsMet ? 'available' : 'locked',
        level: skill.level || null,
        earned_at: skill.earned_at || null,
      },
      scenario: scenarios[0] || null,
      recent_attempts: attempts.map(a => ({
        id: a.id,
        started_at: a.started_at,
        completed_at: a.completed_at,
        passed: a.passed,
        score: a.score_json?.total ?? null,
      })),
    });
  } catch (err) {
    console.error('GET /training/skills/:slug', err);
    res.status(500).json({ error: 'Failed to load skill' });
  }
});

// ─── POST /api/training/skills/:slug/start ────────────────────────────────────

router.post('/skills/:slug/start', async (req, res) => {
  try {
    const skillId = await getSkillIdBySlug(req.params.slug);
    if (!skillId) return res.status(404).json({ error: 'Skill not found' });

    // Check prerequisites
    const prereqsMet = await checkPrerequisites(req.user.id, skillId);
    if (!prereqsMet) {
      return res.status(403).json({ error: 'Prerequisites not met', code: 'PREREQS_REQUIRED' });
    }

    // Get the active scenario for this skill
    const { rows: scenarios } = await query(`
      SELECT id, version, title, estimated_minutes, scenario_json
      FROM skill_scenarios
      WHERE skill_id = $1 AND is_active = true AND status IN ('draft', 'approved')
      ORDER BY version DESC LIMIT 1
    `, [skillId]);

    if (!scenarios.length) {
      return res.status(404).json({ error: 'No scenario available for this skill yet' });
    }
    const scenario = scenarios[0];

    // Abandon any existing in-progress attempt for this scenario before starting a new one
    await query(`
      UPDATE skill_attempts
      SET completed_at = NOW(), passed = false,
          score_json = score_json || '{"abandoned": true}'::jsonb
      WHERE user_id = $1 AND scenario_id = $2 AND completed_at IS NULL
    `, [req.user.id, scenario.id]);

    // Build initial score_json state
    const sj = scenario.scenario_json;
    const startNode = sj.nodes[sj.start_node];
    const initialState = {
      current_node: sj.start_node,
      choices_made: [],
      running_score: 0,
      pass_threshold: sj.scoring.pass_threshold,
    };

    const { rows: [attempt] } = await query(`
      INSERT INTO skill_attempts (user_id, scenario_id, score_json)
      VALUES ($1, $2, $3)
      RETURNING id, started_at
    `, [req.user.id, scenario.id, JSON.stringify(initialState)]);

    res.json({
      attempt_id: attempt.id,
      scenario_id: scenario.id,
      scenario_title: scenario.title,
      estimated_minutes: scenario.estimated_minutes,
      intro: sj.intro,
      node: stripNodeForClient(startNode),
    });
  } catch (err) {
    console.error('POST /training/skills/:slug/start', err);
    res.status(500).json({ error: 'Failed to start scenario' });
  }
});

// ─── POST /api/training/scenarios/:attemptId/respond ─────────────────────────

router.post('/scenarios/:attemptId/respond', async (req, res) => {
  const { choice_id } = req.body;
  if (!choice_id) return res.status(400).json({ error: 'choice_id required' });

  try {
    // Load attempt — must belong to caller and be in-progress
    const { rows: attemptRows } = await query(`
      SELECT sa.id, sa.score_json, ss.scenario_json, ss.skill_id, ss.version
      FROM skill_attempts sa
      JOIN skill_scenarios ss ON ss.id = sa.scenario_id
      WHERE sa.id = $1 AND sa.user_id = $2 AND sa.completed_at IS NULL
    `, [req.params.attemptId, req.user.id]);

    if (!attemptRows.length) {
      return res.status(404).json({ error: 'Attempt not found or already completed' });
    }

    const { score_json: state, scenario_json: sj, skill_id: skillId, version: scenarioVersion } = attemptRows[0];
    const currentNode = sj.nodes[state.current_node];

    if (!currentNode || currentNode.type === 'end') {
      return res.status(400).json({ error: 'Attempt is already at end node' });
    }

    // Validate choice
    const choice = currentNode.choices?.find(c => c.id === choice_id);
    if (!choice) {
      return res.status(400).json({ error: 'Invalid choice_id for current node' });
    }

    // Apply score
    const points = choice.points ?? 0;
    const newScore = (state.running_score || 0) + points;

    const newState = {
      ...state,
      current_node: choice.next,
      running_score: newScore,
      choices_made: [
        ...(state.choices_made || []),
        { node_id: state.current_node, choice_id, tags: choice.tags || [], points },
      ],
    };

    const nextNode = sj.nodes[choice.next];
    const isDone = nextNode?.type === 'end';

    if (isDone) {
      // Finalise attempt
      const passed = newScore >= state.pass_threshold;
      newState.total = newScore;

      await query(`
        UPDATE skill_attempts
        SET score_json = $1, completed_at = NOW(), passed = $2
        WHERE id = $3
      `, [JSON.stringify(newState), passed, req.params.attemptId]);

      // Issue skill if passed and prerequisites still met
      if (passed) {
        const prereqsMet = await checkPrerequisites(req.user.id, skillId);
        if (prereqsMet) {
          await query(`
            INSERT INTO peer_skills (user_id, skill_id, level, scenario_version_completed)
            VALUES ($1, $2, 1, $3)
            ON CONFLICT (user_id, skill_id) DO UPDATE
              SET is_active = true,
                  scenario_version_completed = EXCLUDED.scenario_version_completed,
                  earned_at = CASE WHEN peer_skills.is_active = false THEN NOW() ELSE peer_skills.earned_at END
          `, [req.user.id, skillId, scenarioVersion]);

          await syncPermissions(req.user.id);
        }
      }

      return res.json({
        done: true,
        passed,
        score: newScore,
        pass_threshold: state.pass_threshold,
        node: {
          id: nextNode.id,
          type: 'end',
          message: passed ? nextNode.pass_message : nextNode.fail_message,
        },
      });
    }

    // Not done — persist state and return next node
    await query(`
      UPDATE skill_attempts SET score_json = $1 WHERE id = $2
    `, [JSON.stringify(newState), req.params.attemptId]);

    res.json({
      done: false,
      running_score: newScore,
      node: stripNodeForClient(nextNode),
    });
  } catch (err) {
    console.error('POST /training/scenarios/:attemptId/respond', err);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

// ─── POST /api/training/scenarios/:attemptId/complete ────────────────────────
// Voluntarily abandon an in-progress attempt (no skill earned).

router.post('/scenarios/:attemptId/complete', async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE skill_attempts
      SET completed_at = NOW(), passed = false,
          score_json = score_json || '{"abandoned": true}'::jsonb
      WHERE id = $1 AND user_id = $2 AND completed_at IS NULL
      RETURNING id
    `, [req.params.attemptId, req.user.id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Attempt not found or already completed' });
    }

    res.json({ abandoned: true, attempt_id: req.params.attemptId });
  } catch (err) {
    console.error('POST /training/scenarios/:attemptId/complete', err);
    res.status(500).json({ error: 'Failed to complete attempt' });
  }
});

// ─── GET /api/training/my-skills ─────────────────────────────────────────────

router.get('/my-skills', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ps.id, ps.level, ps.earned_at, ps.last_used_at, ps.is_active,
             ps.scenario_version_completed,
             s.slug, s.name, s.icon_name, s.skill_group,
             -- Which permission slugs this skill contributes toward
             (
               SELECT ARRAY_AGG(p.slug)
               FROM permissions p
               WHERE p.required_skills @> jsonb_build_array(
                 jsonb_build_object('skill_id', ps.skill_id::text, 'min_version', 1)
               )
             ) AS contributes_to_permissions
      FROM peer_skills ps
      JOIN skills s ON s.id = ps.skill_id
      WHERE ps.user_id = $1
      ORDER BY s.skill_group, ps.earned_at
    `, [req.user.id]);

    res.json({ skills: rows });
  } catch (err) {
    console.error('GET /training/my-skills', err);
    res.status(500).json({ error: 'Failed to load earned skills' });
  }
});

// ─── GET /api/training/my-permissions ────────────────────────────────────────

router.get('/my-permissions', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT pp.id, pp.status, pp.granted_at, pp.last_active_at,
             pp.expires_if_inactive_days, pp.scenario_version_at_grant,
             p.slug, p.name, p.description, p.disclaimer
      FROM peer_permissions pp
      JOIN permissions p ON p.id = pp.permission_id
      WHERE pp.user_id = $1 AND pp.status = 'active'
      ORDER BY pp.granted_at
    `, [req.user.id]);

    res.json({ permissions: rows });
  } catch (err) {
    console.error('GET /training/my-permissions', err);
    res.status(500).json({ error: 'Failed to load permissions' });
  }
});

// ─── Utility ──────────────────────────────────────────────────────────────────
// Strip tags and points from choices before sending to client to prevent gaming.

function stripNodeForClient(node) {
  if (!node) return null;
  if (node.type === 'end') return node;
  return {
    id: node.id,
    scene: node.scene,
    prompt: node.prompt,
    choices: (node.choices || []).map(c => ({ id: c.id, text: c.text })),
  };
}

module.exports = router;
