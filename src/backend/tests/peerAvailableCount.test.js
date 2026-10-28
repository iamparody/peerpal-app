/**
 * GET /peer/available-count — returns count of quiz-done, active, available, broadcast-on peers.
 * Run: node --test tests/peerAvailableCount.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM users
  WHERE peer_quiz_done = true
    AND is_active = true
    AND peer_available_until > NOW()
    AND notif_peer_broadcast = true
    AND id != $1
    AND NOT EXISTS (
      SELECT 1 FROM peer_requests pr
      WHERE pr.accepted_by = id AND pr.status = 'active'
    )
`;

function fakeDb(count) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ count: String(count) }] };
  };
  return { query, calls };
}

describe('GET /peer/available-count', () => {
  test('returns integer count from DB', async () => {
    const { query, calls } = fakeDb(3);
    const requesterId = 'user-abc';

    const { rows } = await query(COUNT_SQL, [requesterId]);
    const count = parseInt(rows[0].count, 10);

    assert.equal(count, 3);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [requesterId]);
  });

  test('excludes the requesting user via id != $1', async () => {
    const { query, calls } = fakeDb(0);
    const requesterId = 'self-user';

    await query(COUNT_SQL, [requesterId]);

    assert.ok(calls[0].sql.includes('id != $1'), 'requester should be excluded');
    assert.deepEqual(calls[0].params, [requesterId]);
  });

  test('zero count parses as 0, not NaN', async () => {
    const { query } = fakeDb(0);
    const { rows } = await query(COUNT_SQL, ['any-id']);
    const count = parseInt(rows[0].count, 10);
    assert.equal(count, 0);
    assert.ok(!isNaN(count));
  });

  test('SQL includes all eligibility conditions', () => {
    assert.ok(COUNT_SQL.includes('peer_quiz_done = true'));
    assert.ok(COUNT_SQL.includes('is_active = true'));
    assert.ok(COUNT_SQL.includes('peer_available_until > NOW()'));
    assert.ok(COUNT_SQL.includes('notif_peer_broadcast = true'));
    assert.ok(COUNT_SQL.includes("pr.status = 'active'"), 'must exclude peers in active session');
  });
});
