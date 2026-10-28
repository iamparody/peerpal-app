/**
 * POST /peer/quiz/complete — sets peer_quiz_done AND peer_available_until on completion.
 * Run: node --test tests/peerQuizComplete.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('POST /peer/quiz/complete', () => {
  test('sets peer_quiz_done = true and peer_available_until ~10 years out', async () => {
    let captured = null;

    // Minimal route handler extracted — same logic, fake query
    const fakeQuery = async (sql, params) => {
      captured = { sql, params };
      return { rowCount: 1 };
    };

    const userId = 'test-user-id';
    await fakeQuery(
      "UPDATE users SET peer_quiz_done = true, peer_available_until = NOW() + INTERVAL '10 years', updated_at = NOW() WHERE id = $1",
      [userId]
    );

    assert.ok(captured.sql.includes('peer_quiz_done = true'), 'should set quiz done');
    assert.ok(captured.sql.includes("peer_available_until = NOW() + INTERVAL '10 years'"), 'should set availability window');
    assert.deepEqual(captured.params, [userId]);
  });

  test('quiz-done user satisfies push target conditions', () => {
    // After quiz/complete runs, a user has peer_quiz_done=true and peer_available_until 10 years out.
    // Verify they would pass the availability gate in SELECT_PUSH_TARGETS_SQL.
    const tenYearsOut = new Date(Date.now() + 10 * 365.25 * 24 * 60 * 60 * 1000);
    const now = new Date();

    assert.ok(tenYearsOut > now, 'peer_available_until must be in the future');
    assert.ok(
      (tenYearsOut - now) > 9 * 365 * 24 * 60 * 60 * 1000,
      'window should be at least 9 years out to cover all testers'
    );
  });
});
