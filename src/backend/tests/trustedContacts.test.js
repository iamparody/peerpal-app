/**
 * Phase 57 — Trusted Contacts: unit + static analysis tests.
 *
 * Unit:   encryption round-trip, tamper detection, plaintext passthrough (safeDecrypt invariant)
 * Static: PHI field encryption, self-accept guard, fire-and-forget pattern,
 *         notification type consistency, removed UI fields
 *
 * Run: npm run test:trusted-contacts  (from src/backend)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Unit tests: encryption.js ─────────────────────────────────────────────────
// Set test key before requiring the module (KEY is bound at load time)
process.env.ENCRYPTION_KEY = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'; // 32 bytes hex
const { encrypt, decrypt } = require('../utils/encryption');

describe('encryption — round-trip and tamper detection', () => {
  it('encrypt → decrypt returns original plaintext', () => {
    const plain = 'I feel anxious when things change unexpectedly';
    assert.equal(decrypt(encrypt(plain)), plain);
  });

  it('encrypts empty string without throwing', () => {
    assert.equal(decrypt(encrypt('')), '');
  });

  it('same plaintext produces different ciphertexts (random IV)', () => {
    const plain = 'warning sign';
    assert.notEqual(encrypt(plain), encrypt(plain));
  });

  it('tampered ciphertext throws on decrypt (GCM auth tag fails)', () => {
    const ct = encrypt('sensitive PHI');
    const [iv, tag, data] = ct.split(':');
    const tampered = `${iv}:${tag}:ff${data.slice(2)}`;
    assert.throws(() => decrypt(tampered));
  });

  it('safeDecrypt invariant: plaintext without iv:tag:data format returns as-is', () => {
    // safeDecrypt is private in safetyPlan.js — test the invariant directly:
    // decrypt(plaintext) must throw so the catch branch returns the raw value
    const legacy = 'legacy unencrypted text';
    assert.throws(() => decrypt(legacy), 'plaintext must throw so safeDecrypt falls back');
  });

  it('ciphertext format is iv(hex):tag(hex):data(hex) — three colon-separated parts', () => {
    const ct = encrypt('check format');
    const parts = ct.split(':');
    assert.equal(parts.length, 3, 'ciphertext must have exactly 3 colon-separated parts');
    assert.equal(parts[0].length, 24,  'IV must be 12 bytes = 24 hex chars');
    assert.equal(parts[1].length, 32,  'auth tag must be 16 bytes = 32 hex chars');
  });
});

// ── Static analysis setup ─────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const src = {
  safetyPlan:   fs.readFileSync(path.join(ROOT, 'routes/safetyPlan.js'),   'utf8'),
  moods:        fs.readFileSync(path.join(ROOT, 'routes/moods.js'),        'utf8'),
  peer:         fs.readFileSync(path.join(ROOT, 'routes/peer.js'),         'utf8'),
  migration115: fs.readFileSync(path.join(ROOT, 'migrations/115_trusted_contacts.sql'), 'utf8'),
};

const frontendRoot = path.join(ROOT, '../frontend/src');
const ui = {
  safetyPlanScreen: fs.readFileSync(path.join(frontendRoot, 'screens/SafetyPlanScreen.jsx'), 'utf8'),
  sw:               fs.readFileSync(path.join(ROOT, '../frontend/public/sw-notifications.js'), 'utf8'),
  notifications:    fs.readFileSync(path.join(frontendRoot, 'screens/NotificationsScreen.jsx'), 'utf8'),
};

// ── PHI field encryption ──────────────────────────────────────────────────────
describe('safetyPlan.js — PHI fields encrypted on write', () => {
  const PHI_FIELDS = ['warning_signs', 'helpful_things', 'things_to_avoid', 'reason_to_continue'];

  for (const field of PHI_FIELDS) {
    it(`PUT route wraps ${field} in encrypt()`, () => {
      assert.ok(
        src.safetyPlan.includes(`encrypt(${field})`),
        `${field} must be passed through encrypt() before storage`
      );
    });
  }

  it('GET route uses decryptPlan() to decrypt PHI before returning', () => {
    assert.ok(src.safetyPlan.includes('decryptPlan(rows[0])'));
  });

  it('decryptPlan uses safeDecrypt for each PHI field (graceful legacy fallback)', () => {
    assert.ok(src.safetyPlan.includes('safeDecrypt'));
  });
});

// ── Self-accept guard ─────────────────────────────────────────────────────────
describe('safetyPlan.js — token accept blocks self-linking', () => {
  it("token accept WHERE clause includes 'user_id != $1'", () => {
    assert.ok(
      src.safetyPlan.includes('user_id != $1'),
      "Token accept path must prevent a user accepting their own invite"
    );
  });
});

// ── Contact count cap ─────────────────────────────────────────────────────────
describe('safetyPlan.js — 3-contact cap enforced on invite', () => {
  it('invite route checks count >= 3 before inserting', () => {
    assert.ok(src.safetyPlan.includes('>= 3'));
  });

  it('count query filters out revoked rows', () => {
    // ensure the count excludes revoked so freed slots are reusable
    const countQuery = src.safetyPlan.match(/SELECT COUNT\(\*\)[\s\S]*?WHERE user_id = \$1 AND status != 'revoked'/);
    assert.ok(countQuery, "invite count must exclude status = 'revoked'");
  });
});

// ── Fire-and-forget pattern ───────────────────────────────────────────────────
describe('mood + no-peer alerts fire after response via setImmediate', () => {
  it('moods.js: trusted_contact_mood_alert is inside a setImmediate block', () => {
    const alertIdx = src.moods.indexOf("'trusted_contact_mood_alert'");
    assert.ok(alertIdx > 0, 'trusted_contact_mood_alert not found in moods.js');
    const before = src.moods.slice(0, alertIdx);
    const lastImmediate = before.lastIndexOf('setImmediate');
    const lastRes       = before.lastIndexOf('res.status(201)');
    assert.ok(lastImmediate > lastRes, 'mood alert must be inside setImmediate that fires after the 201 response');
  });

  it('moods.js: no inner per-contact fcm_token query (N+1 eliminated)', () => {
    // After the fix, the contact fcm_token comes from the JOIN — no separate SELECT inside the loop
    const alertSection = src.moods.slice(src.moods.indexOf('trusted_contact_mood_alert'));
    assert.ok(
      !alertSection.slice(0, 500).includes("SELECT fcm_token FROM users WHERE id"),
      'mood alert must not do a per-contact fcm_token query inside the loop'
    );
  });

  it('peer.js: trusted_contact_no_peer_alert is inside a setImmediate block', () => {
    const alertIdx = src.peer.indexOf("'trusted_contact_no_peer_alert'");
    assert.ok(alertIdx > 0, 'trusted_contact_no_peer_alert not found in peer.js');
    const before = src.peer.slice(0, alertIdx);
    assert.ok(before.lastIndexOf('setImmediate') > -1, 'no-peer alert must be inside setImmediate');
  });
});

// ── Notification type consistency ─────────────────────────────────────────────
describe('notification types — migration, backend, and frontend in sync', () => {
  const TYPES = [
    'trusted_contact_request',
    'trusted_contact_accepted',
    'trusted_contact_mood_alert',
    'trusted_contact_no_peer_alert',
  ];

  for (const t of TYPES) {
    it(`${t} — declared in migration 115`, () => {
      assert.ok(src.migration115.includes(`'${t}'`), `${t} missing from migration 115`);
    });

    it(`${t} — referenced in backend source`, () => {
      // request/accepted live in safetyPlan.js; mood/no_peer alerts live in moods.js / peer.js
      const inBackend = src.safetyPlan.includes(`'${t}'`) ||
                        src.moods.includes(`'${t}'`)      ||
                        src.peer.includes(`'${t}'`);
      assert.ok(inBackend, `${t} missing from all backend route files`);
    });

    it(`${t} — registered in service worker NOTIF_TYPES`, () => {
      assert.ok(ui.sw.includes(t), `${t} missing from sw-notifications.js`);
    });

    it(`${t} — mapped in NotificationsScreen TYPE_META`, () => {
      assert.ok(ui.notifications.includes(t), `${t} missing from NotificationsScreen.jsx`);
    });
  }
});

// ── Frontend invariants ───────────────────────────────────────────────────────
describe('SafetyPlanScreen.jsx — removed fields and dead code', () => {
  it('emergency_resources not sent in handleSave payload', () => {
    const saveFn = ui.safetyPlanScreen.slice(
      ui.safetyPlanScreen.indexOf('async function handleSave')
    ).slice(0, 400);
    assert.ok(
      !saveFn.includes('emergency_resources'),
      'emergency_resources must not appear in handleSave payload'
    );
  });

  it('useQueryClient dead import removed', () => {
    assert.ok(
      !ui.safetyPlanScreen.includes('useQueryClient'),
      'useQueryClient was unused and should be removed'
    );
  });

  it('no alias search state or functions (link-only invite)', () => {
    assert.ok(!ui.safetyPlanScreen.includes('searchAlias'),  'searchAlias state must be removed');
    assert.ok(!ui.safetyPlanScreen.includes('searchUser'),   'searchUser function must be removed');
    assert.ok(!ui.safetyPlanScreen.includes('sendRequest'),  'sendRequest function must be removed');
  });
});

// ── Revoke is a soft-delete (status = 'revoked'), not a hard DELETE ────────────
describe("safetyPlan.js — revoke sets status = 'revoked', not DELETE FROM", () => {
  it("DELETE endpoint updates status to 'revoked'", () => {
    // Find the DELETE route handler and confirm it uses UPDATE not DELETE FROM
    const deleteRoute = src.safetyPlan.slice(
      src.safetyPlan.indexOf("router.delete('/trusted-contacts/:id'")
    ).slice(0, 300);
    assert.ok(deleteRoute.includes("status = 'revoked'"), "revoke must be a soft-delete");
    assert.ok(!deleteRoute.includes('DELETE FROM trusted_contacts'), 'must not hard-delete the row');
  });
});
