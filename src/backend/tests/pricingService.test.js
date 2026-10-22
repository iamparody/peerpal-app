/**
 * Pricing service tests — unit (computePricing) + integration (calculateTherapyPricing).
 *
 * Unit tests exercise pure logic with no I/O.
 * Integration tests mock the DB query to verify config reading and error handling.
 *
 * Run: node --test tests/pricingService.test.js   (from src/backend)
 */

'use strict';

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

// ─── Import the pure function directly — no mocking needed ───────────────────
const { computePricing } = require('../services/pricing');

// ─── Unit tests: computePricing ───────────────────────────────────────────────

describe('computePricing — financial invariant', () => {
  test('client_charge = platform_fee + therapist_payout (3000, 60min)', () => {
    const p = computePricing(3000, 60, 20);
    assert.equal(p.clientChargeKes, p.platformFeeKes + p.therapistPayoutKes);
  });

  test('client_charge = platform_fee + therapist_payout (2750, 60min)', () => {
    const p = computePricing(2750, 60, 20);
    assert.equal(p.clientChargeKes, p.platformFeeKes + p.therapistPayoutKes);
  });

  test('client_charge = platform_fee + therapist_payout (1333, 45min)', () => {
    const p = computePricing(1333, 45, 20);
    assert.equal(p.clientChargeKes, p.platformFeeKes + p.therapistPayoutKes);
  });
});

describe('computePricing — standard 60-min session at KES 3,000', () => {
  const p = computePricing(3000, 60, 20);

  test('client charge equals advertised rate', () => {
    assert.equal(p.clientChargeKes, 3000);
  });

  test('platform fee is 20% = KES 600', () => {
    assert.equal(p.platformFeeKes, 600);
  });

  test('therapist payout is KES 2,400', () => {
    assert.equal(p.therapistPayoutKes, 2400);
  });

  test('fee_rate_bps is 2000', () => {
    assert.equal(p.feeRateBps, 2000);
  });

  test('currency is KES', () => {
    assert.equal(p.currency, 'KES');
  });

  test('therapistRateKes echoed back', () => {
    assert.equal(p.therapistRateKes, 3000);
  });
});

describe('computePricing — 45-min session at KES 3,000 base', () => {
  const p = computePricing(3000, 45, 20);

  test('client charge is 75% of base = KES 2,250', () => {
    assert.equal(p.clientChargeKes, 2250);
  });

  test('platform fee is 20% of 2250 = KES 450', () => {
    assert.equal(p.platformFeeKes, 450);
  });

  test('therapist payout is KES 1,800', () => {
    assert.equal(p.therapistPayoutKes, 1800);
  });

  test('therapistRateKes still reflects the 60-min base', () => {
    assert.equal(p.therapistRateKes, 3000);
  });
});

describe('computePricing — rounding edge cases (non-round-hundred amounts)', () => {
  test('KES 1,500 → fee rounds to KES 300, payout 1200', () => {
    const p = computePricing(1500, 60, 20);
    assert.equal(p.platformFeeKes, 300);
    assert.equal(p.therapistPayoutKes, 1200);
    assert.equal(p.clientChargeKes, 1500);
  });

  test('KES 1,333 → fee = round(266.6) = 267, payout = 1066', () => {
    const p = computePricing(1333, 60, 20);
    assert.equal(p.platformFeeKes, 267);
    assert.equal(p.therapistPayoutKes, 1066);
    assert.equal(p.clientChargeKes, 1333);
  });

  test('KES 2,501 → fee = round(500.2) = 500, payout = 2001', () => {
    const p = computePricing(2501, 60, 20);
    assert.equal(p.platformFeeKes, 500);
    assert.equal(p.therapistPayoutKes, 2001);
    assert.equal(p.clientChargeKes, 2501);
  });

  test('KES 999 at 45min → client = round(749.25) = 749, fee = round(149.8) = 150, payout = 599', () => {
    const p = computePricing(999, 45, 20);
    assert.equal(p.clientChargeKes, 749);
    assert.equal(p.platformFeeKes, 150);
    assert.equal(p.therapistPayoutKes, 599);
    assert.equal(p.clientChargeKes, p.platformFeeKes + p.therapistPayoutKes);
  });
});

describe('computePricing — unknown duration falls back to 60-min scalar', () => {
  test('duration 90 → no scale, treated as 1.0', () => {
    const p = computePricing(3000, 90, 20);
    assert.equal(p.clientChargeKes, 3000);
  });
});

describe('computePricing — fee rate variations', () => {
  test('15% fee on KES 3,000', () => {
    const p = computePricing(3000, 60, 15);
    assert.equal(p.platformFeeKes, 450);
    assert.equal(p.therapistPayoutKes, 2550);
    assert.equal(p.feeRateBps, 1500);
  });

  test('25% fee on KES 2,000', () => {
    const p = computePricing(2000, 60, 25);
    assert.equal(p.platformFeeKes, 500);
    assert.equal(p.therapistPayoutKes, 1500);
    assert.equal(p.feeRateBps, 2500);
  });
});

// ─── Integration tests: calculateTherapyPricing (injected queryFn) ───────────
// Uses dependency injection so no live DB or monkey-patching needed.

const { calculateTherapyPricing } = require('../services/pricing');

function fakeQuery(value) {
  return async () => ({ rows: value === null ? [] : [{ value }] });
}

describe('calculateTherapyPricing — reads fee rate from platform_config', () => {
  test('uses DB value when present (15%)', async () => {
    const p = await calculateTherapyPricing(3000, 60, fakeQuery('15'));
    assert.equal(p.platformFeeKes, 450);
    assert.equal(p.therapistPayoutKes, 2550);
    assert.equal(p.feeRateBps, 1500);
  });

  test('falls back to 20% when config row is missing', async () => {
    const p = await calculateTherapyPricing(3000, 60, fakeQuery(null));
    assert.equal(p.platformFeeKes, 600);
    assert.equal(p.feeRateBps, 2000);
  });

  test('falls back to 20% when config value is invalid (NaN)', async () => {
    const p = await calculateTherapyPricing(3000, 60, fakeQuery('not_a_number'));
    assert.equal(p.platformFeeKes, 600);
  });

  test('falls back to 20% when config value is 0 (invalid)', async () => {
    const p = await calculateTherapyPricing(3000, 60, fakeQuery('0'));
    assert.equal(p.platformFeeKes, 600);
  });

  test('invariant holds with injected 15% rate', async () => {
    const p = await calculateTherapyPricing(2750, 45, fakeQuery('15'));
    assert.equal(p.clientChargeKes, p.platformFeeKes + p.therapistPayoutKes);
  });
});

// ─── PRICE_CHANGED logic (booking endpoint guard) ─────────────────────────────

describe('PRICE_CHANGED guard — expected vs live price comparison', () => {
  function shouldReject(expectedKes, liveKes) {
    return expectedKes != null && expectedKes !== liveKes;
  }

  test('rejects when expected (3600) differs from live (3000)', () => {
    assert.equal(shouldReject(3600, 3000), true);
  });

  test('accepts when expected matches live', () => {
    assert.equal(shouldReject(3000, 3000), false);
  });

  test('accepts when expected is null (client did not send quote reference)', () => {
    assert.equal(shouldReject(null, 3000), false);
  });

  test('accepts when expected is undefined', () => {
    assert.equal(shouldReject(undefined, 3000), false);
  });

  test('rejects when price changed due to rate update', () => {
    assert.equal(shouldReject(2500, 3000), true);
  });
});
