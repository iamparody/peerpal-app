/**
 * Peer-request push: eligibility, quiet hours, TTL, dedup, FCM message shape, token ownership.
 * Design: docs/peer-request-push.md
 *
 * Run: npm run test:push   (from src/backend)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const push = require('../services/peerRequestPush');
const { buildFcmMessage, assignFcmToken } = require('../utils/fcm');

const utc = (h, m = 0) => new Date(Date.UTC(2026, 9, 15, h, m, 0));
const silent = () => {};

// Fake query: records calls, answers the eligibility SELECT with `targets`.
function fakeDb(targets) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql === push.SELECT_PUSH_TARGETS_SQL) return { rows: targets };
    return { rows: [], rowCount: 0 };
  };
  return { query, calls };
}

// Fake Upstash client with SET NX semantics.
function fakeRedis() {
  const store = new Set();
  return {
    store,
    async set(key, _v, opts) {
      assert.equal(opts.nx, true);
      assert.equal(opts.ex, push.DEDUP_TTL_SECONDS);
      if (store.has(key)) return null;
      store.add(key);
      return 'OK';
    },
  };
}

beforeEach(() => push._localClaims.clear());

describe('isQuietHour (Nairobi 22:00–07:00, EAT = UTC+3)', () => {
  test('21:59 EAT is not quiet', () => assert.equal(push.isQuietHour(utc(18, 59)), false));
  test('22:00 EAT is quiet', () => assert.equal(push.isQuietHour(utc(19, 0)), true));
  test('03:00 EAT is quiet (wraps midnight)', () => assert.equal(push.isQuietHour(utc(0, 0)), true));
  test('06:59 EAT is quiet', () => assert.equal(push.isQuietHour(utc(3, 59)), true));
  test('07:00 EAT is not quiet', () => assert.equal(push.isQuietHour(utc(4, 0)), false));
});

describe('pushTtlSeconds — push expires with the request', () => {
  const now = utc(10);
  test('fresh request: full 130s lifetime', () => {
    assert.equal(push.pushTtlSeconds(new Date(now.getTime() + 130_000), now), 130);
  });
  test('tier-2 broadcast at T+60s: 70s left', () => {
    assert.equal(push.pushTtlSeconds(new Date(now.getTime() + 70_000).toISOString(), now), 70);
  });
  test('unknown escalate_at falls back to default lifetime', () => {
    assert.equal(push.pushTtlSeconds(null, now), push.DEFAULT_REQUEST_LIFETIME_SECONDS);
    assert.equal(push.pushTtlSeconds('not-a-date', now), push.DEFAULT_REQUEST_LIFETIME_SECONDS);
  });
  test('already expired: negative', () => {
    assert.ok(push.pushTtlSeconds(new Date(now.getTime() - 5_000), now) < 0);
  });
});

describe('claimPushSlot — dedup per (device, request)', () => {
  test('redis key never contains the raw token', () => {
    const key = push.dedupKey('secret-device-token', 'req-1');
    assert.ok(!key.includes('secret-device-token'));
    assert.ok(key.startsWith('peerpush:req-1:'));
  });
  test('second claim for same device+request is rejected (cross-instance via redis)', async () => {
    const redis = fakeRedis();
    assert.equal(await push.claimPushSlot('tok', 'req-1', { redis }), true);
    assert.equal(await push.claimPushSlot('tok', 'req-1', { redis }), false);
    assert.equal(await push.claimPushSlot('tok', 'req-2', { redis }), true);
  });
  test('redis error falls back to local claims, still deduping', async () => {
    const redis = { set: async () => { throw new Error('down'); } };
    const warn = console.warn; console.warn = silent;
    try {
      assert.equal(await push.claimPushSlot('tok', 'req-1', { redis, nowMs: 0 }), true);
      assert.equal(await push.claimPushSlot('tok', 'req-1', { redis, nowMs: 1000 }), false);
    } finally { console.warn = warn; }
  });
  test('local claim expires after DEDUP_TTL_SECONDS', async () => {
    assert.equal(await push.claimPushSlot('tok', 'req-1', { nowMs: 0 }), true);
    const later = push.DEDUP_TTL_SECONDS * 1000 + 1;
    assert.equal(await push.claimPushSlot('tok', 'req-1', { nowMs: later }), true);
  });
});

describe('eligibility SQL — the product rules', () => {
  const sql = push.SELECT_PUSH_TARGETS_SQL;
  test('requires an active availability window', () => assert.match(sql, /peer_available_until > NOW\(\)/));
  test('honours the Profile "peer requests" toggle (was ignored before)', () => assert.match(sql, /notif_peer_broadcast = true/));
  test('night opt-in only gates during quiet hours', () => {
    assert.match(sql, /\(\$2::boolean = false OR u\.notif_peer_night = true\)/);
  });
  test('excludes peers already in an active session', () => assert.match(sql, /pr2\.status = 'active'/));
});

describe('broadcastPeerRequestPush', () => {
  const ids = ['u1', 'u2'];
  const targets = [{ id: 'u1', fcm_token: 't1' }, { id: 'u2', fcm_token: 't2' }];

  function run(overrides = {}) {
    const db = overrides.db || fakeDb(targets);
    const sent = [];
    const enqueue = overrides.enqueue || (async (...args) => { sent.push(args); });
    return push.broadcastPeerRequestPush({
      userIds: ids, requestId: 'req-abcdef123', channelPreference: 'voice', topicLabel: 'Grief & Loss',
      escalateAt: new Date(utc(10).getTime() + 130_000), now: utc(10),
      query: db.query, enqueue, redis: fakeRedis(), log: silent, ...overrides,
    }).then((summary) => ({ summary, sent, db }));
  }

  test('daytime: passes quiet=false, pushes every eligible peer with urgent + ttl', async () => {
    const { summary, sent, db } = await run();
    const select = db.calls.find(c => c.sql === push.SELECT_PUSH_TARGETS_SQL);
    assert.deepEqual(select.params, [ids, false]);
    assert.equal(summary.sent, 2);
    const [token, title, body, data] = sent[0];
    assert.equal(token, 't1');
    assert.equal(title, 'Someone needs your support');
    assert.equal(body, 'Grief & Loss · Voice session');
    assert.equal(data.type, 'peer_request_broadcast');
    assert.equal(data._urgent, 'true');
    assert.equal(data._ttl, '130');
  });

  test('quiet hours: still sends, but the query filters to night opt-ins', async () => {
    const { summary, db } = await run({ now: utc(20), escalateAt: new Date(utc(20).getTime() + 130_000) });
    const select = db.calls.find(c => c.sql === push.SELECT_PUSH_TARGETS_SQL);
    assert.deepEqual(select.params, [ids, true]);
    assert.equal(summary.quiet, true);
    assert.equal(summary.sent, 2);
  });

  test('request about to expire: no push, no DB lookup', async () => {
    const { summary, sent, db } = await run({ escalateAt: new Date(utc(10).getTime() + 10_000) });
    assert.equal(summary.skipped, 'request_expiring');
    assert.equal(sent.length, 0);
    assert.equal(db.calls.length, 0);
  });

  test('tier 1 + tier 2 (or cron replay) never push the same device twice', async () => {
    const redis = fakeRedis();
    const first = await run({ redis });
    const second = await run({ redis });
    assert.equal(first.summary.sent, 2);
    assert.equal(second.summary.sent, 0);
    assert.equal(second.summary.dup, 2);
  });

  test('two accounts on one device token get one push', async () => {
    const db = fakeDb([{ id: 'u1', fcm_token: 'same' }, { id: 'u2', fcm_token: 'same' }]);
    const { summary } = await run({ db });
    assert.equal(summary.sent, 1);
    assert.equal(summary.dup, 1);
  });

  test('one failed enqueue does not stop the rest; only sent peers get a push row', async () => {
    const sent = [];
    const enqueue = async (token, ...rest) => {
      if (token === 't1') throw new Error('boom');
      sent.push([token, ...rest]);
    };
    const warn = console.warn; console.warn = silent;
    try {
      const { summary, db } = await run({ enqueue });
      assert.equal(summary.sent, 1);
      assert.deepEqual(summary.sentUserIds, ['u2']);
      const insert = db.calls.find(c => /INSERT INTO notifications/.test(c.sql));
      assert.deepEqual(insert.params[0], ['u2']);
    } finally { console.warn = warn; }
  });

  test('no eligible peers: no notifications insert', async () => {
    const { summary, db } = await run({ db: fakeDb([]) });
    assert.equal(summary.eligible, 0);
    assert.ok(!db.calls.some(c => /INSERT INTO notifications/.test(c.sql)));
  });

  test('emits one trace line per broadcast', async () => {
    const lines = [];
    await run({ log: (l) => lines.push(l) });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[peer-push\] request=req-abcd candidates=2 eligible=2 sent=2 dup=0 quiet=false ttl=130$/);
  });

  test('trace says NOT DELIVERED when Firebase has no credentials', async () => {
    const lines = [];
    await run({ log: (l) => lines.push(l), pushEnabled: false });
    assert.match(lines[0], / fcm=off\(NOT DELIVERED\)$/);
  });
});

describe('buildFcmMessage', () => {
  test('is data-only: no top-level notification (caused duplicate web notifications)', () => {
    const msg = buildFcmMessage('tok', 'Title', 'Body', { type: 'x' });
    assert.equal(msg.notification, undefined);
    assert.equal(msg.android, undefined);
  });
  test('title/body travel in data for the service worker fallback', () => {
    const msg = buildFcmMessage('tok', 'Title', 'Body', { type: 'x' });
    assert.deepEqual(msg.data, { type: 'x', title: 'Title', body: 'Body' });
  });
  test('explicit data.title wins over the title argument', () => {
    assert.equal(buildFcmMessage('tok', 'Arg', '', { title: 'Data' }).data.title, 'Data');
  });
  test('urgent push: high urgency + ttl header, control keys stripped, values stringified', () => {
    const msg = buildFcmMessage('tok', 'T', 'B', { _urgent: 'true', _ttl: '70', request_id: 42, empty: null });
    assert.deepEqual(msg.webpush.headers, { Urgency: 'high', TTL: '70' });
    assert.equal(msg.data._urgent, undefined);
    assert.equal(msg.data._ttl, undefined);
    assert.equal(msg.data.request_id, '42');
    assert.ok(!('empty' in msg.data));
  });
  test('non-urgent push: normal urgency, FCM default TTL', () => {
    assert.deepEqual(buildFcmMessage('tok', 'T', 'B', {}).webpush.headers, { Urgency: 'normal' });
  });
});

describe('peer_push_report summarize — the outcome metric', () => {
  const { summarize } = require('../scripts/peer_push_report');
  test('splits day/night by EAT hour and computes reach + match rates', () => {
    const s = summarize([
      { created_hour_eat: 10, pushed: true,  matched: true },
      { created_hour_eat: 14, pushed: false, matched: false },
      { created_hour_eat: 23, pushed: true,  matched: false },
      { created_hour_eat: 3,  pushed: false, matched: true },
    ]);
    assert.equal(s.all.requests, 4);
    assert.equal(s.all.pushReachPct, 50);
    assert.equal(s.all.matchRatePct, 50);
    assert.equal(s.all.matchRateWhenPushedPct, 50);
    assert.equal(s.all.matchRateWhenNotPushedPct, 50);
    assert.equal(s.day.requests, 2);
    assert.equal(s.night.requests, 2);
    assert.equal(s.night.pushReachPct, 50);
  });
  test('boundaries: 22:00 is night, 07:00 is day', () => {
    const s = summarize([{ created_hour_eat: 22 }, { created_hour_eat: 7 }]);
    assert.equal(s.night.requests, 1);
    assert.equal(s.day.requests, 1);
  });
  test('empty window: null rates, no divide-by-zero', () => {
    const s = summarize([]);
    assert.equal(s.all.pushReachPct, null);
    assert.equal(s.all.matchRateWhenPushedPct, null);
  });
});

describe('assignFcmToken — one device token, one account', () => {
  test('setting a token first clears it from any other account', async () => {
    const { query, calls } = fakeDb([]);
    await assignFcmToken(query, 'user-b', 'shared-token');
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /SET fcm_token = NULL WHERE fcm_token = \$1 AND id <> \$2/);
    assert.deepEqual(calls[0].params, ['shared-token', 'user-b']);
    assert.deepEqual(calls[1].params, ['shared-token', 'user-b']);
  });
  test('clearing (logout) only touches the caller', async () => {
    const { query, calls } = fakeDb([]);
    await assignFcmToken(query, 'user-a', null);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [null, 'user-a']);
  });
});
