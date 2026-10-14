const { query } = require('../db');
const { enqueuePushNotification } = require('../utils/fcm');

// ── Trial drip job ────────────────────────────────────────────────────────────
// Runs daily at 06:00 EAT (03:00 UTC).
// Issues 2 credits to every user on an active trial, up to 14 total.
async function runTrialDrip() {
  const { rows: users } = await query(
    `SELECT id FROM users
     WHERE trial_claimed_at IS NOT NULL
       AND trial_ends_at > NOW()
       AND trial_credits_issued < 14`
  );
  if (!users.length) return;

  for (const user of users) {
    try {
      // Guard: never exceed 14 total (re-fetch to avoid race)
      const { rows } = await query(
        'SELECT trial_credits_issued FROM users WHERE id = $1',
        [user.id]
      );
      if (!rows[0] || rows[0].trial_credits_issued + 2 > 14) continue;

      await query('UPDATE credits SET balance = balance + 2 WHERE user_id = $1', [user.id]);
      await query(
        `INSERT INTO credit_transactions (user_id, amount_credits, type, channel, status)
         VALUES ($1, 2, 'trial_drip', 'trial', 'confirmed')`,
        [user.id]
      );
      await query(
        'UPDATE users SET trial_credits_issued = trial_credits_issued + 2 WHERE id = $1',
        [user.id]
      );
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
async function runTrialExpiry() {
  const { rows: users } = await query(
    `SELECT id, trial_claimed_at FROM users
     WHERE trial_ends_at < NOW()
       AND trial_ends_at > NOW() - INTERVAL '25 hours'`
  );

  for (const user of users) {
    try {
      // Calculate unspent trial credits:
      // total dripped minus total debits charged since trial started
      const { rows: issuedRows } = await query(
        `SELECT COALESCE(SUM(amount_credits), 0)::int AS issued
         FROM credit_transactions
         WHERE user_id = $1 AND type = 'trial_drip'`,
        [user.id]
      );
      const { rows: debitRows } = await query(
        `SELECT COALESCE(SUM(ABS(amount_credits)), 0)::int AS spent
         FROM credit_transactions
         WHERE user_id = $1
           AND amount_credits < 0
           AND created_at >= $2`,
        [user.id, user.trial_claimed_at]
      );
      const { rows: balanceRows } = await query(
        'SELECT balance FROM credits WHERE user_id = $1',
        [user.id]
      );

      const issued   = issuedRows[0].issued;
      const spent    = debitRows[0].spent;
      const unspent  = Math.max(0, issued - spent);
      const balance  = balanceRows[0]?.balance ?? 0;
      const toRemove = Math.min(unspent, balance);

      if (toRemove > 0) {
        await query(
          'UPDATE credits SET balance = balance - $1 WHERE user_id = $2',
          [toRemove, user.id]
        );
      }

      // In-app only, no push
      await query(
        `INSERT INTO notifications (user_id, type, payload, channel)
         VALUES ($1, 'trial_expired', $2, 'in_app')`,
        [user.id, JSON.stringify({ message: 'Everything you experienced is still here. Top up to keep going.', route: '/credits' })]
      );
    } catch (err) {
      console.error(`[trialExpiry] user ${user.id}:`, err.message);
    }
  }
  if (users.length) console.log(`[trialExpiry] processed ${users.length} expired trials`);
}

module.exports = { runTrialDrip, runTrialReminder, runTrialExpiry };
