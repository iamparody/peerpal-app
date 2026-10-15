// Service worker notification rendering + click routing (public/sw-notifications.js).
// Run: npm test   (from src/frontend)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/sw-notifications.js', import.meta.url), 'utf8');
const sandbox = { self: {} };
vm.runInNewContext(code, sandbox, { filename: 'sw-notifications.js' });
const { buildNotification, resolveClickPath, NOTIF_TYPES } = sandbox.self.PeerPalNotifications;

const peerPush = {
  data: {
    type: 'peer_request_broadcast', request_id: 'req-1',
    channel_preference: 'voice', topic_label: 'Grief & Loss',
    title: 'Someone needs your support', body: 'Grief & Loss · Voice session',
  },
};

describe('buildNotification — peer request', () => {
  const { title, options } = buildNotification(peerPush, 1000);

  test('title and body', () => {
    assert.equal(title, 'Someone needs your support');
    assert.equal(options.body, 'Grief & Loss · Voice session');
  });
  test('stays on screen and re-alerts when a newer request replaces it', () => {
    assert.equal(options.requireInteraction, true);
    assert.equal(options.renotify, true);
    assert.equal(options.tag, 'peer_request_broadcast');
    assert.equal(options.silent, false);
  });
  test('has a vibration pattern no other notification type uses', () => {
    const mine = JSON.stringify(options.vibrate);
    const others = Object.entries(NOTIF_TYPES)
      .filter(([k]) => k !== 'peer_request_broadcast')
      .map(([, v]) => JSON.stringify(v.vibrate));
    assert.ok(!others.includes(mine));
    const total = options.vibrate.reduce((a, b) => a + b, 0);
    assert.ok(total >= 1500, `ring pattern should last >=1.5s, got ${total}ms`);
  });
  test('accept / not-now actions', () => {
    // Array.from: arrays from the vm realm have a foreign prototype, which strict deepEqual rejects.
    assert.deepEqual(Array.from(options.actions, a => a.action), ['accept', 'skip']);
  });
  test('carries request_id for stale-notification cleanup', () => {
    assert.equal(options.data.request_id, 'req-1');
    assert.equal(options.timestamp, 1000);
  });
  test('text channel copy', () => {
    const { options: o } = buildNotification({ data: { type: 'peer_request_broadcast', channel_preference: 'text' } });
    assert.equal(o.body, 'Text session');
  });
});

describe('buildNotification — fallback for unknown types (data-only payloads)', () => {
  test('uses data.title/body from the backend', () => {
    const { title, options } = buildNotification({ data: { type: 'new_thing', title: 'Hello', body: 'World' } });
    assert.equal(title, 'Hello');
    assert.equal(options.body, 'World');
    assert.equal(options.tag, 'new_thing');
  });
  test('never shows a raw type key as the title', () => {
    const { title } = buildNotification({ data: { type: 'account_notice', title: 'account_notice' } });
    assert.equal(title, 'PeerPal');
  });
  test('empty payload still renders', () => {
    const { title, options } = buildNotification({});
    assert.equal(title, 'PeerPal');
    assert.equal(options.body, 'You have a new notification.');
    assert.equal(options.tag, 'peerpal-general');
  });
});

describe('resolveClickPath', () => {
  test('peer request tap and "I\'m ready" both open the highlighted request', () => {
    assert.equal(resolveClickPath(peerPush.data, ''), '/peer?highlight=req-1');
    assert.equal(resolveClickPath(peerPush.data, 'accept'), '/peer?highlight=req-1');
  });
  test('"Not now" just dismisses', () => {
    assert.equal(resolveClickPath(peerPush.data, 'skip'), null);
  });
  test('session confirmation joins the bridge', () => {
    assert.equal(resolveClickPath({ type: 'session_confirmation', session_id: 's1' }, ''), '/peer/session/s1/bridge');
    assert.equal(resolveClickPath({ type: 'session_confirmation', session_id: 's1' }, 'join'), '/peer/session/s1/bridge');
    assert.equal(resolveClickPath({ type: 'session_confirmation' }, ''), '/peer');
  });
  test('static routes, route fallback, root fallback', () => {
    assert.equal(resolveClickPath({ type: 'credit_low' }, ''), '/credits');
    assert.equal(resolveClickPath({ type: 'whatever', route: '/x' }, ''), '/x');
    assert.equal(resolveClickPath({}, ''), '/');
    assert.equal(resolveClickPath(undefined, undefined), '/');
  });
});
