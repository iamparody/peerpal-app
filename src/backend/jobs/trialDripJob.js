const { query, transaction } = require('../db');
const { enqueuePushNotification } = require('../utils/fcm');
const logger = require('../utils/logger');

// ── Trial drip job ────────────────────────────────────────────────────────────
// Runs daily at 06:00 EAT (03:00 UTC).
// Issues 2 credits to every user on an active trial, up to 14 total.
async function runTrialDrip() {
  const { rows: users } = await query(
    `SELECT id FROM users
     WHERE trial_claimed_at IS NOT NULL
       AND trial_ends_at > NOW()
       AND trial_credits_issued < 14
       AND trial_claimed_at::date < CURRENT_DATE`
  );
  if (!users.length) return;

  for (const user of users) {
    try {
      // One transaction per user: balance, ledger row and counter move together or not at all.
      // (Previously the balance update committed before a failing ledger insert, so the counter
      // never advanced and the 14-credit cap never applied.)
      await transaction(async (client) => {
        // Guard: never exceed 14 total. FOR UPDATE serialises concurrent runs.
        const { rows } = await client.query(
          'SELECT trial_credits_issued FROM users WHERE id = $1 FOR UPDATE',
          [user.id]
        );
        if (!rows[0] || rows[0].trial_credits_issued + 2 > 14) return;

        await client.query('UPDATE credits SET balance = balance + 2 WHERE user_id = $1', [user.id]);
        await client.query(
          `INSERT INTO credit_transactions (user_id, amount_credits, type, payment_method, channel, status)
           VALUES ($1, 2, 'trial_drip', 'bonus', 'trial', 'confirmed')`,
          [user.id]
        );
        await client.query(
          'UPDATE users SET trial_credits_issued = trial_credits_issued + 2 WHERE id = $1',
          [user.id]
        );
      });
    } catch (err) {
      console.error(`[trialDrip] user ${user.id}:`, err.message);
    }
  }
  console.log(`[trialDrip] dripped 2 credits to ${users.length} users`);
}

// ── Day 6 reminder job ────────────────────────────────────────────────────────
// Sends push + in-app to users whose trial expires in ~24 hours.
async function runTrialReminder() {
  const { rows: users } = await query(
    `SELECT id FROM users
     WHERE trial_claimed_at IS NOT NULL
       AND trial_ends_at BETWEEN NOW() + INTERVAL '20 hours'
                              AND NOW() + INTERVAL '28 hours'`
  );
  for (const user of users) {
    try {
      const title = 'Trial ends tomorrow';
      const body  = 'Everything you experienced is still here when you top up.';
      const notifPayload = JSON.stringify({ message: body, route: '/credits' });
      await query(
        `INSERT INTO notifications (user_id, type, payload, channel)
         VALUES ($1, 'trial_reminder', $2, 'push'),
                ($1, 'trial_reminder', $2, 'in_app')`,
        [user.id, notifPayload]
      );
      const { rows: tokenRows } = await query(
        'SELECT fcm_token FROM users WHERE id = $1', [user.id]
      );
      if (tokenRows[0]?.fcm_token) {
        await enqueuePushNotification(tokenRows[0].fcm_token, title, body, { type: 'trial_reminder', route: '/credits' });
      }
    } catch (err) {
      console.error(`[trialReminder] user ${user.id}:`, err.message);
    }
  }
  if (users.length) console.log(`[trialReminder] sent to ${users.length} users`);
}

// ── Trial expiry job ──────────────────────────────────────────────────────────
// Runs daily at 06:05 EAT (03:05 UTC), just after reminder.
// Removes unspent trial_drip credits and sends in-app notification.
//
// docs/phase47-spec.md: unspent = trial_drip issued − debits since trial_claimed_at, remove the
// lesser of that or the balance, never touch purchase/referral/promo credits.
// Debits are stored as positive 'debit' rows (utils/creditDeductor.js), refunds as positive
// 'refund' rows. Credits are fungible, so spending is counted against trial credits first:
// that removes the least and is the only reading that cannot take a purchased credit.
//
// The removal is itself written as a 'debit' (channel 'trial'), so it counts as spent on any
// re-run: the 25h window overlaps the 24h cron by an hour, and a second pass must remove 0.
async function expireTrialCredits(tx, userId, trialClaimedAt) {
  const { rows: bal } = await tx.query(
    'SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  const { rows: sums } = await tx.query(
    `SELECT
       COALESCE(SUM(amount_credits) FILTER (WHERE type = 'trial_drip' AND created_at >= $2), 0)::int AS issued,
       COALESCE(SUM(amount_credits) FILTER (WHERE type = 'debit'  AND created_at >= $2), 0)::int AS debited,
       COALESCE(SUM(amount_credits) FILTER (WHERE type = 'refund' AND created_at >= $2), 0)::int AS refunded
     FROM credit_transactions
     WHERE user_id = $1 AND status = 'confirmed'`,
    [userId, trialClaimedAt]
  );

  const { issued, debited, refunded } = sums[0];
  const spent    = Math.max(0, debited - refunded);
  const unspent  = Math.max(0, issued - spent);
  const balance  = bal[0]?.balance ?? 0;
  const toRemove = Math.min(unspent, balance);

  if (toRemove > 0) {
    await tx.query(
      'UPDATE credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2',
      [toRemove, userId]
    );
    await tx.query(
      `INSERT INTO credit_transactions (user_id, type, amount_credits, payment_method, channel, status)
       VALUES ($1, 'debit', $2, 'platform', 'trial', 'confirmed')`,
      [userId, toRemove]
    );
  }

  // In-app only, no push. One per user ever (one trial per account).
  await tx.query(
    `INSERT INTO notifications (user_id, type, payload, channel, event_ref)
     VALUES ($1, 'trial_expired', $2, 'in_app', 'trial_expired')
     ON CONFLICT (user_id, type, event_ref) WHERE event_ref IS NOT NULL DO NOTHING`,
    [userId, JSON.stringify({ message: 'Everything you experienced is still here. Top up to keep going.', route: '/credits' })]
  );

  return { issued, spent, balance, removed: toRemove };
}

async function runTrialExpiry() {
  const { rows: users } = await query(
    `SELECT id, trial_claimed_at FROM users
     WHERE trial_ends_at < NOW()
       AND trial_ends_at > NOW() - INTERVAL '25 hours'`
  );

  let removedTotal = 0;
  for (const user of users) {
    try {
      const r = await transaction((tx) => expireTrialCredits(tx, user.id, user.trial_claimed_at));
      removedTotal += r.removed;
      if (r.removed) await require('../services/cache').del(`credits:${user.id}`).catch(() => {});
    } catch (err) {
      logger.error({ err, userId: user.id }, '[trialExpiry] user expiry failed');
    }
  }
  if (users.length) logger.info({ count: users.length, removedTotal }, '[trialExpiry] processed expired trials');
}

module.exports = { runTrialDrip, runTrialReminder, runTrialExpiry, expireTrialCredits };
