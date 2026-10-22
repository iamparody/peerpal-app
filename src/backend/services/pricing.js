'use strict';

/**
 * Central therapy session pricing service.
 *
 * All commission calculations go through here — never duplicated in routes or on the frontend.
 * Fee rate is read from platform_config so it can be changed without a deploy.
 *
 * Rounding policy: half-up (Math.round) on platform fee; payout derived by subtraction.
 * This means platform_fee_kes + therapist_payout_kes = client_charge_kes always.
 */

const { query } = require('../db');

const DURATION_SCALAR = { 45: 0.75, 60: 1.0 };
const DEFAULT_FEE_PCT = 20;

/**
 * Read the current platform fee percentage from platform_config.
 * Falls back to DEFAULT_FEE_PCT if the config row is absent or invalid.
 * Accepts an optional queryFn for testing without DB.
 */
async function getFeeRatePct(queryFn = query) {
  const { rows } = await queryFn(
    "SELECT value FROM platform_config WHERE key = 'therapist_platform_fee_pct'",
    []
  );
  const raw = rows[0]?.value;
  const pct = parseFloat(raw);
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : DEFAULT_FEE_PCT;
}

/**
 * Pure computation — no I/O. Exported for unit tests.
 *
 * @param {number} therapistRateKes  - The therapist's advertised rate (60-min base)
 * @param {number} durationMinutes   - Session duration (45 or 60)
 * @param {number} feeRatePct        - Platform commission percentage (e.g. 20)
 * @returns {{
 *   therapistRateKes: number,
 *   clientChargeKes:  number,
 *   platformFeeKes:   number,
 *   therapistPayoutKes: number,
 *   feeRateBps:       number,
 *   currency:         string
 * }}
 */
function computePricing(therapistRateKes, durationMinutes, feeRatePct) {
  const scalar = DURATION_SCALAR[durationMinutes] ?? 1.0;
  const clientChargeKes = Math.round(therapistRateKes * scalar);
  const feeRateBps = Math.round(feeRatePct * 100);
  const platformFeeKes = Math.round(clientChargeKes * feeRatePct / 100);
  const therapistPayoutKes = clientChargeKes - platformFeeKes;

  return {
    therapistRateKes,
    clientChargeKes,
    platformFeeKes,
    therapistPayoutKes,
    feeRateBps,
    currency: 'KES',
  };
}

/**
 * Async version: reads fee rate from DB, then computes.
 * Accepts an optional queryFn for testing without DB.
 *
 * @param {number} therapistRateKes
 * @param {number} durationMinutes
 * @param {Function} [queryFn]
 */
async function calculateTherapyPricing(therapistRateKes, durationMinutes, queryFn) {
  const feeRatePct = await getFeeRatePct(queryFn);
  return computePricing(therapistRateKes, durationMinutes, feeRatePct);
}

module.exports = { calculateTherapyPricing, computePricing, getFeeRatePct };
