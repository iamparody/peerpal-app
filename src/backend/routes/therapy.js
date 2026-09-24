'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const auth     = require('../middleware/auth');
const therapistAuth = require('../middleware/therapistAuth');
const { deductCredit, refundCredit } = require('../utils/creditDeductor');
const { stkPush, parseCallback, normalisePhone } = require('../utils/daraja');
const { parseB2CCallback } = require('../utils/therapistPayout');
const { issueFullRefund, issuePartialRefund } = require('../utils/therapyRefund');
const { getTurnCredentials } = require('../utils/turnCredentials');
const { encrypt, decrypt } = require('../utils/encryption');
const { initiatePayout } = require('../utils/therapistPayout');

const router = express.Router();

const THERAPY_CONSENT_VERSION = '2.0';
const PLATFORM_FEE_RATE       = 0.20;
const SLOT_LOCK_MINUTES        = 5;
const SLOT_DURATION_MINUTES    = 60; // default slot duration when generating grid
const DISPUTE_WINDOW_HOURS     = 24;
const BAYESIAN_C               = 10;
const BAYESIAN_MEAN            = 3.5;

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[therapy:notify]', e.message));
}

// â”€â”€â”€ GET /therapy/categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/categories', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT tc.id, tc.name, tc.description, tc.icon_name, tc.condition_tags, tc.sort_order,
              (SELECT COUNT(*) FROM therapist_profiles tp
               WHERE tp.is_active = true AND tp.is_verified = true AND tp.suspended = false
                 AND tc.id::text = ANY(tp.category_ids::text[])) AS therapist_count
       FROM therapist_categories tc
       WHERE tc.is_active = true
       ORDER BY tc.sort_order ASC, tc.name ASC`
    );
    return res.status(200).json({ categories: rows });
  } catch (err) {
    console.error('[therapy.categories]', err.message);
    return res.status(500).json({ error: 'Failed to load categories', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ DELETE /therapy/slot-lock/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Release lock on back-navigation â€” only lock owner can delete.
router.delete('/slot-lock/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM booking_slot_locks WHERE id = $1 AND locked_by = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Lock not found or not yours', code: 'NOT_FOUND' });
    return res.status(200).json({ released: true });
  } catch (err) {
    console.error('[therapy.slot-lock.delete]', err.message);
    return res.status(500).json({ error: 'Failed to release lock', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Discovery list â€” verified, active, non-suspended therapists.
// Filters: category_id, session_format, language, gender, max_rate_kes
router.get('/therapists', auth, async (req, res) => {
  try {
    const { category_id, session_format, language, gender, max_rate_kes } = req.query;

    const conditions = [
      'tp.is_active = true',
      'tp.is_verified = true',
      'tp.suspended = false',
    ];
    const params = [];
    let idx = 1;

    if (category_id)    { params.push(category_id);    conditions.push(`$${idx++} = ANY(tp.category_ids::text[])`); }
    if (session_format) { params.push(session_format); conditions.push(`$${idx++} = ANY(tp.session_formats)`); }
    if (language)       { params.push(language);       conditions.push(`$${idx++} = ANY(tp.languages)`); }
    if (gender)         { params.push(gender);         conditions.push(`tp.gender = $${idx++}`); }
    if (max_rate_kes)   { params.push(parseInt(max_rate_kes)); conditions.push(`tp.rate_per_session_kes <= $${idx++}`); }

    const { rows } = await query(
      `SELECT tp.id, tp.display_name, tp.photo_url, tp.credentials, tp.years_experience,
              tp.languages, tp.session_formats, tp.category_ids, tp.location,
              tp.plain_language_intro, tp.approach_plain, tp.cultural_competencies,
              tp.availability_status, tp.average_rating, tp.total_ratings_count,
              tp.total_sessions, tp.rate_per_session_kes, tp.gender, tp.age
       FROM therapist_profiles tp
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE tp.availability_status WHEN 'available' THEN 0 WHEN 'limited' THEN 1 ELSE 2 END,
         tp.average_rating DESC,
         tp.total_sessions DESC`,
      params
    );
    return res.status(200).json({ therapists: rows });
  } catch (err) {
    console.error('[therapy.therapists.list]', err.message);
    return res.status(500).json({ error: 'Failed to load therapists', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapists/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapists/:id', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT tp.id, tp.display_name, tp.photo_url, tp.credentials,
              tp.years_experience, tp.languages, tp.session_formats, tp.category_ids,
              tp.location, tp.plain_language_intro, tp.approach_plain,
              tp.cultural_competencies, tp.availability_status, tp.average_rating,
              tp.total_ratings_count, tp.total_sessions, tp.rate_per_session_kes,
              tp.gender, tp.age, tp.kcpa_level, tp.registration_number,
              tp.show_rating, tp.bayesian_average
       FROM therapist_profiles tp
       WHERE tp.id = $1 AND tp.is_active = true AND tp.is_verified = true AND tp.suspended = false`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Therapist not found', code: 'NOT_FOUND' });
    return res.status(200).json({ therapist: rows[0] });
  } catch (err) {
    console.error('[therapy.therapists.get]', err.message);
    return res.status(500).json({ error: 'Failed to load therapist', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapists/:id/availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns available ISO datetime slots for the next 14 days based on
// therapist_availability weekly schedule, minus already-booked and locked slots.
router.get('/therapists/:id/availability', auth, async (req, res) => {
  try {
    const therapistId = req.params.id;

    const [scheduleResult, bookedResult, lockedResult] = await Promise.all([
      query(
        `SELECT day_of_week, start_time, end_time
         FROM therapist_availability
         WHERE therapist_id = $1 AND is_active = true`,
        [therapistId]
      ),
      query(
        `SELECT scheduled_at FROM therapist_bookings
         WHERE therapist_id = $1
           AND status NOT IN ('cancelled', 'therapist_no_show', 'member_no_show')
           AND scheduled_at > NOW()
           AND scheduled_at < NOW() + INTERVAL '14 days'`,
        [therapistId]
      ),
      query(
        `SELECT scheduled_at FROM booking_slot_locks
         WHERE therapist_id = $1 AND expires_at > NOW()`,
        [therapistId]
      ),
    ]);

    const schedule = scheduleResult.rows;   // [{day_of_week, start_time, end_time}]
    const booked   = new Set(bookedResult.rows.map((r) => new Date(r.scheduled_at).toISOString()));
    const locked   = new Set(lockedResult.rows.map((r) => new Date(r.scheduled_at).toISOString()));

    const slots = [];
    const now   = new Date();

    for (let d = 1; d <= 14; d++) {
      const date = new Date(now);
      date.setDate(now.getDate() + d);
      date.setHours(0, 0, 0, 0);

      const dayOfWeek = date.getDay(); // 0=Sunday
      const daySchedules = schedule.filter((s) => s.day_of_week === dayOfWeek);

      for (const slot of daySchedules) {
        // Parse HH:MM start/end
        const [sh, sm] = slot.start_time.split(':').map(Number);
        const [eh, em] = slot.end_time.split(':').map(Number);

        let cur = new Date(date);
        cur.setHours(sh, sm, 0, 0);
        const end = new Date(date);
        end.setHours(eh, em, 0, 0);

        while (cur < end) {
          const iso = cur.toISOString();
          if (cur > now && !booked.has(iso) && !locked.has(iso)) {
            slots.push(iso);
          }
          cur = new Date(cur.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
        }
      }
    }

    return res.status(200).json({ slots });
  } catch (err) {
    console.error('[therapy.availability]', err.message);
    return res.status(500).json({ error: 'Failed to load availability', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/slot-lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Acquires a 5-min lock on a slot. Returns 409 if taken.
router.post('/slot-lock', auth, async (req, res) => {
  const { therapist_id, scheduled_at } = req.body;
  if (!therapist_id || !scheduled_at) {
    return res.status(400).json({ error: 'therapist_id and scheduled_at are required', code: 'MISSING_FIELDS' });
  }
  try {
    const lockId    = uuidv4();
    const expiresAt = new Date(Date.now() + SLOT_LOCK_MINUTES * 60 * 1000).toISOString();
    await query(
      `INSERT INTO booking_slot_locks (id, therapist_id, scheduled_at, locked_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [lockId, therapist_id, scheduled_at, req.user.id, expiresAt]
    );
    return res.status(200).json({ lock_id: lockId, expires_at: expiresAt });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This slot is already taken', code: 'SLOT_TAKEN' });
    }
    console.error('[therapy.slot-lock]', err.message);
    return res.status(500).json({ error: 'Failed to acquire slot lock', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/consent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/consent', auth, async (req, res) => {
  const { consent_version } = req.body;
  if (consent_version !== THERAPY_CONSENT_VERSION) {
    return res.status(400).json({
      error: `consent_version must be "${THERAPY_CONSENT_VERSION}"`,
      code: 'INVALID_CONSENT_VERSION',
    });
  }
  try {
    const { rows } = await query(
      `UPDATE users
       SET therapy_consent_version = $1, therapy_consented_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING therapy_consented_at`,
      [THERAPY_CONSENT_VERSION, req.user.id]
    );
    return res.status(200).json({ consented_at: rows[0].therapy_consented_at });
  } catch (err) {
    console.error('[therapy.consent]', err.message);
    return res.status(500).json({ error: 'Failed to record consent', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Creates a booking, deducts 1 credit, initiates Daraja STK Push.
router.post('/bookings', auth, async (req, res) => {
  const {
    therapist_id, category_id, session_format,
    scheduled_at, duration_minutes = 60,
    lock_id, phone, notes,
  } = req.body;

  if (!therapist_id || !category_id || !session_format || !scheduled_at || !lock_id || !phone) {
    return res.status(400).json({
      error: 'therapist_id, category_id, session_format, scheduled_at, lock_id, and phone are required',
      code: 'MISSING_FIELDS',
    });
  }

  try {
    // Therapy consent check
    const { rows: userRows } = await query(
      'SELECT therapy_consent_version FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!userRows.length) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    if (userRows[0].therapy_consent_version !== THERAPY_CONSENT_VERSION) {
      return res.status(403).json({ error: 'Therapy consent required', code: 'THERAPY_CONSENT_REQUIRED' });
    }

    // Verify slot lock belongs to this user
    const { rows: lockRows } = await query(
      `SELECT id FROM booking_slot_locks
       WHERE id = $1 AND therapist_id = $2 AND scheduled_at = $3
         AND locked_by = $4 AND expires_at > NOW()`,
      [lock_id, therapist_id, scheduled_at, req.user.id]
    );
    if (!lockRows.length) {
      return res.status(409).json({ error: 'Slot lock expired or invalid', code: 'LOCK_INVALID' });
    }

    // Fetch therapist rate
    const { rows: tpRows } = await query(
      'SELECT rate_per_session_kes, user_id FROM therapist_profiles WHERE id = $1 AND is_active = true AND is_verified = true AND suspended = false',
      [therapist_id]
    );
    if (!tpRows.length) return res.status(404).json({ error: 'Therapist not available', code: 'NOT_FOUND' });
    const { rate_per_session_kes: rateKes, user_id: therapistUserId } = tpRows[0];

    const platformFeeKes   = Math.ceil(rateKes * PLATFORM_FEE_RATE);
    const therapistPayoutKes = rateKes - platformFeeKes;

    // Deduct 1 credit
    const bookingId = uuidv4();
    await deductCredit(req.user.id, 1, bookingId, 'therapy_booking');

    // Create booking (payment_status=unpaid until STK callback confirms)
    await query(
      `INSERT INTO therapist_bookings
         (id, member_user_id, therapist_id, category_id, session_format,
          scheduled_at, duration_minutes, rate_kes, platform_fee_kes, therapist_payout_kes,
          status, payment_status, escrow_status, credit_charged, notes, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','unpaid','held',1,$11,$12)`,
      [
        bookingId, req.user.id, therapist_id, category_id, session_format,
        scheduled_at, duration_minutes, rateKes, platformFeeKes, therapistPayoutKes,
        notes || null, bookingId,
      ]
    );

    // Release slot lock
    await query('DELETE FROM booking_slot_locks WHERE id = $1', [lock_id]).catch(() => {});

    // Initiate STK Push â€” store checkout_request_id in payment_reference
    let checkoutRequestId = null;
    try {
      const normalisedPhone = normalisePhone(phone);
      const stkResult = await stkPush(
        normalisedPhone,
        rateKes,
        `PEERPAL-${bookingId.slice(0, 8).toUpperCase()}`,
        'PeerPal therapy session payment'
      );
      checkoutRequestId = stkResult.CheckoutRequestID;
      await query(
        'UPDATE therapist_bookings SET payment_reference = $1 WHERE id = $2',
        [checkoutRequestId, bookingId]
      );
    } catch (stkErr) {
      console.error('[therapy.booking.stk]', stkErr.message);
      // Booking created, STK failed â€” member can retry payment; booking stays unpaid
    }

    // Notify therapist
    const { rows: therapistNotifRows } = await query(
      'SELECT alias FROM users WHERE id = $1',
      [therapistUserId]
    );
    await notifyUser(therapistUserId, 'therapist_update', {
      message: `New booking request for ${new Date(scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}. Awaiting payment confirmation.`,
    });

    return res.status(201).json({
      booking_id: bookingId,
      checkout_request_id: checkoutRequestId,
      message: 'Booking created. Complete M-Pesa payment to confirm.',
    });
  } catch (err) {
    console.error('[therapy.booking.create]', err.message);
    return res.status(500).json({ error: 'Failed to create booking', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/mpesa-callback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public â€” called by Safaricom. Respond immediately, process async.
router.post('/mpesa-callback', async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  let parsed;
  try {
    parsed = parseCallback(req.body);
  } catch (err) {
    console.error('[therapy.mpesa-callback.parse]', err.message);
    return;
  }

  const { success, checkoutRequestId } = parsed;

  if (!success) {
    await query(
      `UPDATE therapist_bookings SET payment_status = 'failed', updated_at = NOW()
       WHERE payment_reference = $1 AND payment_status = 'unpaid'`,
      [checkoutRequestId]
    ).catch((e) => console.error('[therapy.mpesa-callback.fail]', e.message));
    return;
  }

  const { rows: bookingRows } = await query(
    `UPDATE therapist_bookings SET payment_status = 'paid', updated_at = NOW()
     WHERE payment_reference = $1 AND payment_status = 'unpaid'
     RETURNING id, member_user_id, therapist_id, scheduled_at, session_format`,
    [checkoutRequestId]
  ).catch(() => ({ rows: [] }));

  if (!bookingRows.length) return;

  const b = bookingRows[0];

  // Notify member
  await notifyUser(b.member_user_id, 'therapist_update', {
    message: 'Payment confirmed. Awaiting therapist confirmation of your session.',
  });

  // Fetch therapist user_id to notify
  const { rows: tpRows } = await query(
    'SELECT user_id FROM therapist_profiles WHERE id = $1',
    [b.therapist_id]
  ).catch(() => ({ rows: [] }));

  if (tpRows.length) {
    const { rows: memberRows } = await query(
      'SELECT alias FROM users WHERE id = $1',
      [b.member_user_id]
    ).catch(() => ({ rows: [{ alias: 'a member' }] }));

    await notifyUser(tpRows[0].user_id, 'therapist_update', {
      message: `New confirmed booking from ${memberRows[0]?.alias}. Session: ${new Date(b.scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} (${b.session_format}).`,
    });
  }
});

// â”€â”€â”€ POST /therapy/b2c-callback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public â€” Daraja B2C result callback for therapist payouts.
router.post('/b2c-callback', async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  let parsed;
  try {
    parsed = parseB2CCallback(req.body);
  } catch (err) {
    console.error('[therapy.b2c-callback.parse]', err.message);
    return;
  }

  const { success, idempotencyKey, mpesaReference } = parsed;

  if (success) {
    await query(
      `UPDATE therapist_payouts
       SET status = 'completed', completed_at = NOW(), mpesa_reference = $1, updated_at = NOW()
       WHERE idempotency_key = $2`,
      [mpesaReference, idempotencyKey]
    ).catch((e) => console.error('[therapy.b2c-callback.complete]', e.message));
  } else {
    await query(
      `UPDATE therapist_payouts
       SET status = 'failed', updated_at = NOW()
       WHERE idempotency_key = $1 AND status = 'processing'`,
      [idempotencyKey]
    ).catch((e) => console.error('[therapy.b2c-callback.failed]', e.message));
  }
});

// â”€â”€â”€ PATCH /therapy/bookings/:id/confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/bookings/:id/confirm', therapistAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE therapist_bookings
       SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 AND therapist_id = $2 AND status = 'pending' AND payment_status = 'paid'
       RETURNING member_user_id, scheduled_at, session_format`,
      [req.params.id, req.therapist.profile_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found or not confirmable', code: 'NOT_FOUND' });
    }
    const b = rows[0];
    await notifyUser(b.member_user_id, 'therapist_update', {
      message: `Your therapy session is confirmed for ${new Date(b.scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} (${b.session_format}).`,
    });
    return res.status(200).json({ confirmed_at: new Date().toISOString() });
  } catch (err) {
    console.error('[therapy.booking.confirm]', err.message);
    return res.status(500).json({ error: 'Failed to confirm booking', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ PATCH /therapy/bookings/:id/decline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/bookings/:id/decline', therapistAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE therapist_bookings
       SET status = 'cancelled', cancelled_by = 'therapist',
           cancellation_reason = 'therapist_declined', updated_at = NOW()
       WHERE id = $1 AND therapist_id = $2 AND status IN ('pending','confirmed')
       RETURNING id, member_user_id`,
      [req.params.id, req.therapist.profile_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });

    await issueFullRefund(rows[0].id).catch((e) => console.error('[therapy.decline.refund]', e.message));
    await notifyUser(rows[0].member_user_id, 'therapist_update', {
      message: 'Your booking was declined by the therapist. A full refund has been issued.',
    });

    // Flag therapist if second decline within 30 days
    const { rows: recentDeclines } = await query(
      `SELECT COUNT(*) AS cnt FROM therapist_bookings
       WHERE therapist_id = $1 AND cancelled_by = 'therapist'
         AND cancellation_reason = 'therapist_declined'
         AND updated_at > NOW() - INTERVAL '30 days'`,
      [req.therapist.profile_id]
    );
    if (parseInt(recentDeclines[0].cnt) >= 2) {
      console.warn('[therapy.decline] Therapist flagged â€” 2+ declines in 30 days:', req.therapist.profile_id);
      // Admin notification via notifications to all admins would go here
    }

    return res.status(200).json({ declined: true });
  } catch (err) {
    console.error('[therapy.booking.decline]', err.message);
    return res.status(500).json({ error: 'Failed to decline booking', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ PATCH /therapy/bookings/:id/cancel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Member cancellation with tiered refund policy.
router.patch('/bookings/:id/cancel', auth, async (req, res) => {
  try {
    const { rows: bookingRows } = await query(
      `SELECT id, therapist_id, scheduled_at, payment_status, credit_charged
       FROM therapist_bookings
       WHERE id = $1 AND member_user_id = $2 AND status IN ('pending','confirmed')`,
      [req.params.id, req.user.id]
    );
    if (!bookingRows.length) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });

    const b = bookingRows[0];
    const scheduledAt  = new Date(b.scheduled_at);
    const hoursUntil   = (scheduledAt - Date.now()) / (1000 * 60 * 60);

    let creditRefund = false;
    let mpesaRefundPct = 0; // 0â€“100

    if (hoursUntil > 24) {
      creditRefund = true;
      mpesaRefundPct = 100;
    } else if (hoursUntil >= 2) {
      creditRefund = false;
      mpesaRefundPct = 50;
    } else {
      // <2hr â€” check lifetime grace (first cancellation <2hr gets full refund)
      const { rows: graceRows } = await query(
        `SELECT COUNT(*) AS cnt FROM therapist_bookings
         WHERE member_user_id = $1
           AND cancelled_by = 'member'
           AND cancellation_reason = 'late_cancellation'`,
        [req.user.id]
      );
      const usedGrace = parseInt(graceRows[0].cnt) > 0;
      if (!usedGrace) {
        creditRefund = true;
        mpesaRefundPct = 100;
        await query(
          `UPDATE therapist_bookings SET cancellation_reason = 'late_cancellation', updated_at = NOW() WHERE id = $1`,
          [b.id]
        );
      }
      // else: no refund
    }

    await query(
      `UPDATE therapist_bookings
       SET status = 'cancelled', cancelled_by = 'member',
           cancellation_reason = COALESCE(cancellation_reason, 'member_cancelled'), updated_at = NOW()
       WHERE id = $1`,
      [b.id]
    );

    if (creditRefund && b.credit_charged > 0) {
      await refundCredit(req.user.id, b.credit_charged, b.id, 'therapy_booking_cancel').catch(
        (e) => console.error('[therapy.cancel.credit]', e.message)
      );
    }

    if (b.payment_status === 'paid' && mpesaRefundPct > 0) {
      if (mpesaRefundPct === 100) {
        await issueFullRefund(b.id).catch((e) => console.error('[therapy.cancel.refund.full]', e.message));
      } else {
        const memberPct = mpesaRefundPct / 100;
        await issuePartialRefund(b.id, memberPct).catch((e) => console.error('[therapy.cancel.refund.partial]', e.message));
      }
    }

    // Notify therapist
    const { rows: tpRows } = await query('SELECT user_id FROM therapist_profiles WHERE id = $1', [b.therapist_id]);
    if (tpRows.length) {
      await notifyUser(tpRows[0].user_id, 'therapist_update', {
        message: `A member cancelled their booking for ${new Date(b.scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}.`,
      });
    }

    return res.status(200).json({
      cancelled: true,
      credit_refunded: creditRefund,
      mpesa_refund_pct: mpesaRefundPct,
    });
  } catch (err) {
    console.error('[therapy.booking.cancel]', err.message);
    return res.status(500).json({ error: 'Failed to cancel booking', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/bookings', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const conditions = ['b.member_user_id = $1'];
    const params = [req.user.id];
    let idx = 2;

    if (status) { params.push(status); conditions.push(`b.status = $${idx++}`); }

    const { rows } = await query(
      `SELECT b.id, b.therapist_id, b.category_id, b.session_format, b.scheduled_at,
              b.duration_minutes, b.rate_kes, b.status, b.payment_status, b.escrow_status,
              b.cancellation_reason, b.credit_charged, b.created_at,
              tp.display_name AS therapist_display_name, tp.photo_url AS therapist_photo_url,
              tc.name AS category_name
       FROM therapist_bookings b
       JOIN therapist_profiles tp ON tp.id = b.therapist_id
       JOIN therapist_categories tc ON tc.id = b.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.scheduled_at DESC`,
      params
    );
    return res.status(200).json({ bookings: rows });
  } catch (err) {
    console.error('[therapy.bookings.list]', err.message);
    return res.status(500).json({ error: 'Failed to load bookings', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/bookings/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Member: full booking view. Therapist: includes member alias + notes.
router.get('/bookings/:id', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.id, b.member_user_id, b.therapist_id, b.category_id, b.session_format,
              b.scheduled_at, b.duration_minutes, b.rate_kes, b.platform_fee_kes,
              b.status, b.payment_status, b.escrow_status, b.cancellation_reason,
              b.credit_charged, b.notes, b.created_at,
              tp.display_name AS therapist_display_name, tp.photo_url AS therapist_photo_url,
              u.alias AS member_alias
       FROM therapist_bookings b
       JOIN therapist_profiles tp ON tp.id = b.therapist_id
       JOIN users u ON u.id = b.member_user_id
       WHERE b.id = $1 AND b.member_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });
    return res.status(200).json({ booking: rows[0] });
  } catch (err) {
    console.error('[therapy.booking.get]', err.message);
    return res.status(500).json({ error: 'Failed to load booking', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/sessions/start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Therapist starts the session. Generates TURN credentials and encrypted tokens.
router.post('/sessions/start', therapistAuth, async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id is required', code: 'MISSING_FIELDS' });

  try {
    // Verify booking belongs to this therapist and is confirmed within 15min window
    const { rows: bookingRows } = await query(
      `SELECT id, member_user_id, scheduled_at FROM therapist_bookings
       WHERE id = $1 AND therapist_id = $2 AND status = 'confirmed'
         AND scheduled_at BETWEEN NOW() - INTERVAL '15 minutes' AND NOW() + INTERVAL '15 minutes'`,
      [booking_id, req.therapist.profile_id]
    );
    if (!bookingRows.length) {
      return res.status(403).json({
        error: 'Booking not found, not confirmed, or outside the 15-minute start window',
        code: 'START_WINDOW_INVALID',
      });
    }

    // Check session not already started
    const { rows: existing } = await query(
      'SELECT id FROM therapy_sessions WHERE booking_id = $1',
      [booking_id]
    );
    if (existing.length) return res.status(409).json({ error: 'Session already started', code: 'ALREADY_STARTED' });

    const sessionId         = uuidv4();
    const rawTokenMember    = uuidv4();
    const rawTokenTherapist = uuidv4();
    const encTokenMember    = encrypt(rawTokenMember);
    const encTokenTherapist = encrypt(rawTokenTherapist);

    await query(
      `INSERT INTO therapy_sessions
         (id, booking_id, room_token_member, room_token_therapist, started_at, therapist_joined_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [sessionId, booking_id, encTokenMember, encTokenTherapist]
    );

    await query(
      `UPDATE therapist_bookings SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [booking_id]
    );

    const turnCredentials = await getTurnCredentials().catch(() => null);

    return res.status(200).json({
      session_id:              sessionId,
      room_token_therapist:    rawTokenTherapist,
      turn_credentials:        turnCredentials,
    });
  } catch (err) {
    console.error('[therapy.sessions.start]', err.message);
    return res.status(500).json({ error: 'Failed to start session', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/sessions/:booking_id/join â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Member joins an in-progress session. Token is single-use â€” nulled after delivery.
router.get('/sessions/:booking_id/join', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ts.id, ts.room_token_member, ts.member_joined_at
       FROM therapy_sessions ts
       JOIN therapist_bookings b ON b.id = ts.booking_id
       WHERE ts.booking_id = $1 AND b.member_user_id = $2 AND b.status = 'in_progress'`,
      [req.params.booking_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or not in progress', code: 'NOT_FOUND' });

    const session = rows[0];
    if (!session.room_token_member) {
      return res.status(410).json({ error: 'Session token already used', code: 'TOKEN_CONSUMED' });
    }

    const rawToken = decrypt(session.room_token_member);

    // Null the token and record member join time
    await query(
      `UPDATE therapy_sessions
       SET room_token_member = NULL, member_joined_at = COALESCE(member_joined_at, NOW())
       WHERE id = $1`,
      [session.id]
    );

    const turnCredentials = await getTurnCredentials().catch(() => null);

    return res.status(200).json({
      session_id:           session.id,
      room_token_member:    rawToken,
      turn_credentials:     turnCredentials,
    });
  } catch (err) {
    console.error('[therapy.sessions.join]', err.message);
    return res.status(500).json({ error: 'Failed to join session', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/sessions/:id/end â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/sessions/:id/end', therapistAuth, async (req, res) => {
  try {
    const { rows: sessionRows } = await query(
      `SELECT ts.id, ts.booking_id, ts.started_at, ts.therapist_joined_at, ts.member_joined_at
       FROM therapy_sessions ts
       JOIN therapist_bookings b ON b.id = ts.booking_id
       WHERE ts.id = $1 AND b.therapist_id = $2 AND b.status = 'in_progress'`,
      [req.params.id, req.therapist.profile_id]
    );
    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });

    const session = sessionRows[0];
    const now = new Date();
    const startedAt = new Date(session.therapist_joined_at || session.started_at);
    const durationBilled = Math.floor((now - startedAt) / (1000 * 60));

    await query(
      `UPDATE therapy_sessions
       SET ended_at = NOW(), duration_billed_minutes = $1
       WHERE id = $2`,
      [durationBilled, session.id]
    );

    // Fetch booking duration for partial-session check
    const { rows: bookingRows } = await query(
      'SELECT duration_minutes, member_user_id FROM therapist_bookings WHERE id = $1',
      [session.booking_id]
    );
    const { duration_minutes, member_user_id } = bookingRows[0];
    const isFullSession = durationBilled >= duration_minutes * 0.8;

    if (isFullSession) {
      await query(
        `UPDATE therapist_bookings
         SET status = 'completed', escrow_status = 'held', updated_at = NOW()
         WHERE id = $1`,
        [session.booking_id]
      );
    } else {
      // Partial session â€” flag for admin review; escrow stays held
      await query(
        `UPDATE therapist_bookings
         SET status = 'completed', escrow_status = 'held',
             cancellation_reason = 'partial_session', updated_at = NOW()
         WHERE id = $1`,
        [session.booking_id]
      );
      console.warn('[therapy.sessions.end] Partial session flagged for admin review:', session.booking_id);
    }

    // Increment therapist total_sessions
    await query(
      `UPDATE therapist_profiles SET total_sessions = total_sessions + 1, updated_at = NOW()
       WHERE id = $1`,
      [req.therapist.profile_id]
    );

    // Post-session prompts
    await notifyUser(member_user_id, 'therapist_update', {
      message: 'Your session has ended. How did it go? Rate your therapist to help others.',
      booking_id: session.booking_id,
    });
    await notifyUser(req.therapist.user_id, 'therapist_update', {
      message: 'Session ended. Add your session notes while they are fresh.',
      booking_id: session.booking_id,
    });

    return res.status(200).json({
      ended: true,
      duration_billed_minutes: durationBilled,
      full_session: isFullSession,
    });
  } catch (err) {
    console.error('[therapy.sessions.end]', err.message);
    return res.status(500).json({ error: 'Failed to end session', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/ratings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/ratings', auth, async (req, res) => {
  const { booking_id, rating, comment } = req.body;

  if (!booking_id || !rating) {
    return res.status(400).json({ error: 'booking_id and rating are required', code: 'MISSING_FIELDS' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer 1â€“5', code: 'INVALID_RATING' });
  }

  try {
    // Verify completed booking belongs to member
    const { rows: bookingRows } = await query(
      `SELECT b.therapist_id, b.member_user_id FROM therapist_bookings b
       WHERE b.id = $1 AND b.member_user_id = $2 AND b.status = 'completed'`,
      [booking_id, req.user.id]
    );
    if (!bookingRows.length) {
      return res.status(404).json({ error: 'Completed booking not found', code: 'NOT_FOUND' });
    }
    const { therapist_id } = bookingRows[0];

    // Insert rating (UNIQUE on booking_id enforced by DB)
    const { rows: ratingRows } = await query(
      `INSERT INTO therapist_ratings (booking_id, member_user_id, therapist_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [booking_id, req.user.id, therapist_id, rating, comment?.trim() || null]
    );

    // Recompute Bayesian average
    const { rows: aggRows } = await query(
      `SELECT COUNT(*) AS cnt, AVG(rating) AS avg_rating
       FROM therapist_ratings WHERE therapist_id = $1 AND flagged = false`,
      [therapist_id]
    );
    const cnt = parseInt(aggRows[0].cnt);
    const sumRatings = parseFloat(aggRows[0].avg_rating) * cnt;
    const newAvg = (BAYESIAN_C * BAYESIAN_MEAN + sumRatings) / (BAYESIAN_C + cnt);

    await query(
      `UPDATE therapist_profiles
       SET average_rating = $1, total_ratings_count = $2, updated_at = NOW()
       WHERE id = $3`,
      [newAvg.toFixed(4), cnt, therapist_id]
    );

    return res.status(201).json({ rating_id: ratingRows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already rated this session', code: 'ALREADY_RATED' });
    }
    console.error('[therapy.ratings]', err.message);
    return res.status(500).json({ error: 'Failed to submit rating', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/session-notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Therapist only â€” member cannot access this endpoint or data.
router.post('/session-notes', therapistAuth, async (req, res) => {
  const { booking_id, content } = req.body;
  if (!booking_id || !content?.trim()) {
    return res.status(400).json({ error: 'booking_id and content are required', code: 'MISSING_FIELDS' });
  }
  try {
    const { rows: bookingRows } = await query(
      'SELECT id FROM therapist_bookings WHERE id = $1 AND therapist_id = $2',
      [booking_id, req.therapist.profile_id]
    );
    if (!bookingRows.length) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });

    await query(
      `INSERT INTO therapy_session_notes (booking_id, therapist_id, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (booking_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [booking_id, req.therapist.profile_id, content.trim()]
    );
    return res.status(200).json({ saved: true });
  } catch (err) {
    console.error('[therapy.session-notes]', err.message);
    return res.status(500).json({ error: 'Failed to save notes', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ POST /therapy/disputes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/disputes', auth, async (req, res) => {
  const { booking_id, reason } = req.body;
  if (!booking_id || !reason?.trim()) {
    return res.status(400).json({ error: 'booking_id and reason are required', code: 'MISSING_FIELDS' });
  }
  try {
    // Booking must be completed within 24hrs and belong to member
    const { rows: bookingRows } = await query(
      `SELECT b.id, b.therapist_id, ts.ended_at
       FROM therapist_bookings b
       JOIN therapy_sessions ts ON ts.booking_id = b.id
       WHERE b.id = $1 AND b.member_user_id = $2 AND b.status = 'completed'
         AND ts.ended_at > NOW() - INTERVAL '${DISPUTE_WINDOW_HOURS} hours'`,
      [booking_id, req.user.id]
    );
    if (!bookingRows.length) {
      return res.status(403).json({
        error: `Disputes must be raised within ${DISPUTE_WINDOW_HOURS} hours of session end`,
        code: 'DISPUTE_WINDOW_CLOSED',
      });
    }

    // Check no existing open dispute
    const { rows: existingRows } = await query(
      `SELECT id FROM therapy_disputes WHERE booking_id = $1 AND status = 'open'`,
      [booking_id]
    );
    if (existingRows.length) {
      return res.status(409).json({ error: 'A dispute is already open for this session', code: 'DISPUTE_EXISTS' });
    }

    const disputeId = uuidv4();
    await query(
      `INSERT INTO therapy_disputes (id, booking_id, raised_by, raised_by_role, reason)
       VALUES ($1, $2, $3, 'member', $4)`,
      [disputeId, booking_id, req.user.id, reason.trim()]
    );

    // Freeze escrow
    await query(
      `UPDATE therapist_bookings SET escrow_status = 'disputed', updated_at = NOW() WHERE id = $1`,
      [booking_id]
    );

    // Freeze any pending payout
    await query(
      `UPDATE therapist_payouts SET status = 'pending', updated_at = NOW()
       WHERE booking_id = $1 AND status IN ('processing','pending')`,
      [booking_id]
    ).catch(() => {});

    console.warn('[therapy.disputes] New dispute raised â€” admin alert needed:', disputeId);

    return res.status(201).json({ dispute_id: disputeId });
  } catch (err) {
    console.error('[therapy.disputes]', err.message);
    return res.status(500).json({ error: 'Failed to raise dispute', code: 'QUERY_ERROR' });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// THERAPIST-SIDE ENDPOINTS  (all require therapistAuth)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ GET /therapy/therapist/dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/dashboard', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  try {
    const now = new Date().toISOString();
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [upcomingRes, pendingRes, earningsRes, profileRes] = await Promise.all([
      query(
        `SELECT b.id, b.scheduled_at, b.session_format, b.duration_minutes, b.status,
                u.alias AS member_alias
         FROM therapist_bookings b
         JOIN users u ON u.id = b.member_user_id
         WHERE b.therapist_id = $1
           AND b.status IN ('confirmed','in_progress')
           AND b.scheduled_at BETWEEN $2 AND $3
         ORDER BY b.scheduled_at ASC
         LIMIT 20`,
        [therapistId, now, in7Days]
      ),
      query(
        `SELECT b.id, b.scheduled_at, b.session_format, b.duration_minutes,
                u.alias AS member_alias
         FROM therapist_bookings b
         JOIN users u ON u.id = b.member_user_id
         WHERE b.therapist_id = $1 AND b.status = 'pending'
         ORDER BY b.created_at ASC`,
        [therapistId]
      ),
      query(
        `SELECT COALESCE(SUM(therapist_payout_kes), 0) AS month_earnings
         FROM therapist_bookings
         WHERE therapist_id = $1 AND status = 'completed' AND scheduled_at >= $2`,
        [therapistId, monthStart]
      ),
      query(
        `SELECT average_rating, total_sessions, total_ratings_count
         FROM therapist_profiles WHERE id = $1`,
        [therapistId]
      ),
    ]);

    return res.json({
      upcoming_sessions: upcomingRes.rows,
      pending_requests:  pendingRes.rows,
      earnings_this_month_kes: parseFloat(earningsRes.rows[0].month_earnings),
      average_rating:    profileRes.rows[0]?.average_rating ?? null,
      total_sessions:    profileRes.rows[0]?.total_sessions ?? 0,
      total_ratings_count: profileRes.rows[0]?.total_ratings_count ?? 0,
    });
  } catch (err) {
    console.error('[therapy.therapist.dashboard]', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapist/bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/bookings', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions = ['b.therapist_id = $1'];
  const params = [therapistId];
  let idx = 2;

  if (status) {
    const allowed = ['pending','confirmed','completed','cancelled','in_progress'];
    const statuses = status.split(',').filter(s => allowed.includes(s));
    if (statuses.length) {
      params.push(statuses);
      conditions.push(`b.status = ANY($${idx++})`);
    }
  }

  try {
    const { rows } = await query(
      `SELECT b.id, b.scheduled_at, b.session_format, b.duration_minutes,
              b.status, b.payment_status, b.notes AS member_notes,
              b.cancellation_reason, b.created_at,
              u.alias AS member_alias
       FROM therapist_bookings b
       JOIN users u ON u.id = b.member_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.scheduled_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM therapist_bookings b WHERE ${conditions.join(' AND ')}`,
      params
    );

    return res.json({
      bookings: rows,
      total: parseInt(countRows[0].total),
      page: parseInt(page),
      total_pages: Math.ceil(parseInt(countRows[0].total) / parseInt(limit)),
    });
  } catch (err) {
    console.error('[therapy.therapist.bookings]', err.message);
    return res.status(500).json({ error: 'Failed to load bookings', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapist/availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/availability', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  try {
    const [availRes, bookingsRes] = await Promise.all([
      query(
        `SELECT id, day_of_week, start_time, end_time, is_active
         FROM therapist_availability WHERE therapist_id = $1
         ORDER BY day_of_week, start_time`,
        [therapistId]
      ),
      query(
        `SELECT scheduled_at, duration_minutes, status
         FROM therapist_bookings
         WHERE therapist_id = $1
           AND status IN ('confirmed','in_progress')
           AND scheduled_at >= NOW()
           AND scheduled_at <= NOW() + INTERVAL '28 days'`,
        [therapistId]
      ),
    ]);

    return res.json({
      availability: availRes.rows,
      bookings: bookingsRes.rows,
    });
  } catch (err) {
    console.error('[therapy.therapist.availability]', err.message);
    return res.status(500).json({ error: 'Failed to load availability', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ PATCH /therapy/therapist/availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/therapist/availability', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  const { slots } = req.body; // [{ day_of_week, start_time, end_time, is_active }]
  if (!Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'slots array required', code: 'MISSING_FIELDS' });
  }

  try {
    // Guard: cannot deactivate a slot that has a confirmed booking
    const { rows: bookedSlots } = await query(
      `SELECT EXTRACT(DOW FROM scheduled_at AT TIME ZONE 'Africa/Nairobi') AS dow,
              TO_CHAR(scheduled_at AT TIME ZONE 'Africa/Nairobi', 'HH24:MI') AS start_time
       FROM therapist_bookings
       WHERE therapist_id = $1 AND status IN ('confirmed','in_progress') AND scheduled_at >= NOW()`,
      [therapistId]
    );

    const bookedKeys = new Set(bookedSlots.map(r => `${r.dow}::${r.start_time}`));

    for (const slot of slots) {
      const key = `${slot.day_of_week}::${slot.start_time}`;
      if (!slot.is_active && bookedKeys.has(key)) {
        return res.status(409).json({
          error: `Cannot deactivate slot ${slot.start_time} on day ${slot.day_of_week} â€” a confirmed booking exists`,
          code: 'SLOT_HAS_BOOKING',
        });
      }
    }

    for (const slot of slots) {
      await query(
        `INSERT INTO therapist_availability (id, therapist_id, day_of_week, start_time, end_time, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (therapist_id, day_of_week, start_time)
         DO UPDATE SET end_time = $5, is_active = $6, updated_at = NOW()`,
        [uuidv4(), therapistId, slot.day_of_week, slot.start_time, slot.end_time, slot.is_active]
      );
    }

    return res.json({ updated: slots.length });
  } catch (err) {
    console.error('[therapy.therapist.availability.patch]', err.message);
    return res.status(500).json({ error: 'Failed to update availability', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapist/payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/payments', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [rowsRes, summaryRes, countRes] = await Promise.all([
      query(
        `SELECT b.id AS booking_id, b.scheduled_at, b.session_format, b.duration_minutes,
                b.rate_kes, b.platform_fee_kes, b.therapist_payout_kes,
                p.status AS payout_status, p.mpesa_reference, p.created_at AS payout_date
         FROM therapist_bookings b
         LEFT JOIN therapist_payouts p ON p.booking_id = b.id
         WHERE b.therapist_id = $1 AND b.status = 'completed'
         ORDER BY b.scheduled_at DESC
         LIMIT $2 OFFSET $3`,
        [therapistId, parseInt(limit), offset]
      ),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM scheduled_at) = EXTRACT(MONTH FROM NOW())
                              AND EXTRACT(YEAR FROM scheduled_at) = EXTRACT(YEAR FROM NOW())
                             THEN therapist_payout_kes ELSE 0 END), 0) AS month_kes,
           COALESCE(SUM(therapist_payout_kes), 0) AS lifetime_kes
         FROM therapist_bookings
         WHERE therapist_id = $1 AND status = 'completed'`,
        [therapistId]
      ),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'pending' THEN therapist_payout_kes ELSE 0 END), 0) AS pending_kes,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN therapist_payout_kes ELSE 0 END), 0) AS completed_kes
         FROM therapist_payouts p
         JOIN therapist_bookings b ON b.id = p.booking_id
         WHERE b.therapist_id = $1`,
        [therapistId]
      ),
    ]);

    return res.json({
      payments: rowsRes.rows,
      summary: {
        month_kes:     parseFloat(summaryRes.rows[0].month_kes),
        lifetime_kes:  parseFloat(summaryRes.rows[0].lifetime_kes),
        pending_kes:   parseFloat(countRes.rows[0].pending_kes),
        completed_kes: parseFloat(countRes.rows[0].completed_kes),
      },
      page: parseInt(page),
    });
  } catch (err) {
    console.error('[therapy.therapist.payments]', err.message);
    return res.status(500).json({ error: 'Failed to load payments', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapist/ratings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/ratings', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  try {
    const [ratingsRes, distRes] = await Promise.all([
      query(
        `SELECT r.rating, r.comment,
                TO_CHAR(r.created_at, 'Mon YYYY') AS month_year
         FROM therapist_ratings r
         WHERE r.therapist_id = $1 AND r.flagged = false
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [therapistId]
      ),
      query(
        `SELECT rating, COUNT(*) AS cnt
         FROM therapist_ratings
         WHERE therapist_id = $1 AND flagged = false
         GROUP BY rating ORDER BY rating DESC`,
        [therapistId]
      ),
    ]);

    const { rows: profileRows } = await query(
      `SELECT average_rating, total_ratings_count FROM therapist_profiles WHERE id = $1`,
      [therapistId]
    );

    const distribution = [5,4,3,2,1].map(star => ({
      star,
      count: parseInt(distRes.rows.find(r => parseInt(r.rating) === star)?.cnt ?? 0),
    }));

    return res.json({
      ratings: ratingsRes.rows,
      distribution,
      average_rating: profileRows[0]?.average_rating ?? null,
      total_ratings_count: profileRows[0]?.total_ratings_count ?? 0,
    });
  } catch (err) {
    console.error('[therapy.therapist.ratings]', err.message);
    return res.status(500).json({ error: 'Failed to load ratings', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ GET /therapy/therapist/profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/therapist/profile', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  try {
    const { rows } = await query(
      `SELECT tp.id, tp.display_name, tp.full_name, tp.credentials, tp.photo_url,
              tp.plain_language_intro, tp.approach_plain, tp.cultural_competencies,
              tp.languages, tp.session_formats, tp.rate_per_session_kes,
              tp.availability_status, tp.registration_number, tp.kcpa_level,
              tp.total_sessions, tp.average_rating, tp.total_ratings_count,
              tp.is_verified, tp.suspended, tp.age, tp.gender,
              tp.statement, tp.years_experience
       FROM therapist_profiles tp WHERE tp.id = $1`,
      [therapistId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found', code: 'NOT_FOUND' });
    return res.json({ profile: rows[0] });
  } catch (err) {
    console.error('[therapy.therapist.profile.get]', err.message);
    return res.status(500).json({ error: 'Failed to load profile', code: 'QUERY_ERROR' });
  }
});

// â”€â”€â”€ PATCH /therapy/therapist/profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/therapist/profile', therapistAuth, async (req, res) => {
  const therapistId = req.therapist.profile_id;
  const EDITABLE = [
    'photo_url', 'plain_language_intro', 'approach_plain', 'cultural_competencies',
    'languages', 'session_formats', 'rate_per_session_kes', 'availability_status', 'statement',
  ];

  const updates = {};
  for (const key of EDITABLE) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No editable fields provided', code: 'MISSING_FIELDS' });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = [therapistId, ...Object.values(updates)];

  try {
    await query(
      `UPDATE therapist_profiles SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`,
      values
    );
    return res.json({ updated: true });
  } catch (err) {
    console.error('[therapy.therapist.profile.patch]', err.message);
    return res.status(500).json({ error: 'Failed to update profile', code: 'QUERY_ERROR' });
  }
});

module.exports = router;
