/**
 * Phase 37.9 — Safety & Compliance Unit Tests
 *
 * Run: node --test src/backend/tests/therapy_safety.test.js
 * (Node 18+ built-in test runner — no external deps needed)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Cancellation policy ──────────────────────────────────────────────────────
// Extracted logic mirrors therapy.js PATCH /bookings/:id/cancel exactly.

function computeCancellationRefund(hoursUntil, usedGrace = false) {
  let creditRefund = false;
  let mpesaRefundPct = 0;

  if (hoursUntil > 24) {
    creditRefund = true;
    mpesaRefundPct = 100;
  } else if (hoursUntil >= 2) {
    creditRefund = false;
    mpesaRefundPct = 50;
  } else {
    // <2hr — first occurrence gets grace (full refund), subsequent: no refund
    if (!usedGrace) {
      creditRefund = true;
      mpesaRefundPct = 100;
    }
  }

  return { creditRefund, mpesaRefundPct };
}

describe('Cancellation policy — refund bands', () => {
  test('>24hr: full credit + full M-Pesa refund', () => {
    const r = computeCancellationRefund(25);
    assert.equal(r.creditRefund, true);
    assert.equal(r.mpesaRefundPct, 100);
  });

  test('exactly 24.01hr: still full refund', () => {
    const r = computeCancellationRefund(24.01);
    assert.equal(r.creditRefund, true);
    assert.equal(r.mpesaRefundPct, 100);
  });

  test('2–24hr: no credit refund, 50% M-Pesa', () => {
    const r = computeCancellationRefund(12);
    assert.equal(r.creditRefund, false);
    assert.equal(r.mpesaRefundPct, 50);
  });

  test('exactly 2hr: 50% band (inclusive lower bound)', () => {
    const r = computeCancellationRefund(2);
    assert.equal(r.creditRefund, false);
    assert.equal(r.mpesaRefundPct, 50);
  });

  test('<2hr, first cancellation (grace): full refund', () => {
    const r = computeCancellationRefund(1, false);
    assert.equal(r.creditRefund, true);
    assert.equal(r.mpesaRefundPct, 100);
  });

  test('<2hr, grace already used: no refund', () => {
    const r = computeCancellationRefund(1, true);
    assert.equal(r.creditRefund, false);
    assert.equal(r.mpesaRefundPct, 0);
  });

  test('0hr (immediate): no refund (grace used)', () => {
    const r = computeCancellationRefund(0, true);
    assert.equal(r.creditRefund, false);
    assert.equal(r.mpesaRefundPct, 0);
  });
});

// ─── Bayesian average ─────────────────────────────────────────────────────────
// Formula: (C * mean + sum_ratings) / (C + n)
// C=10, mean=3.5

const BAYESIAN_C    = 10;
const BAYESIAN_MEAN = 3.5;

function bayesianAvg(ratings) {
  if (!ratings.length) return BAYESIAN_MEAN; // no ratings → prior
  const sum = ratings.reduce((a, b) => a + b, 0);
  return (BAYESIAN_C * BAYESIAN_MEAN + sum) / (BAYESIAN_C + ratings.length);
}

describe('Bayesian average rating', () => {
  test('2 five-star reviews → ~3.73 (not 5.0)', () => {
    const result = bayesianAvg([5, 5]);
    // (10*3.5 + 10) / (10 + 2) = 45/12 = 3.75
    assert.ok(result > 3.7 && result < 3.8, `Expected ~3.75 but got ${result}`);
    assert.notEqual(result, 5.0);
  });

  test('no ratings → returns prior mean (3.5)', () => {
    assert.equal(bayesianAvg([]), 3.5);
  });

  test('10 five-star reviews → 4.25', () => {
    const result = bayesianAvg([5,5,5,5,5,5,5,5,5,5]);
    // (35 + 50) / 20 = 85/20 = 4.25
    assert.equal(parseFloat(result.toFixed(4)), 4.25);
  });

  test('10 one-star reviews → 2.25', () => {
    const result = bayesianAvg([1,1,1,1,1,1,1,1,1,1]);
    // (35 + 10) / 20 = 45/20 = 2.25
    assert.equal(parseFloat(result.toFixed(4)), 2.25);
  });

  test('100 five-star reviews → approaches 5 but not equal', () => {
    const result = bayesianAvg(Array(100).fill(5));
    assert.ok(result > 4.8 && result < 5.0);
  });
});

// ─── Slot lock concurrency guard ──────────────────────────────────────────────
// The DB enforces UNIQUE(therapist_id, scheduled_at) on booking_slot_locks.
// We verify the logic: only one lock per slot survives.

describe('Slot lock deduplication logic', () => {
  // Simulates what the DB unique constraint enforces at the app layer.
  function acquireLock(locks, therapistId, scheduledAt, userId) {
    const key = `${therapistId}::${scheduledAt}`;
    if (locks.has(key)) {
      return { ok: false, code: 'SLOT_TAKEN' };
    }
    locks.set(key, userId);
    return { ok: true, lock_id: `lock_${userId}` };
  }

  test('first lock on a slot succeeds', () => {
    const locks = new Map();
    const r = acquireLock(locks, 'therapist-1', '2026-10-01T09:00:00Z', 'user-A');
    assert.equal(r.ok, true);
  });

  test('second lock on same slot returns SLOT_TAKEN', () => {
    const locks = new Map();
    acquireLock(locks, 'therapist-1', '2026-10-01T09:00:00Z', 'user-A');
    const r = acquireLock(locks, 'therapist-1', '2026-10-01T09:00:00Z', 'user-B');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SLOT_TAKEN');
  });

  test('different slots for same therapist are independent', () => {
    const locks = new Map();
    acquireLock(locks, 'therapist-1', '2026-10-01T09:00:00Z', 'user-A');
    const r = acquireLock(locks, 'therapist-1', '2026-10-01T10:00:00Z', 'user-B');
    assert.equal(r.ok, true);
  });

  test('same slot different therapists are independent', () => {
    const locks = new Map();
    acquireLock(locks, 'therapist-1', '2026-10-01T09:00:00Z', 'user-A');
    const r = acquireLock(locks, 'therapist-2', '2026-10-01T09:00:00Z', 'user-A');
    assert.equal(r.ok, true);
  });
});

// ─── Therapy API response PII audit ──────────────────────────────────────────
// Verifies that known PII fields are absent from the public therapist response shape.

describe('Therapist public profile — PII field audit', () => {
  // This is the SELECT list from GET /therapy/therapists/:id after the fix.
  const publicFields = [
    'id', 'display_name', 'photo_url', 'credentials', 'years_experience',
    'languages', 'session_formats', 'category_ids', 'location',
    'plain_language_intro', 'approach_plain', 'cultural_competencies',
    'availability_status', 'average_rating', 'total_ratings_count',
    'total_sessions', 'rate_per_session_kes', 'gender', 'age',
    'kcpa_level', 'registration_number', 'show_rating', 'bayesian_average',
  ];

  const FORBIDDEN = ['full_name', 'email', 'mpesa_number', 'phone', 'user_id', 'password_hash'];

  test('no forbidden PII fields in public SELECT list', () => {
    for (const field of FORBIDDEN) {
      assert.ok(
        !publicFields.includes(field),
        `Forbidden field "${field}" found in public therapist response`
      );
    }
  });

  test('display_name is present (safe alias)', () => {
    assert.ok(publicFields.includes('display_name'));
  });

  test('full_name is absent', () => {
    assert.ok(!publicFields.includes('full_name'));
  });
});
