/**
 * Trial expiry (docs/phase47-spec.md "Trial expiry").
 *  Bug: spending was summed from `amount_credits < 0`, but debits are stored positive, so spent
 *  was always 0 and expiry removed min(all trial credits, balance), eating purchased credits.
 *  Also: no ledger row for the removal, and the 25h window on a 24h cron could expire twice.
 *
 * Run: npm run test:ledger   (from src/backend)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const CLAIMED = '2026-10-01T00:00:00Z';
const BEFORE = '2026-09-20T00:00:00Z';
const DURING = '2026-10-03T00:00:00Z';

// One user's credits row + ledger + notifications, with the statements expireTrialCredits issues.
function fakeTx(state) {
  return {
    async query(sql, p) {
      const q = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT balance FROM credits WHERE user_id = \$1 FOR UPDATE$/.test(q)) {
        return { rows: [{ balance: state.balance }] };
      }
      if (/FROM credit_transactions WHERE user_id = \$1 AND status = 'confirmed'$/.test(q)) {
        const since = new Date(p[1]);
        const ok = state.ledger.filter(t => (t.status ?? 'confirmed') === 'confirmed');
        const sum = (f) => ok.filter(f).reduce((n, t) => n + t.amount, 0);
        return { rows: [{
          issued:   sum(t => t.type === 'trial_drip'),
          debited:  sum(t => t.type === 'debit'  && new Date(t.at) >= since),
          refunded: sum(t => t.type === 'refund' && new Date(t.at) >= since),
        }] };
      }
      if (/^UPDATE credits SET balance = balance - \$1/.test(q)) {
        state.balance -= p[0];
        return { rows: [], rowCount: 1 };
      }
      if (/^INSERT INTO credit_transactions \(user_id, type, amount_credits, payment_method, channel, status\) VALUES \(\$1, 'debit', \$2, 'platform', 'trial', 'confirmed'\)$/.test(q)) {
        state.ledger.push({ type: 'debit', channel: 'trial', amount: p[1], at: new Date().toISOString() });
        return { rows: [], rowCount: 1 };
      }
      if (/^INSERT INTO notifications .* 'trial_expired', \$2, 'in_app', 'trial_expired'\) ON CONFLICT/.test(q)) {
        if (!state.notifications.includes('trial_expired')) state.notifications.push('trial_expired');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unhandled SQL: ${q.slice(0, 120)}`);
    },
  };
}

function load() {
  for (const [rel, exports] of [
    ['../db', { query: async () => ({ rows: [] }), transaction: async (fn) => fn({}) }],
    ['../utils/fcm', { enqueuePushNotification: async () => {} }],
  ]) {
    const p = require.resolve(rel);
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
  }
  delete require.cache[require.resolve('../jobs/trialDripJob')];
  return require('../jobs/trialDripJob').expireTrialCredits;
}

const drip = (n, at = DURING) => Array.from({ length: n / 2 }, () => ({ type: 'trial_drip', amount: 2, at }));

async function expire(state) {
  return load()(fakeTx(state), 'u1', CLAIMED);
}

describe('expireTrialCredits', () => {
  test('purchased credits survive: 14 issued, 10 spent, 20 bought → removes 4', async () => {
    const state = {
      balance: 24, notifications: [],
      ledger: [...drip(14), { type: 'debit', amount: 10, at: DURING }, { type: 'purchase', amount: 20, at: DURING }],
    };
    const r = await expire(state);
    assert.equal(r.removed, 4);
    assert.equal(state.balance, 20, 'all 20 purchased credits remain');
  });

  test('promo / referral / bonus credits are never removed', async () => {
    const state = {
      balance: 2 + 5 + 3, notifications: [],
      ledger: [...drip(2), { type: 'promo', amount: 5, at: DURING }, { type: 'referral_reward', amount: 2, at: DURING }, { type: 'bonus', amount: 1, at: DURING }],
    };
    await expire(state);
    assert.equal(state.balance, 8);
  });

  test('refunds give spent trial credits back: 4 issued, 3 debited, 1 refunded → removes 2', async () => {
    const state = {
      balance: 2, notifications: [],
      ledger: [...drip(4), { type: 'debit', amount: 3, at: DURING }, { type: 'refund', amount: 1, at: DURING }],
    };
    assert.equal((await expire(state)).removed, 2);
    assert.equal(state.balance, 0);
  });

  test('debits from before the trial do not count as trial spending', async () => {
    const state = {
      balance: 6, notifications: [],
      ledger: [{ type: 'purchase', amount: 10, at: BEFORE }, { type: 'debit', amount: 8, at: BEFORE }, ...drip(4)],
    };
    assert.equal((await expire(state)).removed, 4);
    assert.equal(state.balance, 2);
  });

  test('never below zero: unspent 6, balance 3 → removes 3', async () => {
    const state = { balance: 3, notifications: [], ledger: [...drip(6)] };
    assert.equal((await expire(state)).removed, 3);
    assert.equal(state.balance, 0);
  });

  test('removal is written to the ledger as a trial debit', async () => {
    const state = { balance: 4, notifications: [], ledger: [...drip(4)] };
    await expire(state);
    const row = state.ledger.find(t => t.channel === 'trial' && t.type === 'debit');
    assert.ok(row, 'ledger row exists');
    assert.equal(row.amount, 4);
  });

  test('second run in the overlapping window removes nothing and sends one notification', async () => {
    const state = { balance: 10, notifications: [], ledger: [...drip(4), { type: 'purchase', amount: 6, at: DURING }] };
    assert.equal((await expire(state)).removed, 4);
    assert.equal((await expire(state)).removed, 0);
    assert.equal(state.balance, 6);
    assert.deepEqual(state.notifications, ['trial_expired']);
  });
});
