const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const VALID_TONES = ['warm', 'motivational', 'clinical', 'casual'];
const VALID_STYLES = ['brief', 'elaborate'];
const VALID_FORMALITY = ['formal', 'neutral', 'informal'];
const VALID_CONDITIONS = ['anxiety', 'depression', 'ocd', 'adhd', 'grief', 'loneliness', 'stress', 'general_support'];

const CURRENT_CONSENT_VERSION = '1.0';

// ─── POST /onboarding/consent ─────────────────────────────────────────────────
router.post('/consent', auth, async (req, res) => {
  const { consent_version } = req.body;

  if (consent_version !== CURRENT_CONSENT_VERSION) {
    return res.status(400).json({ error: `consent_version must be "${CURRENT_CONSENT_VERSION}"`, code: 'INVALID_CONSENT_VERSION' });
  }

  const { rows } = await query(
    `UPDATE users
     SET consent_version = $1, consented_at = NOW(), updated_at = NOW()
     WHERE id = $2
     RETURNING consented_at`,
    [CURRENT_CONSENT_VERSION, req.user.id]
  );

  return res.status(200).json({ consented_at: rows[0].consented_at });
});

// ─── POST /onboarding/persona ─────────────────────────────────────────────────
router.post('/persona', auth, async (req, res) => {
  const { rows: userRows } = await query(
    'SELECT persona_created FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userRows.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
  if (userRows[0].persona_created) {
    return res.status(403).json({ error: 'Persona already created — it cannot be changed', code: 'PERSONA_IMMUTABLE' });
  }

  const { persona_name, tone, response_style, formality, uses_alias = true, language = 'english' } = req.body;

  if (!persona_name || typeof persona_name !== 'string' || persona_name.trim().length === 0) {
    return res.status(400).json({ error: 'persona_name is required', code: 'MISSING_FIELD' });
  }
  if (persona_name.trim().length > 20) {
    return res.status(400).json({ error: 'persona_name must be 20 characters or fewer', code: 'PERSONA_NAME_TOO_LONG' });
  }
  if (!VALID_TONES.includes(tone)) {
    return res.status(400).json({ error: `tone must be one of: ${VALID_TONES.join(', ')}`, code: 'INVALID_TONE' });
  }
  if (!VALID_STYLES.includes(response_style)) {
    return res.status(400).json({ error: `response_style must be one of: ${VALID_STYLES.join(', ')}`, code: 'INVALID_RESPONSE_STYLE' });
  }
  if (!VALID_FORMALITY.includes(formality)) {
    return res.status(400).json({ error: `formality must be one of: ${VALID_FORMALITY.join(', ')}`, code: 'INVALID_FORMALITY' });
  }

  const validLanguages = ['english', 'swahili', 'sheng'];
  const safeLanguage = validLanguages.includes(language) ? language : 'english';

  const { rows: personaRows } = await query(
    `INSERT INTO ai_personas (user_id, persona_name, tone, response_style, formality, uses_alias, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [req.user.id, persona_name.trim(), tone, response_style, formality, Boolean(uses_alias), safeLanguage]
  );

  await query(
    'UPDATE users SET persona_created = true, updated_at = NOW() WHERE id = $1',
    [req.user.id]
  );

  return res.status(201).json({ persona_id: personaRows[0].id });
});

// ─── POST /onboarding/condition ──────────────────────────────────────────────
router.post('/condition', auth, async (req, res) => {
  const { condition_category } = req.body;

  if (!VALID_CONDITIONS.includes(condition_category)) {
    return res.status(400).json({
      error: `condition_category must be one of: ${VALID_CONDITIONS.join(', ')}`,
      code: 'INVALID_CONDITION',
    });
  }

  await query(
    'UPDATE users SET condition_category = $1, updated_at = NOW() WHERE id = $2',
    [condition_category, req.user.id]
  );

  // Auto-join the matching group
  const { rows: groupRows } = await query(
    'SELECT id FROM groups WHERE condition_category = $1 AND is_active = true LIMIT 1',
    [condition_category]
  );

  let group_id = null;
  if (groupRows.length) {
    group_id = groupRows[0].id;
    await query(
      `INSERT INTO group_memberships (group_id, user_id, status, agreed_at)
       VALUES ($1, $2, 'active', NOW())
       ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active', agreed_at = NOW()`,
      [group_id, req.user.id]
    );
  }

  return res.status(200).json({ condition_category, group_id });
});

// ─── GET /onboarding/status ───────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  const { rows: userRows } = await query(
    'SELECT consent_version, persona_created, signup_bonus_credited, welcome_seen, condition_category FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userRows.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

  const user = userRows[0];

  const { rows: moodRows } = await query(
    'SELECT 1 FROM moods WHERE user_id = $1 LIMIT 1',
    [req.user.id]
  );

  return res.status(200).json({
    consent: Boolean(user.consent_version),
    persona: user.persona_created,
    condition_selected: Boolean(user.condition_category),
    first_mood: moodRows.length > 0,
    signup_bonus: user.signup_bonus_credited,
    welcome_seen: user.welcome_seen,
  });
});

// ─── PATCH /onboarding/welcome-seen ──────────────────────────────────────────
router.patch('/welcome-seen', auth, async (req, res) => {
  await query(
    'UPDATE users SET welcome_seen = true, updated_at = NOW() WHERE id = $1',
    [req.user.id]
  );
  return res.status(200).json({ welcome_seen: true });
});

module.exports = router;
