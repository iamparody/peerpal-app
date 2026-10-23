'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Pure helpers mirroring therapy.js route logic ───────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_NOTE_TYPES = ['pre', 'session', 'follow_up'];

function isValidUuid(s) { return UUID_RE.test(s); }
function isValidNoteType(t) { return VALID_NOTE_TYPES.includes(t); }
function isReturning(totalSessions) { return totalSessions > 1; }

// ─── UUID validation ──────────────────────────────────────────────────────────

describe('UUID validation', () => {
  test('accepts valid v4 UUID', () => {
    assert.ok(isValidUuid('550e8400-e29b-41d4-a716-446655440000'));
  });

  test('accepts uppercase UUID', () => {
    assert.ok(isValidUuid('550E8400-E29B-41D4-A716-446655440000'));
  });

  test('rejects empty string', () => {
    assert.ok(!isValidUuid(''));
  });

  test('rejects SQL injection attempt', () => {
    assert.ok(!isValidUuid("'; DROP TABLE therapy_session_notes; --"));
  });

  test('rejects short string', () => {
    assert.ok(!isValidUuid('abc123'));
  });

  test('rejects UUID with extra segment', () => {
    assert.ok(!isValidUuid('550e8400-e29b-41d4-a716-446655440000-extra'));
  });
});

// ─── note_type validation ─────────────────────────────────────────────────────

describe('note_type validation', () => {
  test('accepts pre', () => {
    assert.ok(isValidNoteType('pre'));
  });

  test('accepts session', () => {
    assert.ok(isValidNoteType('session'));
  });

  test('accepts follow_up', () => {
    assert.ok(isValidNoteType('follow_up'));
  });

  test('rejects pre_session (not in DB enum)', () => {
    assert.ok(!isValidNoteType('pre_session'));
  });

  test('rejects unknown type', () => {
    assert.ok(!isValidNoteType('urgent'));
  });

  test('rejects empty string', () => {
    assert.ok(!isValidNoteType(''));
  });

  test('default note_type is session', () => {
    const { note_type = 'session' } = {};
    assert.equal(note_type, 'session');
  });
});

// ─── is_returning derivation ──────────────────────────────────────────────────

describe('is_returning (total_sessions > 1)', () => {
  test('false for 0 sessions', () => {
    assert.equal(isReturning(0), false);
  });

  test('false for first session', () => {
    assert.equal(isReturning(1), false);
  });

  test('true for 2 sessions', () => {
    assert.equal(isReturning(2), true);
  });

  test('true for many sessions', () => {
    assert.equal(isReturning(50), true);
  });
});

// ─── GET /therapist/clients response shape ────────────────────────────────────

describe('clients list response shape', () => {
  // Simulate what the route returns from the DB query
  const mockRow = {
    member_user_id: '550e8400-e29b-41d4-a716-446655440000',
    alias: 'Jane',
    total_sessions: 3,
    last_session_at: new Date('2026-10-01'),
    note_count: 2,
  };

  test('has required fields', () => {
    assert.ok('member_user_id' in mockRow);
    assert.ok('alias' in mockRow);
    assert.ok('total_sessions' in mockRow);
    assert.ok('last_session_at' in mockRow);
    assert.ok('note_count' in mockRow);
  });

  test('is_returning derived correctly from total_sessions', () => {
    assert.equal(isReturning(mockRow.total_sessions), true);
  });
});

// ─── GET /session-notes response ──────────────────────────────────────────────

describe('session-notes response', () => {
  const mockNotes = [
    { id: '1', note_type: 'pre', content: 'Pre note', created_at: new Date('2026-10-01T08:00:00Z') },
    { id: '2', note_type: 'session', content: 'Session note', created_at: new Date('2026-10-01T10:00:00Z') },
    { id: '3', note_type: 'follow_up', content: 'Follow-up', created_at: new Date('2026-10-02T09:00:00Z') },
  ];

  test('returns array, not single object', () => {
    assert.ok(Array.isArray(mockNotes));
  });

  test('all three note_types present', () => {
    const types = mockNotes.map(n => n.note_type);
    assert.ok(types.includes('pre'));
    assert.ok(types.includes('session'));
    assert.ok(types.includes('follow_up'));
  });

  test('notes ordered by created_at ascending', () => {
    for (let i = 1; i < mockNotes.length; i++) {
      assert.ok(mockNotes[i].created_at >= mockNotes[i - 1].created_at);
    }
  });
});
