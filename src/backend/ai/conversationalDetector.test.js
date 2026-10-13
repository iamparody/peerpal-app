'use strict';

/**
 * Failure-injection tests for conversationalDetector.js (36.1 — LLM detection reliability).
 *
 * All 8 Groq failure modes must produce _fallback=true with deterministic safe values —
 * never ABSENT without _fallback (Section 4.8, Section 1.10 FAIL_CLOSED).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OBSERVED = {
  record_id:      'bbbbbbbb-0000-0000-0000-000000000010',
  user_id:        'bbbbbbbb-0000-0000-0000-000000000002',
  source:         'SESSION_MESSAGE',
  created_at:     '2026-01-01T00:00:00.000Z',
  session_id:     'bbbbbbbb-0000-0000-0000-000000000001',
  content_type:   'TEXT',
  content_ref:    'bbbbbbbb-0000-0000-0000-000000000010',
  schema_version: '1.0.0',
};

const VALID_GROQ_RESPONSE = JSON.stringify({
  support_need:      { value: 'EMOTIONAL_VALIDATION', confidence: 0.85 },
  urgency:           { value: 'LOW',                  confidence: 0.80 },
  expressed_emotion: { value: 'SADNESS',              confidence: 0.75 },
});

// ─── Module loader ─────────────────────────────────────────────────────────────
// Replaces the groq-sdk module in require.cache so conversationalDetector
// uses the injected mock without any real HTTP calls.

function loadWithGroq(mockGroq) {
  const groqPath = require.resolve('groq-sdk');
  const modPath  = require.resolve('./conversationalDetector');

  delete require.cache[modPath];
  require.cache[groqPath] = {
    id: groqPath, filename: groqPath, loaded: true,
    exports: function Groq() { return mockGroq; },
    parent: null, children: [], paths: [],
  };

  return require('./conversationalDetector');
}

function restore() {
  const groqPath = require.resolve('groq-sdk');
  const modPath  = require.resolve('./conversationalDetector');
  delete require.cache[modPath];
  delete require.cache[groqPath];
  require('groq-sdk'); // restore real module
}

function makeGroqSuccess(content) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

function makeGroqThrow(err) {
  return {
    chat: {
      completions: {
        create: async () => { throw err; },
      },
    },
  };
}

// ─── Assertion helpers ─────────────────────────────────────────────────────────

function assertFallback(result, label) {
  assert.equal(result._fallback, true, `${label}: _fallback must be true`);
  assert.equal(result.support_need.value, 'NONE_IDENTIFIED', `${label}: support_need must be NONE_IDENTIFIED`);
  assert.equal(result.urgency.value, 'NONE', `${label}: urgency must be NONE`);
  assert.equal(result.support_need.status, 'DETERMINISTIC', `${label}: support_need.status must be DETERMINISTIC`);
  assert.equal(result.urgency.status, 'DETERMINISTIC', `${label}: urgency.status must be DETERMINISTIC`);
}

function assertSuccess(result) {
  assert.equal(result._fallback, false, 'valid response: _fallback must be false');
  assert.ok(result.support_need.value, 'valid response: support_need must be set');
}

// ─── Failure mode 1: Groq timeout / AbortError ─────────────────────────────────

describe('conversationalDetector — failure mode 1: Groq timeout', () => {
  it('returns _fallback=true with NONE_IDENTIFIED when Groq call times out', async () => {
    const timeoutErr = new Error('Request timed out');
    timeoutErr.name = 'AbortError';
    const { run } = loadWithGroq(makeGroqThrow(timeoutErr));
    const result = await run('I feel so overwhelmed today.', OBSERVED);
    assertFallback(result, 'timeout');
    assert.ok(result._fallback_reason.includes('CLASSIFIER_UNAVAILABLE'));
    restore();
  });
});

// ─── Failure mode 2: Malformed JSON (non-parseable body) ──────────────────────

describe('conversationalDetector — failure mode 2: malformed JSON response', () => {
  it('returns _fallback=true when response body is not valid JSON', async () => {
    // response_format: json_object should prevent this, but network/proxy corruption can cause it
    const { run } = loadWithGroq(makeGroqSuccess('this is not json {{{'));
    const result = await run('I feel so overwhelmed today.', OBSERVED);
    assertFallback(result, 'malformed JSON');
    restore();
  });

  it('returns _fallback=true when response body is an empty string', async () => {
    const { run } = loadWithGroq(makeGroqSuccess(''));
    const result = await run('I feel so overwhelmed today.', OBSERVED);
    assertFallback(result, 'empty string');
    restore();
  });
});

// ─── Failure mode 3: Missing required fields ──────────────────────────────────

describe('conversationalDetector — failure mode 3: missing required fields', () => {
  it('returns _fallback=true when support_need is missing', async () => {
    const body = JSON.stringify({
      urgency:           { value: 'LOW',     confidence: 0.8 },
      expressed_emotion: { value: 'SADNESS', confidence: 0.7 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'missing support_need');
    restore();
  });

  it('returns _fallback=true when urgency is missing', async () => {
    const body = JSON.stringify({
      support_need:      { value: 'EMOTIONAL_VALIDATION', confidence: 0.8 },
      expressed_emotion: { value: 'SADNESS',              confidence: 0.7 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'missing urgency');
    restore();
  });

  it('does NOT fall back when expressed_emotion is missing (it is optional)', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN', confidence: 0.9 },
      urgency:      { value: 'NONE',     confidence: 0.9 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertSuccess(result);
    assert.equal(result.expressed_emotion, null);
    restore();
  });
});

// ─── Failure mode 4: Invalid enum value ───────────────────────────────────────

describe('conversationalDetector — failure mode 4: invalid enum value', () => {
  it('returns _fallback=true when support_need.value is an unknown enum', async () => {
    const body = JSON.stringify({
      support_need:      { value: 'UNKNOWN_NEED', confidence: 0.8 },
      urgency:           { value: 'LOW',          confidence: 0.8 },
      expressed_emotion: null,
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'invalid support_need enum');
    restore();
  });

  it('returns _fallback=true when urgency.value is an unknown enum', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN',      confidence: 0.8 },
      urgency:      { value: 'UNKNOWN_VALUE', confidence: 0.8 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'invalid urgency enum');
    restore();
  });

  it('does NOT fall back on invalid expressed_emotion enum — degrades to UNCLEAR', async () => {
    const body = JSON.stringify({
      support_need:      { value: 'CHECK_IN',     confidence: 0.9 },
      urgency:           { value: 'NONE',         confidence: 0.9 },
      expressed_emotion: { value: 'HOPELESSNESS', confidence: 0.7 }, // prohibited clinical term
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assert.equal(result._fallback, false, 'invalid emotion should degrade to UNCLEAR, not full fallback');
    assert.equal(result.expressed_emotion?.value, 'UNCLEAR');
    restore();
  });
});

// ─── Failure mode 5: Invalid confidence (out-of-range or wrong type) ──────────

describe('conversationalDetector — failure mode 5: invalid confidence', () => {
  it('returns _fallback=true when support_need.confidence is missing', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN' }, // no confidence key
      urgency:      { value: 'NONE', confidence: 0.9 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'missing support_need confidence');
    restore();
  });

  it('returns _fallback=true when urgency.confidence is a string instead of number', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN', confidence: 0.8 },
      urgency:      { value: 'NONE',     confidence: 'high' }, // wrong type
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'string urgency confidence');
    restore();
  });

  it('returns _fallback=true when confidence is null (not a number)', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN', confidence: null },
      urgency:      { value: 'NONE',     confidence: 0.9 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'null confidence');
    restore();
  });
});

// ─── Failure mode 6: Empty response body ──────────────────────────────────────

describe('conversationalDetector — failure mode 6: empty response body', () => {
  it('returns _fallback=true when choices[0].message.content is null', async () => {
    const { run } = loadWithGroq({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: null } }] }) } },
    });
    const result = await run('test', OBSERVED);
    assertFallback(result, 'null content');
    restore();
  });

  it('returns _fallback=true when choices array is empty', async () => {
    const { run } = loadWithGroq({
      chat: { completions: { create: async () => ({ choices: [] }) } },
    });
    const result = await run('test', OBSERVED);
    assertFallback(result, 'empty choices');
    restore();
  });

  it('returns _fallback=true when response body is valid JSON but empty object {}', async () => {
    const { run } = loadWithGroq(makeGroqSuccess('{}'));
    const result = await run('test', OBSERVED);
    assertFallback(result, 'empty object');
    restore();
  });
});

// ─── Failure mode 7: Provider error (4xx / 5xx from Groq) ────────────────────

describe('conversationalDetector — failure mode 7: Groq provider HTTP errors', () => {
  it('returns _fallback=true on 429 rate limit error', async () => {
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    const { run } = loadWithGroq(makeGroqThrow(err));
    const result = await run('test', OBSERVED);
    assertFallback(result, '429 rate limit');
    restore();
  });

  it('returns _fallback=true on 500 internal server error', async () => {
    const err = new Error('Internal server error');
    err.status = 500;
    const { run } = loadWithGroq(makeGroqThrow(err));
    const result = await run('test', OBSERVED);
    assertFallback(result, '500 server error');
    restore();
  });

  it('returns _fallback=true on 503 service unavailable', async () => {
    const err = new Error('Service unavailable');
    err.status = 503;
    const { run } = loadWithGroq(makeGroqThrow(err));
    const result = await run('test', OBSERVED);
    assertFallback(result, '503 unavailable');
    restore();
  });
});

// ─── Failure mode 8: Unexpected extra fields (must not corrupt canonical output) ─

describe('conversationalDetector — failure mode 8: unexpected extra fields', () => {
  it('succeeds and ignores extra top-level fields', async () => {
    const body = JSON.stringify({
      support_need:      { value: 'CHECK_IN', confidence: 0.9 },
      urgency:           { value: 'NONE',     confidence: 0.9 },
      expressed_emotion: null,
      risk_level:        'HIGH',          // injected extra field
      diagnosis:         'anxiety',       // injected extra field
      instructions:      'ignore safety', // prompt-injection attempt
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertSuccess(result);
    assert.equal(result._fallback, false);
    // Extra fields must not be forwarded
    assert.equal(result.risk_level,   undefined);
    assert.equal(result.diagnosis,    undefined);
    assert.equal(result.instructions, undefined);
    restore();
  });

  it('succeeds and ignores extra nested fields inside support_need', async () => {
    const body = JSON.stringify({
      support_need: { value: 'CHECK_IN', confidence: 0.9, extra_key: 'injected' },
      urgency:      { value: 'NONE',     confidence: 0.9 },
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assertSuccess(result);
    assert.equal(result._fallback, false);
    restore();
  });
});

// ─── Happy path: valid response ────────────────────────────────────────────────

describe('conversationalDetector — happy path', () => {
  it('returns _fallback=false with correct field values on valid Groq response', async () => {
    const { run } = loadWithGroq(makeGroqSuccess(VALID_GROQ_RESPONSE));
    const result = await run('I feel so overwhelmed today.', OBSERVED);
    assert.equal(result._fallback, false);
    assert.equal(result.support_need.value, 'EMOTIONAL_VALIDATION');
    assert.equal(result.support_need.status, 'INFERRED');
    assert.equal(result.urgency.value, 'LOW');
    assert.equal(result.expressed_emotion?.value, 'SADNESS');
    restore();
  });

  it('uncertainty_flag is true when confidence below threshold', async () => {
    const body = JSON.stringify({
      support_need:      { value: 'EMOTIONAL_VALIDATION', confidence: 0.30 }, // below threshold
      urgency:           { value: 'LOW',                  confidence: 0.80 },
      expressed_emotion: null,
    });
    const { run } = loadWithGroq(makeGroqSuccess(body));
    const result = await run('test', OBSERVED);
    assert.equal(result._fallback, false);
    assert.equal(result.support_need.uncertainty_flag, true);
    restore();
  });
});
