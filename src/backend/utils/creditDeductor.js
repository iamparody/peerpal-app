const { query } = require('../db');
const cache = require('../services/cache');

// Deducts `amount` credits for a user.
// session_id may be NULL when no session exists yet.
// channel: 'therapy_booking' | 'peer_session' | 'ai_session' | 'purchase'
// Returns: { blocked, balance }
//   blocked: true if balance < amount (no deduction performed)
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
     VALUES ($1, 'debit', $2, 'platform', $3, $4, 'confirmed')`,
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
     VALUES ($1, 'refund', $2, 'platform', $3, $4, 'confirmed')`,
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

module.exports = { deductCredit, refundCredit };
