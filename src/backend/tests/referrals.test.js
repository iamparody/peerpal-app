/**
 * Phase 46 referral system.
 *  - Code generation / normalisation
 *  - Signup: valid code → +1 bonus + pending reward; bad codes ignored; failures never block signup
 *  - Purchase: first confirmed purchase pays the referrer exactly once (duplicate webhooks)
 *  - Stats endpoint numbers, lazy code for pre-108 accounts
 *  - Notification copy never names the referred friend
 *  - Schema: every enum literal the code writes is defined by a migration
 *
 * Run: npm run test:referrals   (from src/backend)
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── In-memory database ───────────────────────────────────────────────────────
// Understands exactly the statements the referral paths issue. Anything else throws, so a
// query added later without a matching handler fails loudly instead of silently passing.

function newState() {
  return { users: [], credits: {}, ledger: [], rewards: [], notifications: [], pending: [], nextId: 1 };
}

const clone = (s) => JSON.parse(JSON.stringify(s));

function uniqueViolation(constraint) {
  const err = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  err.code = '23505';
  return err;
}

function literal(sql, column) {
  const m = sql.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
  const cols = m[1].split(',').map(s => s.trim());
  const vals = m[2].split(',').map(s => s.trim());
  return vals[cols.indexOf(column)];
}

function exec(s, sql, p = [], hooks = {}) {
  const q = sql.replace(/\s+/g, ' ').trim();
  if (hooks.before) hooks.before(q, p);

  if (/^SELECT 1 FROM users WHERE referral_code = \$1$/.test(q)) {
    return { rows: s.users.filter(u => u.referral_code === p[0]).map(() => ({ '?column?': 1 })) };
  }
  if (/^SELECT id FROM users WHERE referral_code = \$1 AND is_active = true AND id <> \$2$/.test(q)) {
    return { rows: s.users.filter(u => u.referral_code === p[0] && u.is_active && u.id !== p[1]).map(u => ({ id: u.id })) };
  }
  if (/^UPDATE users SET referred_by = \$1 WHERE id = \$2 AND referred_by IS NULL$/.test(q)) {
    const u = s.users.find(x => x.id === p[1] && !x.referred_by);
    if (u) u.referred_by = p[0];
    return { rows: [], rowCount: u ? 1 : 0 };
  }
  if (/^UPDATE credits SET balance = balance \+ \$1, updated_at = NOW\(\) WHERE user_id = \$2$/.test(q)) {
    if (!(p[1] in s.credits)) return { rows: [], rowCount: 0 };
    s.credits[p[1]] += p[0];
    return { rows: [], rowCount: 1 };
  }
  if (/^INSERT INTO credit_transactions/.test(q)) {
    const type = literal(q, 'type').replace(/'/g, '');
    const channel = literal(q, 'channel').replace(/'/g, '');
    const payment_method = literal(q, 'payment_method').replace(/'/g, '');
    s.ledger.push({ user_id: p[0], amount: p[1], type, channel, payment_method });
    return { rows: [], rowCount: 1 };
  }
  if (/^INSERT INTO referral_rewards/.test(q)) {
    if (s.rewards.some(r => r.referred_user_id === p[1])) throw uniqueViolation('idx_referral_rewards_referred');
    s.rewards.push({ id: `rr${s.nextId++}`, referrer_user_id: p[0], referred_user_id: p[1], credits_awarded: p[2], triggered_by: p[3], status: 'pending', credited_at: null });
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE referral_rewards SET status = 'credited', credited_at = NOW\(\) WHERE referred_user_id = \$1 AND status = 'pending' RETURNING/.test(q)) {
    const r = s.rewards.find(x => x.referred_user_id === p[0] && x.status === 'pending');
    if (!r) return { rows: [], rowCount: 0 };
    r.status = 'credited';
    r.credited_at = 'now';
    return { rows: [{ id: r.id, referrer_user_id: r.referrer_user_id, credits_awarded: r.credits_awarded }], rowCount: 1 };
  }
  if (/^INSERT INTO notifications \(user_id, type, payload, channel\) VALUES \(\$1, 'referral_reward_credited', \$2, 'in_app'\)$/.test(q)) {
    s.notifications.push({ user_id: p[0], type: 'referral_reward_credited', payload: JSON.parse(p[1]), channel: 'in_app' });
    return { rows: [], rowCount: 1 };
  }
  if (/^INSERT INTO notifications/.test(q)) {
    s.notifications.push({ user_id: p[0], sql: q });
    return { rows: [], rowCount: 1 };
  }
  if (/^SELECT referral_code FROM users WHERE id = \$1$/.test(q)) {
    return { rows: s.users.filter(u => u.id === p[0]).map(u => ({ referral_code: u.referral_code ?? null })) };
  }
  if (/^UPDATE users SET referral_code = \$1 WHERE id = \$2 AND referral_code IS NULL RETURNING referral_code$/.test(q)) {
    const u = s.users.find(x => x.id === p[1] && !x.referral_code);
    if (!u) return { rows: [], rowCount: 0 };
    u.referral_code = p[0];
    return { rows: [{ referral_code: p[0] }], rowCount: 1 };
  }
  if (/FROM referral_rewards WHERE referrer_user_id = \$1$/.test(q)) {
    const mine = s.rewards.filter(r => r.referrer_user_id === p[0]);
    return { rows: [{
      total_referred: mine.length,
      total_credits_earned: mine.filter(r => r.status === 'credited').reduce((n, r) => n + r.credits_awarded, 0),
      pending_count: mine.filter(r => r.status === 'pending').length,
    }] };
  }
  if (/^SELECT fcm_token FROM users WHERE id = \$1$/.test(q)) {
    return { rows: s.users.filter(u => u.id === p[0]).map(u => ({ fcm_token: u.fcm_token ?? null })) };
  }
  // Registration
  if (/^SELECT email_verified FROM users WHERE email = \$1$/.test(q)) {
    return { rows: s.users.filter(u => u.email === p[0]).map(u => ({ email_verified: !!u.email_verified })) };
  }
  if (/^INSERT INTO users \(alias, email, password_hash, role, email_verify_token_hash, email_verify_expires, referral_code\)/.test(q)) {
    if (s.users.some(u => u.referral_code === p[4])) throw uniqueViolation('users_referral_code_key');
    const user = { id: `new${s.nextId++}`, alias: p[0], email: p[1], role: 'member', is_active: true, referral_code: p[4], referred_by: null };
    s.users.push(user);
    return { rows: [{ id: user.id, alias: user.alias, role: user.role }], rowCount: 1 };
  }
  if (/^INSERT INTO credits \(user_id, balance\) VALUES \(\$1, 0\)$/.test(q)) {
    s.credits[p[0]] = 0;
    return { rows: [], rowCount: 1 };
  }
  // Payment webhook
  if (/^UPDATE credit_transactions SET status = 'confirmed' WHERE id = \(SELECT id FROM credit_transactions WHERE payment_reference = \$1 AND status = 'pending' LIMIT 1\) AND status = 'pending' RETURNING id, user_id, amount_credits$/.test(q)) {
    const t = s.pending.find(x => x.ref === p[0] && x.status === 'pending');
    if (!t) return { rows: [], rowCount: 0 };
    t.status = 'confirmed';
    return { rows: [{ id: t.id, user_id: t.user_id, amount_credits: t.amount }], rowCount: 1 };
  }
  if (/^UPDATE credit_transactions SET status = 'failed'/.test(q)) return { rows: [], rowCount: 0 };
  if (/^UPDATE credits SET ai_conversations_cap/.test(q)) return { rows: [], rowCount: 1 };
  if (/^UPDATE users SET reengagement_step = 'converted'/.test(q)) return { rows: [], rowCount: 1 };

  throw new Error(`fake db: unhandled SQL: ${q.slice(0, 140)}`);
}

// Pool-like module: query + transaction with real ROLLBACK and SAVEPOINT semantics.
function fakeDb(state, hooks = {}) {
  const run = (target) => async (sql, params) => {
    const q = sql.trim();
    if (q === 'SAVEPOINT referral') { target.savepoint = clone(target.data); return { rows: [] }; }
    if (q === 'RELEASE SAVEPOINT referral') { target.savepoint = null; return { rows: [] }; }
    if (q === 'ROLLBACK TO SAVEPOINT referral') { target.data = target.savepoint; return { rows: [] }; }
    return exec(target.data, sql, params, hooks);
  };
  return {
    query: async (sql, params) => exec(state, sql, params, hooks),
    transaction: async (fn) => {
      const target = { data: clone(state) };
      const result = await fn({ query: run(target) });
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, target.data);
      return result;
    },
    pool: { end: async () => {} },
  };
}

function stub(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

function fresh(rel) {
  delete require.cache[require.resolve(rel)];
  return require(rel);
}

// Installs fakes for every module the referral paths touch.
function install(state, hooks) {
  const db = fakeDb(state, hooks);
  const pushes = [];
  stub('../db', db);
  stub('../services/cache', { get: async () => null, set: async () => {}, del: async () => {} });
  stub('../utils/fcm', {
    enqueuePushNotification: async (token, title, body, data) => { pushes.push({ token, title, body, data }); },
    assignFcmToken: async () => {},
  });
  stub('../services/emailService', { sendVerificationEmail: () => {}, sendPasswordResetEmail: () => {}, sendTherapistPasswordReset: () => {} });
  const pass = (req, res, next) => next();
  stub('../middleware/rateLimit', {
    authLimiter: pass, apiLimiter: pass, paymentLimiter: pass, loginCooldownMiddleware: pass,
    recordFailedLogin: async () => {}, clearLoginRecord: async () => {}, checkResendLimit: () => true,
  });
  stub('../utils/aliasGenerator', { generateAlias: async () => 'QuietRiver42' });
  stub('../services/payment', {
    initiatePayment: async () => ({}),
    verifyWebhook: (raw) => JSON.parse(raw),
  });
  stub('../utils/daraja', { PACKAGES: {}, getPackages: async () => ({ starter: { credits: 10, price_ksh: 100 } }) });
  const referrals = fresh('../services/referrals');
  return { db, pushes, referrals };
}

function seedUser(state, { id, code = null, active = true, balance = 0, fcm = null } = {}) {
  state.users.push({ id, referral_code: code, is_active: active, referred_by: null, fcm_token: fcm, email: `${id}@x.io` });
  state.credits[id] = balance;
}

// Calls the final handler of an express route directly and awaits it.
async function callRoute(router, method, routePath, req) {
  const layer = router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]);
  const handlers = layer.route.stack.map(s => s.handle);
  const res = {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await handlers[handlers.length - 1](req, res, () => {});
  return res;
}

// ── referralCode utils ───────────────────────────────────────────────────────

describe('referral codes', () => {
  const { randomCode, normalizeReferralCode, generateReferralCode, MAX_ATTEMPTS } = require('../utils/referralCode');

  test('random codes are 6-char uppercase base36', () => {
    for (let i = 0; i < 500; i++) assert.match(randomCode(), /^[0-9A-Z]{6}$/);
  });

  test('normalise accepts case, spaces and dashes; rejects everything else', () => {
    assert.equal(normalizeReferralCode('ke7mx2'), 'KE7MX2');
    assert.equal(normalizeReferralCode(' KE7-MX2 '), 'KE7MX2');
    for (const bad of ['', 'ABC', 'ABCDEFG', 'AB$123', null, undefined, 123456, { code: 'ABCDEF' }]) {
      assert.equal(normalizeReferralCode(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
  });

  test('retries on collision and returns the first free code', async () => {
    const taken = new Set(['AAAAAA', 'BBBBBB']);
    const seq = ['AAAAAA', 'BBBBBB', 'CCCCCC'];
    const db = { query: async (_sql, [c]) => ({ rows: taken.has(c) ? [{}] : [] }) };
    assert.equal(await generateReferralCode(db, () => seq.shift()), 'CCCCCC');
  });

  test(`gives up after ${MAX_ATTEMPTS} collisions`, async () => {
    let calls = 0;
    const db = { query: async () => { calls++; return { rows: [{}] }; } };
    await assert.rejects(generateReferralCode(db, () => 'AAAAAA'), /collision/);
    assert.equal(calls, MAX_ATTEMPTS);
  });
});

// ── Signup ───────────────────────────────────────────────────────────────────

describe('applyReferralAtSignup', () => {
  let state, referrals, db;
  beforeEach(() => {
    state = newState();
    seedUser(state, { id: 'ref', code: 'KE7MX2' });
    seedUser(state, { id: 'new' });
    ({ referrals, db } = install(state));
  });

  test('valid code: links referrer, +1 bonus, pending reward of 2', async () => {
    const r = await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'ke7mx2'));
    assert.deepEqual(r, { applied: true, referrer_user_id: 'ref' });
    assert.equal(state.users.find(u => u.id === 'new').referred_by, 'ref');
    assert.equal(state.credits.new, 1);
    assert.deepEqual(state.ledger, [{ user_id: 'new', amount: 1, type: 'bonus', channel: 'referral', payment_method: 'bonus' }]);
    assert.equal(state.rewards.length, 1);
    assert.equal(state.rewards[0].status, 'pending');
    assert.equal(state.rewards[0].credits_awarded, 2);
    assert.equal(state.rewards[0].triggered_by, 'first_purchase');
    assert.equal(state.credits.ref, 0, 'referrer is paid only on purchase');
  });

  for (const [label, code, reason] of [
    ['unknown code', 'ZZZZZZ', 'unknown_code'],
    ['malformed code', 'abc', 'invalid_code'],
  ]) {
    test(`${label}: ignored, nothing written`, async () => {
      const r = await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', code));
      assert.equal(r.applied, false);
      assert.equal(r.reason, reason);
      assert.equal(state.credits.new, 0);
      assert.equal(state.rewards.length, 0);
      assert.equal(state.ledger.length, 0);
    });
  }

  test('inactive referrer: ignored', async () => {
    state.users.find(u => u.id === 'ref').is_active = false;
    const r = await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'KE7MX2'));
    assert.equal(r.applied, false);
    assert.equal(state.credits.new, 0);
  });

  test('own code: ignored', async () => {
    state.users.find(u => u.id === 'new').referral_code = 'OWN123';
    const r = await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'OWN123'));
    assert.equal(r.applied, false);
  });

  test('already referred: no second bonus', async () => {
    await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'KE7MX2'));
    seedUser(state, { id: 'ref2', code: 'SECOND' });
    const r = await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'SECOND'));
    assert.equal(r.reason, 'already_referred');
    assert.equal(state.credits.new, 1);
    assert.equal(state.rewards.length, 1);
  });
});

describe('POST /auth/register with referral_code', () => {
  let state, router;
  const body = (extra = {}) => ({ email: 'friend@x.io', password: 'longenough', ...extra });

  beforeEach(() => {
    state = newState();
    seedUser(state, { id: 'ref', code: 'KE7MX2' });
    install(state);
    router = fresh('../routes/auth');
  });

  const newUser = () => state.users.find(u => u.email === 'friend@x.io');

  test('every new account gets its own 6-char code', async () => {
    const res = await callRoute(router, 'post', '/register', { body: body() });
    assert.equal(res.statusCode, 201);
    assert.match(newUser().referral_code, /^[0-9A-Z]{6}$/);
    assert.equal(state.credits[newUser().id], 0);
  });

  test('valid code: 201, referred_by set, +1 credit, pending reward', async () => {
    const res = await callRoute(router, 'post', '/register', { body: body({ referral_code: 'KE7MX2' }) });
    assert.equal(res.statusCode, 201);
    assert.equal(newUser().referred_by, 'ref');
    assert.equal(state.credits[newUser().id], 1);
    assert.equal(state.rewards[0].status, 'pending');
  });

  test('unknown code: still 201, no error, no bonus', async () => {
    const res = await callRoute(router, 'post', '/register', { body: body({ referral_code: 'NOPE00' }) });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.error, undefined);
    assert.equal(state.credits[newUser().id], 0);
  });

  test('referral write fails mid-way: signup still succeeds, partial referral rolled back', async () => {
    install(state, { before: (q) => { if (/^INSERT INTO referral_rewards/.test(q)) throw new Error('boom'); } });
    router = fresh('../routes/auth');
    const res = await callRoute(router, 'post', '/register', { body: body({ referral_code: 'KE7MX2' }) });
    assert.equal(res.statusCode, 201);
    const u = newUser();
    assert.ok(u, 'account exists');
    assert.equal(u.referred_by, null, 'referred_by rolled back');
    assert.equal(state.credits[u.id], 0, 'bonus rolled back');
    assert.equal(state.ledger.length, 0, 'ledger row rolled back');
  });
});

// ── Reward on first purchase ─────────────────────────────────────────────────

describe('referral reward on purchase', () => {
  let state, referrals, db, pushes;
  beforeEach(async () => {
    state = newState();
    seedUser(state, { id: 'ref', code: 'KE7MX2', balance: 5, fcm: 'tok-ref' });
    seedUser(state, { id: 'new' });
    ({ referrals, db, pushes } = install(state));
    await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'KE7MX2'));
    state.ledger = [];
  });

  test('pays referrer 2 credits once, ledger + notification + push', async () => {
    const r = await referrals.rewardReferrerOnPurchase('new');
    assert.equal(r.credited, true);
    assert.equal(state.credits.ref, 7);
    assert.deepEqual(state.ledger, [{ user_id: 'ref', amount: 2, type: 'referral_reward', channel: 'referral', payment_method: 'bonus' }]);
    assert.equal(state.rewards[0].status, 'credited');
    assert.ok(state.rewards[0].credited_at);
    const n = state.notifications.filter(x => x.type === 'referral_reward_credited');
    assert.equal(n.length, 1);
    assert.equal(n[0].user_id, 'ref');
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].token, 'tok-ref');
    assert.equal(pushes[0].data.type, 'referral_reward_credited');
  });

  test('duplicate webhook / second purchase: no second reward', async () => {
    await referrals.rewardReferrerOnPurchase('new');
    const again = await referrals.rewardReferrerOnPurchase('new');
    assert.equal(again.credited, false);
    assert.equal(state.credits.ref, 7);
    assert.equal(state.ledger.length, 1);
  });

  test('user with no referral: no-op', async () => {
    seedUser(state, { id: 'solo' });
    const r = await referrals.rewardReferrerOnPurchase('solo');
    assert.equal(r.credited, false);
    assert.equal(state.ledger.length, 0);
  });

  test('failure mid-reward: never throws, nothing half-written, retried on next purchase', async () => {
    install(state, { before: (q) => { if (/referral_reward_credited/.test(q)) throw new Error('notif down'); } });
    const failing = require('../services/referrals');
    const r = await failing.rewardReferrerOnPurchase('new');
    assert.equal(r.credited, false);
    assert.equal(state.rewards[0].status, 'pending', 'status rolled back');
    assert.equal(state.credits.ref, 5, 'balance rolled back');
    assert.equal(state.ledger.length, 0, 'ledger rolled back');

    ({ referrals } = install(state));
    const retry = await referrals.rewardReferrerOnPurchase('new');
    assert.equal(retry.credited, true);
    assert.equal(state.credits.ref, 7);
  });

  test('notification copy never names the friend', async () => {
    state.users.find(u => u.id === 'new').alias = 'QuietRiver42';
    await referrals.rewardReferrerOnPurchase('new');
    const n = state.notifications.find(x => x.type === 'referral_reward_credited');
    assert.doesNotMatch(JSON.stringify(n.payload), /QuietRiver42|alias/i);
    assert.doesNotMatch(JSON.stringify(pushes[0].data), /QuietRiver42|alias/i);
    assert.equal(n.payload.message, "A friend you invited made their first top-up. You've earned 2 credits.");
  });
});

describe('POST /credits/payment-webhook → referral reward', () => {
  let state, router;
  beforeEach(async () => {
    state = newState();
    seedUser(state, { id: 'ref', code: 'KE7MX2' });
    seedUser(state, { id: 'new' });
    const { db, referrals } = install(state);
    await db.transaction(tx => referrals.applyReferralAtSignup(tx, 'new', 'KE7MX2'));
    state.pending.push({ id: 'tx1', ref: 'inv1', user_id: 'new', amount: 10, status: 'pending' });
    router = fresh('../routes/credits');
  });

  const fire = (success = true, ref = 'inv1') => callRoute(router, 'post', '/payment-webhook', {
    rawBody: JSON.stringify({ success, reference: ref }), headers: {},
  });

  test('confirmed first purchase pays the referrer', async () => {
    await fire();
    assert.equal(state.credits.new, 1 + 10);
    assert.equal(state.credits.ref, 2);
    assert.equal(state.rewards[0].status, 'credited');
  });

  test('duplicate webhook fire pays once', async () => {
    await fire();
    await fire();
    assert.equal(state.credits.ref, 2);
  });

  test('failed payment pays nothing', async () => {
    await fire(false);
    assert.equal(state.credits.ref, 0);
    assert.equal(state.rewards[0].status, 'pending');
  });
});

// ── Stats ────────────────────────────────────────────────────────────────────

describe('getReferralStats', () => {
  test('counts referred, credited sum and pending', async () => {
    const state = newState();
    seedUser(state, { id: 'ref', code: 'KE7MX2' });
    for (const id of ['a', 'b', 'c']) seedUser(state, { id });
    const { db, referrals } = install(state);
    for (const id of ['a', 'b', 'c']) await db.transaction(tx => referrals.applyReferralAtSignup(tx, id, 'KE7MX2'));
    await referrals.rewardReferrerOnPurchase('a');
    assert.deepEqual(await referrals.getReferralStats(db, 'ref'), {
      referral_code: 'KE7MX2', total_referred: 3, total_credits_earned: 2, pending_count: 2,
    });
  });

  test('pre-108 account without a code gets one generated and kept', async () => {
    const state = newState();
    seedUser(state, { id: 'old' });
    const { db, referrals } = install(state);
    const first = await referrals.getReferralStats(db, 'old');
    assert.match(first.referral_code, /^[0-9A-Z]{6}$/);
    assert.equal((await referrals.getReferralStats(db, 'old')).referral_code, first.referral_code);
    assert.deepEqual({ ...first, referral_code: 'X' }, { referral_code: 'X', total_referred: 0, total_credits_earned: 0, pending_count: 0 });
  });

  test('unknown user → null', async () => {
    const { db, referrals } = install(newState());
    assert.equal(await referrals.getReferralStats(db, 'ghost'), null);
  });
});

describe('referral_report summarize', () => {
  test('conversion rate, credit cost, median time to convert', () => {
    const { summarize } = fresh('../scripts/referral_report');
    const s = summarize([
      { status: 'credited', credits_awarded: 2, hours_to_convert: 10 },
      { status: 'credited', credits_awarded: 2, hours_to_convert: 30 },
      { status: 'pending', credits_awarded: 2, hours_to_convert: null },
      { status: 'pending', credits_awarded: 2, hours_to_convert: null },
    ]);
    assert.equal(s.referredSignups, 4);
    assert.equal(s.converted, 2);
    assert.equal(s.conversionRatePct, 50);
    assert.deepEqual(s.creditsGiven, { signupBonus: 4, referrerRewards: 4, total: 8 });
    assert.equal(s.creditsPerPayingUser, 4);
    assert.equal(s.medianHoursToConvert, 20);
    assert.equal(summarize([]).conversionRatePct, null);
  });
});

// ── Schema ───────────────────────────────────────────────────────────────────

describe('migration 110', () => {
  const dir = path.join(ROOT, 'migrations');
  const forward = fs.readdirSync(dir).filter(n => n.endsWith('.sql') && !n.includes('_rollback'));
  function enumLabels(type) {
    const labels = new Set();
    for (const f of forward) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const create = sql.match(new RegExp(`CREATE TYPE ${type}\\s+AS ENUM \\(([^)]*)\\)`, 'i'));
      if (create) for (const m of create[1].matchAll(/'([^']+)'/g)) labels.add(m[1]);
      for (const m of sql.matchAll(new RegExp(`ALTER TYPE ${type}\\s+ADD VALUE (?:IF NOT EXISTS )?'([^']+)'`, 'gi'))) labels.add(m[1]);
    }
    return labels;
  }

  test('enum values written by the referral code exist', () => {
    assert.ok(enumLabels('credit_tx_type').has('referral_reward'));
    assert.ok(enumLabels('credit_tx_type').has('bonus'));
    assert.ok(enumLabels('credit_tx_channel').has('referral'));
    assert.ok(enumLabels('credit_payment_method').has('bonus'));
    assert.ok(enumLabels('notification_type').has('referral_reward_credited'));
  });

  test('has a rollback file', () => {
    assert.ok(fs.existsSync(path.join(dir, '110_referral_system_rollback.sql')));
  });

  test('user deletion cannot be blocked by referral FKs', () => {
    const sql = fs.readFileSync(path.join(dir, '110_referral_system.sql'), 'utf8');
    assert.match(sql, /referred_by UUID NULL REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.equal((sql.match(/REFERENCES users\(id\) ON DELETE CASCADE/g) || []).length, 2);
  });
});
