const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ─── GET /therapists ──────────────────────────────────────────────────────────
// Returns active therapist profiles, sorted by availability then recency.
// Supports optional filters: specialization, language, session_format, availability.
router.get('/', auth, async (req, res) => {
  const { specialization, language, session_format, availability } = req.query;

  const conditions = ['tp.is_active = true'];
  const params = [];
  let idx = 1;

  if (specialization) { params.push(specialization); conditions.push(`$${idx++} = ANY(tp.specializations)`); }
  if (language)        { params.push(language);        conditions.push(`$${idx++} = ANY(tp.languages)`); }
  if (session_format)  { params.push(session_format);  conditions.push(`$${idx++} = ANY(tp.session_formats)`); }
  if (availability)    { params.push(availability);    conditions.push(`tp.availability_status = $${idx++}`); }

  const { rows } = await query(
    `SELECT tp.id, tp.display_name, tp.photo_url, tp.credentials, tp.years_experience,
            tp.specializations, tp.languages, tp.session_formats, tp.location,
            tp.plain_language_intro, tp.cultural_competencies, tp.approach_plain,
            tp.availability_status
     FROM therapist_profiles tp
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE tp.availability_status
         WHEN 'available'   THEN 0
         WHEN 'limited'     THEN 1
         ELSE 2
       END,
       tp.created_at DESC`,
    params
  );

  return res.status(200).json({ therapists: rows });
});

// ─── GET /therapists/:id ──────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, display_name, full_name, photo_url, credentials, years_experience,
            specializations, languages, session_formats, location, statement,
            plain_language_intro, cultural_competencies, approach_plain, availability_status
     FROM therapist_profiles
     WHERE id = $1 AND is_active = true`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Therapist not found', code: 'NOT_FOUND' });
  return res.status(200).json({ therapist: rows[0] });
});

module.exports = router;
