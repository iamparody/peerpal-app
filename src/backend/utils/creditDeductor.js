const { query } = require('../db');
const cache = require('../services/cache');

// Deducts `amount` credits for a user.
// session_id may be NULL when no session exists yet (e.g. peer request submission).
// Returns: { blocked, balance }
//   blocked: true if balance < amount (no deduction performed)
//   balance: new balance after deduction (or current balance if blocked)
async function deductCredit(user_id, amount, session_id, channel) {
  const { rows } = await query(
    'SELECT balance FROM credits WHERE user_id = $1',
    [user_id]
  );
  const balance = rows[0]?.balance ?? 0;

  if (balance < amount) {
    return { blocked: true, balance };
  }

  // Atomic decrement — guards against concurrent deductions
  const { rowCount } = await query(
    'UPDATE credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1',
    [amount, user_id]
  );

  if (!rowCount) {
    return { blocked: true, balance: await getCurrentBalance(user_id) };
  }

  const newBalance = balance - amount;

  await query(
    `INSERT INTO credit_transactions
       (user_id, type, amount_credits, payment_method, session_id, channel, status)
     VALUES ($1, 'debit', $2, 'bonus', $3, $4, 'confirmed')`,
    [user_id, amount, session_id, channel]
  );
  await cache.del(`credits:${user_id}`);

  if (newBalance < 2) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'credit_low', $2, 'in_app')`,
      [user_id, JSON.stringify({ balance: newBalance })]
    );
  }

  return { blocked: false, balance: newBalance };
}

async function refundCredit(user_id, amount, session_id, channel, reason) {
  await query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [amount, user_id]
  );

  await query(
    `INSERT INTO credit_transactions
       (user_id, type, amount_credits, payment_method, session_id, channel, status)
     VALUES ($1, 'refund', $2, 'bonus', $3, $4, 'confirmed')`,
    [user_id, amount, session_id, channel]
  );
  await cache.del(`credits:${user_id}`);

  if (reason) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'account_notice', $2, 'in_app')`,
      [user_id, JSON.stringify({ message: reason })]
    );
  }
}

async function getCurrentBalance(user_id) {
  const { rows } = await query('SELECT balance FROM credits WHERE user_id = $1', [user_id]);
  return rows[0]?.balance ?? 0;
}

async function getCreditCosts() {
  const { getConfig } = require('./config');
  const fromDb = await getConfig('credit_costs', null);
  return fromDb || { text: 1, voice: 2, referral: 1 };
}

module.exports = { deductCredit, refundCredit, getCreditCosts };
