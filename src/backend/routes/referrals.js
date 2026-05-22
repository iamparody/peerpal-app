const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');
const { deductCredit } = require('../utils/creditDeductor');

const router = express.Router();

const VALID_PREFERRED_TIMES  = ['morning', 'afternoon', 'evening'];
const VALID_CONTACT_METHODS  = ['in_app', 'phone'];

// ─── POST /referrals ──────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const {
    struggles, preferred_time, contact_method, contact_detail,
    specific_needs, support_style_preference,
  } = req.body;

  if (!struggles || typeof struggles !== 'string' || struggles.trim().length === 0) {
    return res.status(400).json({ error: 'struggles is required', code: 'MISSING_STRUGGLES' });
  }
  if (!VALID_PREFERRED_TIMES.includes(preferred_time)) {
    return res.status(400).json({ error: `preferred_time must be one of: ${VALID_PREFERRED_TIMES.join(', ')}`, code: 'INVALID_PREFERRED_TIME' });
  }
  if (!VALID_CONTACT_METHODS.includes(contact_method)) {
    return res.status(400).json({ error: `contact_method must be one of: ${VALID_CONTACT_METHODS.join(', ')}`, code: 'INVALID_CONTACT_METHOD' });
  }

  // Credit gate: 1 credit to submit a referral
  const { blocked } = await deductCredit(req.user.id, 1, null, 'referral');
  if (blocked) {
    return res.status(402).json({ error: 'Insufficient credits — top up to request a therapist referral', code: 'INSUFFICIENT_CREDITS' });
  }

  const encryptedDetail = contact_method === 'phone' && contact_detail
    ? encrypt(contact_detail)
    : null;

  const { rows } = await query(
    `INSERT INTO therapist_referrals
       (user_id, struggles, preferred_time, contact_method, contact_detail,
        specific_needs, support_style_preference)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      req.user.id,
      struggles.trim(),
      preferred_time,
      contact_method,
      encryptedDetail,
      specific_needs || null,
      support_style_preference || null,
    ]
  );

  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'therapist_referral_update', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
    [JSON.stringify({ referral_id: rows[0].id, status: 'pending' })]
  );

  return res.status(201).json({ referral_id: rows[0].id });
});

// ─── POST /referrals/:id/interests ───────────────────────────────────────────
// Attach up to 3 therapist interest selections to an existing referral.
router.post('/:id/interests', auth, async (req, res) => {
  const { therapist_ids } = req.body;

  if (!Array.isArray(therapist_ids) || therapist_ids.length === 0) {
    return res.status(400).json({ error: 'therapist_ids must be a non-empty array', code: 'MISSING_THERAPIST_IDS' });
  }
  if (therapist_ids.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 therapist interests per referral', code: 'TOO_MANY_INTERESTS' });
  }

  // Verify referral belongs to this user
  const { rows: refRows } = await query(
    'SELECT id FROM therapist_referrals WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!refRows.length) return res.status(404).json({ error: 'Referral not found', code: 'NOT_FOUND' });

  // Verify all therapist IDs exist and are active
  const { rows: tRows } = await query(
    'SELECT id FROM therapist_profiles WHERE id = ANY($1) AND is_active = true',
    [therapist_ids]
  );
  if (tRows.length !== therapist_ids.length) {
    return res.status(400).json({ error: 'One or more therapist IDs are invalid', code: 'INVALID_THERAPIST_IDS' });
  }

  // Upsert interests (idempotent on duplicate)
  for (const therapist_id of therapist_ids) {
    await query(
      `INSERT INTO therapist_interests (member_user_id, therapist_id, referral_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_user_id, therapist_id, referral_id) DO NOTHING`,
      [req.user.id, therapist_id, req.params.id]
    );
  }

  return res.status(201).json({ attached: therapist_ids.length });
});

// ─── GET /referrals/my ────────────────────────────────────────────────────────
router.get('/my', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT tr.id, tr.struggles, tr.preferred_time, tr.contact_method,
            tr.status, tr.admin_notes, tr.support_style_preference,
            tr.created_at, tr.updated_at
     FROM therapist_referrals tr
     WHERE tr.user_id = $1
     ORDER BY tr.created_at DESC`,
    [req.user.id]
  );

  // For each referral, fetch expressed interests (therapist display names only)
  for (const referral of rows) {
    const { rows: interests } = await query(
      `SELECT ti.id, ti.status, tp.display_name, tp.photo_url, tp.availability_status
       FROM therapist_interests ti
       JOIN therapist_profiles tp ON tp.id = ti.therapist_id
       WHERE ti.referral_id = $1`,
      [referral.id]
    );
    referral.interests = interests;
  }

  return res.status(200).json({ referrals: rows });
});

module.exports = router;
