'use strict';

/**
 * Referral outcome report (read-only). CHECKLIST.md Phase 46.
 *
 * The outcome this feature moves: paying users acquired through referrals, and what they cost.
 *   referred signups → converted (first purchase) → conversion rate, credits given away per paying user
 *
 * Usage: node scripts/referral_report.js [days=30]   (from src/backend)
 */

const { SIGNUP_BONUS_CREDITS } = require('../services/referrals');

// Pure: rows [{ status, credits_awarded, hours_to_convert }] → summary. Tested in tests/referrals.test.js.
function summarize(rows) {
  const signups = rows.length;
  const converted = rows.filter(r => r.status === 'credited');
  const rewardCredits = converted.reduce((n, r) => n + Number(r.credits_awarded), 0);
  const bonusCredits = signups * SIGNUP_BONUS_CREDITS;
  const hours = converted.map(r => Number(r.hours_to_convert)).filter(Number.isFinite).sort((a, b) => a - b);
  const median = hours.length
    ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2)
    : null;
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    referredSignups: signups,
    converted: converted.length,
    pending: signups - converted.length,
    conversionRatePct: signups ? round1((converted.length / signups) * 100) : null,
    creditsGiven: { signupBonus: bonusCredits, referrerRewards: rewardCredits, total: bonusCredits + rewardCredits },
    creditsPerPayingUser: converted.length ? round1((bonusCredits + rewardCredits) / converted.length) : null,
    medianHoursToConvert: median === null ? null : round1(median),
  };
}

const REPORT_SQL = `
  SELECT status, credits_awarded,
         EXTRACT(EPOCH FROM (credited_at - created_at)) / 3600 AS hours_to_convert
  FROM referral_rewards
  WHERE created_at > NOW() - ($1 || ' days')::interval`;

async function main() {
  const days = String(parseInt(process.argv[2], 10) || 30);
  const { query, pool } = require('../db');
  try {
    const { rows } = await query(REPORT_SQL, [days]);
    const { rows: codes } = await query('SELECT COUNT(*)::int AS n FROM users WHERE referral_code IS NOT NULL');
    console.log(JSON.stringify({ windowDays: Number(days), usersWithCode: codes[0].n, ...summarize(rows) }, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  // Explicit exit: db/index.js keeps a pool-saturation interval alive.
  main().then(() => process.exit(0), (err) => { console.error(err.message); process.exit(1); });
}

module.exports = { summarize, REPORT_SQL };
