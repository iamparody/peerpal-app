/**
 * POST /credits/payment-webhook idempotency.
 *  Bug: SELECT pending row, then a separate UPDATE credits. Two concurrent fires for the same
 *  invoice both saw 'pending' and both credited the balance.
 *
 * The fake runs statements on shared state with a yield before each one, so concurrent handlers
 * interleave the way two webhook requests do. A conditional UPDATE is applied in one step, the
 * way a Postgres row lock + re-check makes it atomic.
 *
 * Run: npm run test:ledger   (from src/backend)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const tick = () => new Promise(setImmediate);

function makeDb(state) {
  async function exec(sql, p, undo) {
    await tick();
    const q = sql.replace(/\s+/g, ' ').trim();
    if (state.failOn && state.failOn.test(q)) throw new Error('injected failure');

    // New atomic claim
    if (/^UPDATE credit_transactions SET status = 'confirmed' WHERE id = \(SELECT id FROM credit_transactions WHERE payment_reference = \$1 AND status = 'pending' LIMIT 1\) AND status = 'pending' RETURNING/.test(q)) {
      const t = state.txs.find(x => x.ref === p[0] && x.status === 'pending');
      if (!t) return { rows: [], rowCount: 0 };
      t.status = 'confirmed';
      undo?.push(() => { t.status = 'pending'; });
      return { rows: [{ id: t.id, user_id: t.user_id, amount_credits: t.amount }], rowCount: 1 };
    }
    // Old two-step path (kept so the test can show the old handler double-credits)
    if (/^SELECT id, user_id, amount_credits FROM credit_transactions WHERE payment_reference = \$1 AND status = 'pending' LIMIT 1$/.test(q)) {
      return { rows: state.txs.filter(x => x.ref === p[0] && x.status === 'pending').map(t => ({ id: t.id, user_id: t.user_id, amount_credits: t.amount })) };
    }
    if (/^UPDATE credit_transactions SET status = 'confirmed' WHERE id = \$1 AND user_id = \$2$/.test(q)) {
      const t = state.txs.find(x => x.id === p[0]);
      t.status = 'confirmed';
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE credit_transactions SET status = 'failed'/.test(q)) {
      for (const t of state.txs) if (t.ref === p[0] && t.status === 'pending') t.status = 'failed';
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE credits SET balance = balance \+ \$1, updated_at = NOW\(\) WHERE user_id = \$2$/.test(q)) {
      if (!(p[1] in state.balance)) return { rows: [], rowCount: 0 };
      state.balance[p[1]] += p[0];
      undo?.push(() => { state.balance[p[1]] -= p[0]; });
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE credits SET ai_conversations_cap = ai_conversations_cap \+ \$1/.test(q)) {
      state.aiCap[p[1]] = (state.aiCap[p[1]] || 0) + p[0];
      undo?.push(() => { state.aiCap[p[1]] -= p[0]; });
      return { rows: [], rowCount: 1 };
    }
    if (/^INSERT INTO notifications/.test(q)) { state.notifications++; return { rows: [], rowCount: 2 }; }
    if (/^UPDATE users SET reengagement_step/.test(q)) return { rows: [], rowCount: 1 };
    throw new Error(`unhandled SQL: ${q.slice(0, 120)}`);
  }
  return {
    query: (sql, p) => exec(sql, p),
    transaction: async (fn) => {
      const undo = [];
      try {
        return await fn({ query: (sql, p) => exec(sql, p, undo) });
      } catch (err) {
        undo.reverse().forEach(u => u());
        throw err;
      }
    },
  };
}

function loadRouter(state) {
  const stubs = {
    '../db': makeDb(state),
    '../services/cache': { get: async () => null, set: async () => {}, del: async () => {} },
    '../middleware/rateLimit': { paymentLimiter: (q, r, n) => n() },
    '../services/payment': { initiatePayment: async () => ({}), verifyWebhook: (raw) => JSON.parse(raw) },
    '../utils/daraja': { PACKAGES: {}, getPackages: async () => ({ starter: { credits: 10, price_ksh: 100, ai_conversations: 3 } }) },
  };
  for (const [rel, exports] of Object.entries(stubs)) {
    const p = require.resolve(rel);
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
  }
  delete require.cache[require.resolve('../routes/credits')];
  return require('../routes/credits');
}

async function fire(router, body) {
  const layer = router.stack.find(l => l.route && l.route.path === '/payment-webhook');
  const handle = layer.route.stack[layer.route.stack.length - 1].handle;
  const res = { status() { return this; }, json() { return this; } };
  await handle({ rawBody: JSON.stringify(body), headers: {} }, res, () => {});
}

describe('payment webhook', () => {
  let state, router;
  beforeEach(() => {
    state = { txs: [{ id: 't1', ref: 'inv1', user_id: 'u1', amount: 10, status: 'pending' }], balance: { u1: 0 }, aiCap: {}, notifications: 0 };
    router = loadRouter(state);
  });

  test('confirms and credits once', async () => {
    await fire(router, { success: true, reference: 'inv1' });
    assert.equal(state.balance.u1, 10);
    assert.equal(state.aiCap.u1, 3);
    assert.equal(state.txs[0].status, 'confirmed');
    assert.equal(state.notifications, 1);
  });

  test('two concurrent fires for the same invoice credit once', async () => {
    await Promise.all([
      fire(router, { success: true, reference: 'inv1' }),
      fire(router, { success: true, reference: 'inv1' }),
    ]);
    assert.equal(state.balance.u1, 10, 'credited exactly once');
    assert.equal(state.aiCap.u1, 3, 'AI allowance awarded exactly once');
    assert.equal(state.notifications, 1, 'one confirmation notification');
  });

  test('sequential duplicate fire is a no-op', async () => {
    await fire(router, { success: true, reference: 'inv1' });
    await fire(router, { success: true, reference: 'inv1' });
    assert.equal(state.balance.u1, 10);
  });

  test('failure while crediting leaves the purchase pending and the balance untouched', async () => {
    state.failOn = /ai_conversations_cap/;
    await fire(router, { success: true, reference: 'inv1' });
    assert.equal(state.txs[0].status, 'pending', 'still pending, so it can be reconciled or retried');
    assert.equal(state.balance.u1, 0);
    assert.equal(state.notifications, 0);
  });

  test('missing credits row: not confirmed', async () => {
    state.balance = {};
    await fire(router, { success: true, reference: 'inv1' });
    assert.equal(state.txs[0].status, 'pending');
  });

  test('failed payment marks failed and credits nothing', async () => {
    await fire(router, { success: false, reference: 'inv1' });
    assert.equal(state.txs[0].status, 'failed');
    assert.equal(state.balance.u1, 0);
  });
});
