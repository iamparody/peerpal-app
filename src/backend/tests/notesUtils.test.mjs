/**
 * Unit tests for notesUtils pure functions.
 * Run: node --test tests/notesUtils.test.mjs  (from src/backend)
 * Uses a local CJS-compatible copy of the logic — no Vite/ESM bundler needed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── inline the pure logic (mirrors src/therapist/src/utils/notesUtils.js) ──
const NOTE_TYPE_ORDER = ['pre', 'session', 'follow_up'];
const NOTE_TYPE_LABELS = { pre: 'Pre-session', session: 'Session', follow_up: 'Follow-up' };

function groupNotesByType(notes) {
  return NOTE_TYPE_ORDER
    .map((type) => ({ type, label: NOTE_TYPE_LABELS[type], notes: notes.filter((n) => n.note_type === type) }))
    .filter((g) => g.notes.length > 0);
}

function notesLabel(count) {
  return count != null ? `Notes (${count})` : 'Notes';
}

// ── groupNotesByType ──────────────────────────────────────────────────────────

describe('groupNotesByType', () => {
  test('empty array returns empty groups', () => {
    assert.deepEqual(groupNotesByType([]), []);
  });

  test('single pre note produces one group', () => {
    const groups = groupNotesByType([{ id: '1', note_type: 'pre', content: 'x' }]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'pre');
    assert.equal(groups[0].label, 'Pre-session');
    assert.equal(groups[0].notes.length, 1);
  });

  test('pre group appears before session group', () => {
    const notes = [
      { id: '2', note_type: 'session', content: 'session note' },
      { id: '1', note_type: 'pre',     content: 'pre note' },
    ];
    const groups = groupNotesByType(notes);
    assert.equal(groups[0].type, 'pre');
    assert.equal(groups[1].type, 'session');
  });

  test('follow_up appears last', () => {
    const notes = [
      { id: '1', note_type: 'follow_up', content: 'f' },
      { id: '2', note_type: 'pre',       content: 'p' },
      { id: '3', note_type: 'session',   content: 's' },
    ];
    const groups = groupNotesByType(notes);
    assert.equal(groups[0].type, 'pre');
    assert.equal(groups[1].type, 'session');
    assert.equal(groups[2].type, 'follow_up');
  });

  test('omits groups with zero notes', () => {
    const notes = [{ id: '1', note_type: 'session', content: 's' }];
    const groups = groupNotesByType(notes);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'session');
  });

  test('multiple notes in same group stay together', () => {
    const notes = [
      { id: '1', note_type: 'session', content: 'a' },
      { id: '2', note_type: 'session', content: 'b' },
      { id: '3', note_type: 'session', content: 'c' },
    ];
    const groups = groupNotesByType(notes);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].notes.length, 3);
  });

  test('unknown note_type is silently dropped', () => {
    const notes = [
      { id: '1', note_type: 'urgent', content: 'x' },
      { id: '2', note_type: 'session', content: 'y' },
    ];
    const groups = groupNotesByType(notes);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'session');
  });

  test('all three types returns three groups in correct order', () => {
    const notes = [
      { id: '3', note_type: 'follow_up', content: 'f' },
      { id: '1', note_type: 'pre',       content: 'p' },
      { id: '2', note_type: 'session',   content: 's' },
    ];
    const groups = groupNotesByType(notes);
    assert.deepEqual(groups.map(g => g.type), ['pre', 'session', 'follow_up']);
  });
});

// ── notesLabel ────────────────────────────────────────────────────────────────

describe('notesLabel', () => {
  test('returns "Notes" when count is undefined', () => {
    assert.equal(notesLabel(undefined), 'Notes');
  });

  test('returns "Notes" when count is null', () => {
    assert.equal(notesLabel(null), 'Notes');
  });

  test('returns "Notes (0)" for zero', () => {
    assert.equal(notesLabel(0), 'Notes (0)');
  });

  test('returns "Notes (1)" for one', () => {
    assert.equal(notesLabel(1), 'Notes (1)');
  });

  test('returns "Notes (12)" for twelve', () => {
    assert.equal(notesLabel(12), 'Notes (12)');
  });
});
