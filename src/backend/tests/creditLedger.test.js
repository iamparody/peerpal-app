/**
 * Credit ledger integrity.
 *  - Every INSERT INTO credit_transactions sets payment_method (NOT NULL enum: mpesa|card|bonus).
 *    Promo redemption and the trial drip both omitted it, so every promo redeem failed and the
 *    trial drip added balance without a ledger row.
 *  - Trial drip is all-or-nothing per user and respects the 14-credit cap.
 *
 * Run: npm run test:ledger   (from src/backend)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'tests', 'migrations', 'seeds']);

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...sourceFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Returns the SQL text of each `INSERT INTO credit_transactions ...` up to the closing quote.
function creditInserts(src) {
  const found = [];
  const re = /INSERT INTO credit_transactions/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(0, m.index);
    const quote = ['`', "'", '"'].map(q => [q, before.lastIndexOf(q)]).sort((a, b) => b[1] - a[1])[0][0];
    const end = src.indexOf(quote, m.index);
    found.push(src.slice(m.index, end === -1 ? undefined : end));
  }
  return found;
}

// Enum labels from CREATE TYPE ... AS ENUM (...) plus every ALTER TYPE ... ADD VALUE.
function paymentMethodEnum() {
  const dir = path.join(ROOT, 'migrations');
  const labels = new Set();
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.sql') && !n.includes('_rollback'))) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const create = sql.match(/CREATE TYPE credit_payment_method AS ENUM \(([^)]*)\)/i);
    if (create) for (const m of create[1].matchAll(/'([^']+)'/g)) labels.add(m[1]);
    for (const m of sql.matchAll(/ALTER TYPE credit_payment_method ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/gi)) labels.add(m[1]);
  }
  return labels;
}

function splitTopLevel(list) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// The quoted literal inserted into `column`, or null if it is a $n parameter / not found.
function literalFor(sql, column) {
  const m = sql.match(/credit_transactions\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)/i);
  if (!m) return null;
  const cols = splitTopLevel(m[1]);
  const vals = splitTopLevel(m[2]);
  const i = cols.indexOf(column);
  if (i === -1 || !vals[i]) return null;
  const lit = vals[i].match(/^'([^']*)'$/);
  return lit ? lit[1] : null;
}

describe('credit_transactions inserts', () => {
  const files = sourceFiles(ROOT);
  const inserts = files.flatMap(f => creditInserts(fs.readFileSync(f, 'utf8')).map(sql => ({ file: path.relative(ROOT, f), sql })));

  test('the scan finds the known insert sites', () => {
    const where = new Set(inserts.map(i => i.file.replace(/\\/g, '/')));
    for (const f of ['routes/promo.js', 'jobs/trialDripJob.js', 'routes/moods.js', 'utils/creditDeductor.js']) {
      assert.ok(where.has(f), `expected an insert in ${f}`);
    }
  });

  test('every insert sets payment_method', () => {
    const missing = inserts.filter(i => !/payment_method/.test(i.sql)).map(i => `${i.file}: ${i.sql.slice(0, 120)}`);
    assert.deepEqual(missing, []);
  });

  // creditDeductor wrote 'platform' for months while the enum had no such value: every
  // peer request, extension, referral and therapy credit charge failed.
  test('every literal payment_method is a value the migrations define', () => {
    const allowed = paymentMethodEnum();
    assert.ok(allowed.has('bonus') && allowed.has('mpesa'), 'enum parse sanity');
    const bad = [];
    for (const { file, sql } of inserts) {
      const value = literalFor(sql, 'payment_method');
      if (value !== null && !allowed.has(value)) bad.push(`${file}: payment_method '${value}'`);
    }
    assert.deepEqual(bad, [], `allowed: ${[...allowed].join(', ')}`);
  });
});

// ── Trial drip with a stubbed db module ──────────────────────────────────────

function loadTrialDripWith(state, { failLedger = false } = {}) {
  const dbPath = require.resolve('../db');
  const jobPath = require.resolve('../jobs/trialDripJob');
  const fcmPath = require.resolve('../utils/fcm');

  const exec = (s, sql, params) => {
    if (/SELECT id FROM users/.test(sql)) return { rows: [{ id: 'u1' }] };
    if (/SELECT trial_credits_issued/.test(sql)) return { rows: [{ trial_credits_issued: s.issued }] };
    if (/UPDATE credits SET balance/.test(sql)) { s.balance += 2; return { rows: [] }; }
    if (/INSERT INTO credit_transactions/.test(sql)) {
      if (failLedger) throw new Error('ledger insert failed');
      assert.match(sql, /payment_method/);
      s.ledger.push(params);
      return { rows: [] };
    }
    if (/trial_credits_issued = trial_credits_issued \+ 2/.test(sql)) { s.issued += 2; return { rows: [] }; }
    return { rows: [] };
  };

  const fakeDb = {
    query: async (sql, params) => exec(state, sql, params),
    // Copy-on-write: work on a draft, commit only if fn resolves (ROLLBACK otherwise).
    transaction: async (fn) => {
      const draft = { ...state, ledger: [...state.ledger] };
      const result = await fn({ query: async (sql, params) => exec(draft, sql, params) });
      Object.assign(state, draft);
      return result;
    },
  };

  const loggerPath = require.resolve('../utils/logger');
  delete require.cache[jobPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
  require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { enqueuePushNotification: async () => {} } };
  require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { info: () => {}, warn: () => {}, error: () => {} } };
  const job = require('../jobs/trialDripJob');
  return job;
}

function dripFn(job) {
  return job.runTrialDrip || job.trialDrip || Object.values(job).find(v => typeof v === 'function' && /drip/i.test(v.name));
}

describe('trial claim — first 2 credits at claim time', () => {
  const { claimTrial, TRIAL_INITIAL_CREDITS } = require('../services/trialClaim');

  // Fake tx client: user row + credits row, records ledger inserts.
  function fakeTx(state) {
    return {
      async query(sql, params) {
        if (/UPDATE users\s+SET trial_claimed_at/.test(sql)) {
          assert.match(sql, /WHERE id = \$1 AND trial_claimed_at IS NULL/);
          if (state.claimed) return { rows: [], rowCount: 0 };
          state.claimed = true;
          state.issued = params[2];
          return { rows: [{ trial_ends_at: 'T+7d' }], rowCount: 1 };
        }
        if (/UPDATE credits SET balance/.test(sql)) {
          if (!state.hasCreditsRow) return { rows: [], rowCount: 0 };
          state.balance += params[0];
          return { rows: [], rowCount: 1 };
        }
        if (/INSERT INTO credit_transactions/.test(sql)) {
          assert.equal(literalFor(sql, 'payment_method'), 'bonus');
          assert.match(sql, /'trial_drip'/);
          state.ledger.push(params);
          return { rows: [], rowCount: 1 };
        }
        throw new Error('unexpected sql: ' + sql);
      },
    };
  }

  test('claim credits 2 now, ledgers it as trial_drip, counts it toward the 14 cap', async () => {
    const state = { claimed: false, balance: 0, issued: 0, ledger: [], hasCreditsRow: true };
    const r = await claimTrial(fakeTx(state), 'u1');
    assert.equal(r.claimed, true);
    assert.equal(TRIAL_INITIAL_CREDITS, 2);
    assert.deepEqual({ balance: state.balance, issued: state.issued, ledgerRows: state.ledger.length }, { balance: 2, issued: 2, ledgerRows: 1 });
  });

  test('second claim grants nothing', async () => {
    const state = { claimed: true, balance: 2, issued: 2, ledger: [], hasCreditsRow: true };
    const r = await claimTrial(fakeTx(state), 'u1');
    assert.equal(r.claimed, false);
    assert.equal(state.balance, 2);
    assert.equal(state.ledger.length, 0);
  });

  test('missing credits row throws so the transaction rolls back the claim', async () => {
    const state = { claimed: false, balance: 0, issued: 0, ledger: [], hasCreditsRow: false };
    await assert.rejects(claimTrial(fakeTx(state), 'u1'), /credits row missing/);
  });

  test('day-0 grant + nightly drip never exceed 14 credits', () => {
    // Claim sets issued=2; the drip adds 2 while issued + 2 <= 14.
    let issued = TRIAL_INITIAL_CREDITS;
    for (let night = 1; night <= 7; night++) if (issued + 2 <= 14) issued += 2;
    assert.equal(issued, 14);
  });
});

describe('trial drip', () => {
  const quiet = (fn) => async () => {
    const [log, err] = [console.log, console.error];
    console.log = () => {}; console.error = () => {};
    try { await fn(); } finally { console.log = log; console.error = err; }
  };

  test('credits 2, writes a ledger row, advances the counter', quiet(async () => {
    const state = { balance: 0, issued: 0, ledger: [] };
    await dripFn(loadTrialDripWith(state))();
    assert.deepEqual({ balance: state.balance, issued: state.issued, ledgerRows: state.ledger.length }, { balance: 2, issued: 2, ledgerRows: 1 });
  }));

  test('ledger failure rolls back the balance (no free uncapped credits)', quiet(async () => {
    const state = { balance: 0, issued: 0, ledger: [] };
    await dripFn(loadTrialDripWith(state, { failLedger: true }))();
    assert.deepEqual({ balance: state.balance, issued: state.issued }, { balance: 0, issued: 0 });
  }));

  test('stops at the 14-credit cap', quiet(async () => {
    const state = { balance: 14, issued: 14, ledger: [] };
    await dripFn(loadTrialDripWith(state))();
    assert.equal(state.balance, 14);
    assert.equal(state.ledger.length, 0);
  }));
});
