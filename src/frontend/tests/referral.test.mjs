// Phase 46 referral link capture (src/utils/referral.js) + service worker copy.
// Run: npm test   (from src/frontend)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  normalizeReferralCode, buildReferralLink, captureReferralFromUrl, getPendingReferral, clearPendingReferral,
} from '../src/utils/referral.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const throwingStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

describe('referral link', () => {
  test('link format is [APP_URL]/?ref=CODE', () => {
    assert.equal(buildReferralLink('KE7MX2', 'https://app.peerpal.co.ke'), 'https://app.peerpal.co.ke/?ref=KE7MX2');
    assert.equal(buildReferralLink('KE7MX2', 'https://app.peerpal.co.ke/'), 'https://app.peerpal.co.ke/?ref=KE7MX2');
  });

  test('normalise matches the backend rules', () => {
    assert.equal(normalizeReferralCode('ke7-mx2'), 'KE7MX2');
    assert.equal(normalizeReferralCode('ABC'), null);
    assert.equal(normalizeReferralCode(undefined), null);
  });

  test('link round-trips through capture', () => {
    const s = memoryStorage();
    const link = buildReferralLink('KE7MX2', 'https://x.io');
    assert.equal(captureReferralFromUrl(new URL(link).search, s), 'KE7MX2');
    assert.equal(getPendingReferral(s), 'KE7MX2');
    clearPendingReferral(s);
    assert.equal(getPendingReferral(s), null);
  });

  test('invalid ?ref= is not stored and does not overwrite a held code', () => {
    const s = memoryStorage();
    captureReferralFromUrl('?ref=KE7MX2', s);
    assert.equal(captureReferralFromUrl('?ref=<script>', s), null);
    assert.equal(captureReferralFromUrl('', s), null);
    assert.equal(getPendingReferral(s), 'KE7MX2');
  });

  test('blocked storage never throws', () => {
    assert.equal(captureReferralFromUrl('?ref=KE7MX2', throwingStorage), 'KE7MX2');
    assert.equal(getPendingReferral(throwingStorage), null);
    assert.doesNotThrow(() => clearPendingReferral(throwingStorage));
    assert.equal(getPendingReferral(null), null);
  });
});

describe('service worker — referral_reward_credited', () => {
  const code = readFileSync(new URL('../public/sw-notifications.js', import.meta.url), 'utf8');
  const sandbox = { self: {} };
  vm.runInNewContext(code, sandbox);
  const { buildNotification, resolveClickPath } = sandbox.self.PeerPalNotifications;

  test('title, generic body, routes to /profile', () => {
    const { title, options } = buildNotification({ data: { type: 'referral_reward_credited', credits_awarded: '2' } });
    assert.equal(title, 'You earned 2 credits');
    assert.equal(options.body, 'A friend you invited made their first top-up.');
    assert.equal(resolveClickPath({ type: 'referral_reward_credited' }), '/profile');
  });

  test('body never shows an alias even if one is sent', () => {
    const { options } = buildNotification({ data: { type: 'referral_reward_credited', referred_alias: 'QuietRiver42' } });
    assert.doesNotMatch(options.body, /QuietRiver42/);
  });
});
