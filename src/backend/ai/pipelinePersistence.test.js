'use strict';

/**
 * Failure-injection tests for pipelinePersistence.js.
 *
 * Injects specific infrastructure failures and asserts that the module produces
 * the exact safe, auditable behaviour required by Sections 0–4.
 *
 * No real DB, no Groq — all dependencies are replaced with controlled fakes.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID    = 'aaaaaaaa-0000-0000-0000-000000000002';

const OBSERVED = {
  record_id:      'aaaaaaaa-0000-0000-0000-000000000010',
  user_id:        USER_ID,
  source:         'SESSION_MESSAGE',
  created_at:     '2026-01-01T00:00:00.000Z',
  session_id:     SESSION_ID,
  content_type:   'TEXT',
  content_ref:    'aaaaaaaa-0000-0000-0000-000000000010',
  schema_version: '1.0.0',
};

const DETECTED = {
  detection_id:   'aaaaaaaa-0000-0000-0000-000000000020',
  observed_ref:   OBSERVED.record_id,
  detector_id:    'resolver@1.0.0',
  detected_at:    '2026-01-01T00:00:00.000Z',
  risk_signal:    { value: 'ABSENT', status: 'DETERMINISTIC', confidence_status: 'NOT_APPLICABLE', confidence: null, uncertainty_flag: null, provenance: {}, detector_version: 'keyword-classifier@1.0.0', created_at: '2026-01-01T00:00:00.000Z' },
  support_need:   { value: 'NONE_IDENTIFIED', status: 'DETERMINISTIC', confidence_status: 'NOT_APPLICABLE', confidence: null, uncertainty_flag: null, provenance: {}, detector_version: 'resolver@1.0.0', created_at: '2026-01-01T00:00:00.000Z' },
  urgency:        { value: 'NONE', status: 'DETERMINISTIC', confidence_status: 'NOT_APPLICABLE', confidence: null, uncertainty_flag: null, provenance: {}, detector_version: 'resolver@1.0.0', created_at: '2026-01-01T00:00:00.000Z' },
  expressed_emotion: null,
  reason_code:    'NO_SIGNAL_DETECTED',
  schema_version: '1.0.0',
};

const DECIDED = {
  decision_id:           'aaaaaaaa-0000-0000-0000-000000000030',
  detection_ref:         DETECTED.detection_id,
  policy_version:        '1.0.0',
  decided_at:            '2026-01-01T00:00:00.000Z',
  schema_version:        '1.0.0',
  strategy:              'OPEN_SUPPORT',
  escalation_action:     'NONE',
  must_validate:         true,
  may_suggest_exercises: false,
  question_limit:        2,
  max_response_length:   600,
  reason_code:           'DEFAULT_STRATEGY_APPLIED',
  upstream_uncertainty:  false,
};

const GENERATED = {
  generation_id:     'aaaaaaaa-0000-0000-0000-000000000040',
  decision_ref:      DECIDED.decision_id,
  model_id:          'groq/llama-3.3-70b-versatile@1.0.0',
  generated_at:      '2026-01-01T00:00:00.000Z',
  content:           'That sounds like a really good day.',
  validation_status: 'PASSED',
  violations:        [],
  schema_version:    '1.0.0',
};

const SOURCES_NONE = { keyword: null, conversational: null };

const SOURCES_KEYWORD = {
  keyword: {
    source_id:         'aaaaaaaa-0000-0000-0000-000000000050',
    observed_ref:      OBSERVED.record_id,
    detector_version:  'keyword-classifier@1.0.0',
    detected_at:       '2026-01-01T00:00:00.000Z',
    risk_signal:       { value: 'ABSENT', status: 'DETERMINISTIC' },
    _matched_keyword:  null,
    _matched_category: null,
  },
  conversational: null,
};

const SOURCES_FALLBACK = {
  keyword: null,
  conversational: {
    source_id:         'aaaaaaaa-0000-0000-0000-000000000060',
    observed_ref:      OBSERVED.record_id,
    detector_version:  'conversational-state-detector@1.0.0',
    detected_at:       '2026-01-01T00:00:00.000Z',
    support_need:      { value: 'NONE_IDENTIFIED', status: 'DETERMINISTIC' },
    urgency:           { value: 'NONE',            status: 'DETERMINISTIC' },
    expressed_emotion: null,
    _fallback:         true,
    _fallback_reason:  'CLASSIFIER_UNAVAILABLE',
  },
};

// ─── Controlled DB mock ───────────────────────────────────────────────────────

function makeDb({ queryFail = false, transactionFail = false, failOnTable = null } = {}) {
  const calls = { query: [], transactionCalls: [] };

  const fakeQuery = async (sql, params) => {
    calls.query.push({ sql, params });
    if (queryFail) throw new Error('DB_QUERY_UNAVAILABLE');
    return { rows: [], rowCount: 1 };
  };

  const fakeTransaction = async (fn) => {
    if (transactionFail) throw new Error('DB_TRANSACTION_UNAVAILABLE');
    const client = {
      query: async (sql, params) => {
        calls.transactionCalls.push({ sql, params });
        if (failOnTable && sql.includes(failOnTable)) {
          throw new Error(`DB_INSERT_FAILED: ${failOnTable}`);
        }
        return { rows: [], rowCount: 1 };
      },
    };
    return fn(client);
  };

  return { query: fakeQuery, transaction: fakeTransaction, calls };
}

// ─── Module loader ────────────────────────────────────────────────────────────
//
// Injects a DB mock into pipelinePersistence by replacing its require.cache entry
// before load. Must be called before each test that needs a fresh mock.

function loadWithDb(dbMock) {
  const dbPath  = require.resolve('../db');
  const modPath = require.resolve('./pipelinePersistence');

  delete require.cache[modPath];
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true, exports: dbMock,
    parent: null, children: [], paths: [],
  };

  return require('./pipelinePersistence');
}

function restore() {
  const dbPath  = require.resolve('../db');
  const modPath = require.resolve('./pipelinePersistence');
  delete require.cache[modPath];
  delete require.cache[dbPath];
  require('../db'); // restore real db module
}

// Convenience: settle all microtasks queued by fire-and-forget promises
const settle = () => new Promise((r) => setImmediate(r));

// ─── persistPipelineRecords — transaction failure ─────────────────────────────

describe('persistPipelineRecords — transaction failure', () => {
  it('throws when the transaction cannot be acquired', async () => {
    const db = makeDb({ transactionFail: true });
    const { persistPipelineRecords } = loadWithDb(db);
    await assert.rejects(
      () => persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_NONE),
      /DB_TRANSACTION_UNAVAILABLE/
    );
    restore();
  });
});

// ─── persistPipelineRecords — partial insert failure within transaction ────────

describe('persistPipelineRecords — partial insert failure', () => {
  it('throws when ai_decided insert fails (ai_detected rolled back)', async () => {
    const db = makeDb({ failOnTable: 'ai_decided' });
    const { persistPipelineRecords } = loadWithDb(db);
    await assert.rejects(
      () => persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_NONE),
      /DB_INSERT_FAILED: ai_decided/
    );
    restore();
  });

  it('throws when ai_generated insert fails (ai_detected + ai_decided rolled back)', async () => {
    const db = makeDb({ failOnTable: 'ai_generated' });
    const { persistPipelineRecords } = loadWithDb(db);
    await assert.rejects(
      () => persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_NONE),
      /DB_INSERT_FAILED: ai_generated/
    );
    restore();
  });
});

// ─── persistPipelineRecords — success path ────────────────────────────────────

describe('persistPipelineRecords — success path', () => {
  it('writes exactly three rows inside the transaction (detected, decided, generated)', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_NONE);
    assert.equal(db.calls.transactionCalls.length, 3);
    assert.ok(db.calls.transactionCalls.some(c => c.sql.includes('ai_detected')));
    assert.ok(db.calls.transactionCalls.some(c => c.sql.includes('ai_decided')));
    assert.ok(db.calls.transactionCalls.some(c => c.sql.includes('ai_generated')));
    restore();
  });

  it('keyword source insert goes through query() not the transaction client', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_KEYWORD);
    await settle(); // let fire-and-forget source inserts complete
    assert.ok(db.calls.query.some(c => c.sql.includes('KEYWORD_RISK')));
    assert.ok(!db.calls.transactionCalls.some(c => c.sql.includes('KEYWORD_RISK')));
    restore();
  });

  it('conversational fallback source persists _fallback=true in JSONB payload', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_FALLBACK);
    await settle();
    const convCall = db.calls.query.find(c => c.sql.includes('CONVERSATIONAL_STATE'));
    assert.ok(convCall, 'CONVERSATIONAL_STATE insert must be called');
    const payload = JSON.parse(convCall.params[4]);
    // _fallback=true distinguishes unavailable detector from genuine NONE_IDENTIFIED
    assert.equal(payload._fallback, true);
    restore();
  });

  it('flagged param is true when validation_status is FAILED', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    const failedGen = { ...GENERATED, validation_status: 'FAILED', violations: ['PROHIBITED_CONTENT'] };
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, failedGen, SOURCES_NONE);
    const genCall = db.calls.transactionCalls.find(c => c.sql.includes('ai_generated'));
    assert.ok(genCall, 'ai_generated insert must be called');
    // params[9] (10th param, 0-indexed) is the flagged boolean: validation_status !== 'PASSED'
    assert.equal(genCall.params[9], true);
    restore();
  });

  it('flagged param is false when validation_status is PASSED', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, GENERATED, SOURCES_NONE);
    const genCall = db.calls.transactionCalls.find(c => c.sql.includes('ai_generated'));
    assert.equal(genCall.params[9], false);
    restore();
  });

  it('flagged param is false when validation_status is SANITIZED', async () => {
    const db = makeDb();
    const { persistPipelineRecords } = loadWithDb(db);
    const sanitizedGen = { ...GENERATED, validation_status: 'SANITIZED' };
    await persistPipelineRecords(SESSION_ID, USER_ID, OBSERVED, DETECTED, DECIDED, sanitizedGen, SOURCES_NONE);
    const genCall = db.calls.transactionCalls.find(c => c.sql.includes('ai_generated'));
    assert.equal(genCall.params[9], false);
    restore();
  });
});

// ─── logPipelineEvents — event write failure ──────────────────────────────────

describe('logPipelineEvents — event write failure', () => {
  let capturedLogs = [];
  let originalError;

  before(() => {
    originalError = console.error;
    console.error = (...args) => capturedLogs.push(args.join(' '));
  });

  after(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    capturedLogs = [];
  });

  it('does not throw — event failure never surfaces to caller', () => {
    const db = makeDb({ queryFail: true });
    const { logPipelineEvents } = loadWithDb(db);
    assert.doesNotThrow(() => {
      logPipelineEvents(USER_ID, SESSION_ID, DETECTED, DECIDED, SOURCES_KEYWORD, 'NONE');
    });
    restore();
  });

  it('emits structured JSON log with level, msg, event_name, session_id, error', async () => {
    const db = makeDb({ queryFail: true });
    const { logPipelineEvents } = loadWithDb(db);
    logPipelineEvents(USER_ID, SESSION_ID, DETECTED, DECIDED, SOURCES_KEYWORD, 'NONE');
    await settle();

    assert.ok(capturedLogs.length > 0);
    const log = JSON.parse(capturedLogs[0]);
    assert.equal(log.level,   'error');
    assert.equal(log.msg,     'pipeline_event_write_failed');
    assert.equal(log.session_id, SESSION_ID);
    assert.ok(log.event_name, 'event_name must be present for alerting');
    assert.ok(log.error,      'error message must be present for diagnosis');
    restore();
  });
});

// ─── logPipelineEvents — fallback vs NONE_IDENTIFIED distinction ──────────────

describe('logPipelineEvents — detector-unavailable distinction', () => {
  it('emits DETECTION_FALLBACK_APPLIED when _fallback=true', async () => {
    const names = [];
    const db = { query: async (sql, params) => { names.push(params[1]); return { rows: [] }; }, transaction: async () => {} };
    const { logPipelineEvents } = loadWithDb(db);
    logPipelineEvents(USER_ID, SESSION_ID, DETECTED, DECIDED, SOURCES_FALLBACK, 'NONE');
    await settle();
    assert.ok(names.includes('DETECTION_FALLBACK_APPLIED'));
    restore();
  });

  it('does NOT emit DETECTION_FALLBACK_APPLIED for genuine detection (_fallback=false)', async () => {
    const sourcesReal = {
      keyword: null,
      conversational: { ...SOURCES_FALLBACK.conversational, _fallback: false, _fallback_reason: null },
    };
    const names = [];
    const db = { query: async (sql, params) => { names.push(params[1]); return { rows: [] }; }, transaction: async () => {} };
    const { logPipelineEvents } = loadWithDb(db);
    logPipelineEvents(USER_ID, SESSION_ID, DETECTED, DECIDED, sourcesReal, 'NONE');
    await settle();
    assert.ok(!names.includes('DETECTION_FALLBACK_APPLIED'));
    restore();
  });
});

// ─── logPipelineEvents — CRISIS_PATH_INVOKED ─────────────────────────────────

describe('logPipelineEvents — CRISIS_PATH_INVOKED', () => {
  it('emits CRISIS_PATH_INVOKED when strategy is CRISIS_RESPONSE', async () => {
    const crisisDecided = { ...DECIDED, strategy: 'CRISIS_RESPONSE', escalation_action: 'DETERMINISTIC_CRISIS' };
    const names = [];
    const db = { query: async (sql, params) => { names.push(params[1]); return { rows: [] }; }, transaction: async () => {} };
    const { logPipelineEvents } = loadWithDb(db);
    logPipelineEvents(USER_ID, SESSION_ID, DETECTED, crisisDecided, SOURCES_NONE, 'CRITICAL');
    await settle();
    assert.ok(names.includes('CRISIS_PATH_INVOKED'));
    assert.ok(names.includes('POLICY_DECISION'));
    restore();
  });

  it('does NOT emit CRISIS_PATH_INVOKED for non-crisis decisions', async () => {
    const names = [];
    const db = { query: async (sql, params) => { names.push(params[1]); return { rows: [] }; }, transaction: async () => {} };
    const { logPipelineEvents } = loadWithDb(db);
    logPipelineEvents(USER_ID, SESSION_ID, DETECTED, DECIDED, SOURCES_NONE, 'NONE');
    await settle();
    assert.ok(!names.includes('CRISIS_PATH_INVOKED'));
    restore();
  });
});
