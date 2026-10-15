// Free trial claim: starts the 7-day trial and grants the first 2 credits immediately,
// so the trial welcome screen's "Talk to someone" works on day 0. The nightly drip
// (jobs/trialDripJob.js) adds 2 more each morning until trial_credits_issued reaches 14.
//
// The day-0 grant is recorded as type 'trial_drip' so trial expiry clawback treats it
// like every other trial credit.

const TRIAL_INITIAL_CREDITS = 2;
const TRIAL_DAYS = 7;

// tx: a pg client inside a transaction (db.transaction). Returns { claimed, trial_ends_at }.
// The claim is atomic: the WHERE trial_claimed_at IS NULL guard means two concurrent
// claims cannot both grant credits.
async function claimTrial(tx, userId) {
  const { rows } = await tx.query(
    `UPDATE users
     SET trial_claimed_at       = NOW(),
         trial_ends_at          = NOW() + make_interval(days => $2::int),
         trial_ai_sessions_used = 0,
         trial_credits_issued   = $3
     WHERE id = $1 AND trial_claimed_at IS NULL
     RETURNING trial_ends_at`,
    [userId, TRIAL_DAYS, TRIAL_INITIAL_CREDITS]
  );
  if (!rows.length) return { claimed: false, trial_ends_at: null };

  const { rowCount } = await tx.query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [TRIAL_INITIAL_CREDITS, userId]
  );
  if (!rowCount) throw new Error('credits row missing for user');

  await tx.query(
    `INSERT INTO credit_transactions (user_id, amount_credits, type, payment_method, channel, status)
     VALUES ($1, $2, 'trial_drip', 'bonus', 'trial', 'confirmed')`,
    [userId, TRIAL_INITIAL_CREDITS]
  );

  return { claimed: true, trial_ends_at: rows[0].trial_ends_at };
}

module.exports = { claimTrial, TRIAL_INITIAL_CREDITS, TRIAL_DAYS };
