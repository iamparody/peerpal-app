'use strict';

/**
 * End-to-end vertical slice tests.
 *
 * Tests the full pipeline from text input to GENERATED output.
 * No database required. Groq is not required — the conversational detector
 * fails gracefully to its deterministic fallback when GROQ_API_KEY is absent,
 * and CRISIS_RESPONSE generation uses the template (no LLM call).
 *
 * Test plan:
 *   1. CRITICAL keyword → CRISIS_RESPONSE → crisis template GENERATED
 *   2. ELEVATED keyword → VALIDATION_FOCUS + ESCALATE_TO_HUMAN (up to DECIDED)
 *   3. PRESENT keyword  → VALIDATION_FOCUS + SURFACE_RESOURCES (up to DECIDED)
 *   4. ABSENT keyword + fallback conversational → OPEN_SUPPORT + NONE (up to DECIDED)
 *   5. validateContent — pure constraint validation
 *   6. canDeliver — delivery guard
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const pipeline    = require('./pipeline');
const policyEngine = require('./policyEngine');
const generator    = require('./generator');
const { canDeliver } = require('./schemas');

// Minimal OBSERVED record — constructed in-memory, no DB required
const OBSERVED = {
  record_id:      'cccccccc-0000-0000-0000-000000000001',
  user_id:        'cccccccc-0000-0000-0000-000000000002',
  source:         'SESSION_MESSAGE',
  created_at:     '2026-01-01T00:00:00.000Z',
  session_id:     'cccccccc-0000-0000-0000-000000000003',
  content_type:   'TEXT',
  content_ref:    'cccccccc-0000-0000-0000-000000000004',
  schema_version: '1.0.0',
};

const SYSTEM_PROMPT = 'You are a mental health support companion.';

// ─── 1. CRITICAL path (fully deterministic — no Groq required) ───────────────

describe('Slice: CRITICAL keyword → CRISIS_RESPONSE → GENERATED', () => {
  let detected, decided, generated;

  before(async () => {
    ({ detected } = await pipeline.run('I want to kill myself', OBSERVED));
    decided   = policyEngine.buildDecided(detected);
    generated = await generator.generate(decided, {
      systemPrompt: SYSTEM_PROMPT, messages: [], userMessage: 'I want to kill myself',
    });
  });

  it('detected.risk_signal is CRITICAL DETERMINISTIC', () => {
    assert.equal(detected.risk_signal.value, 'CRITICAL');
    assert.equal(detected.risk_signal.status, 'DETERMINISTIC');
    assert.equal(detected.risk_signal.confidence, null);
    assert.equal(detected.risk_signal.uncertainty_flag, null);
  });

  it('canonical DETECTED has all required fields', () => {
    assert.match(detected.detection_id, /^[0-9a-f-]{36}$/);
    assert.equal(detected.observed_ref, OBSERVED.record_id);
    assert.ok(detected.detected_at);
    assert.ok(detected.support_need);
    assert.ok(detected.urgency);
    assert.ok(detected.reason_code);
    assert.equal(detected.schema_version, '1.0.0');
  });

  it('DECIDED strategy is CRISIS_RESPONSE', () => {
    assert.equal(decided.strategy, 'CRISIS_RESPONSE');
  });

  it('DECIDED escalation_action is DETERMINISTIC_CRISIS', () => {
    assert.equal(decided.escalation_action, 'DETERMINISTIC_CRISIS');
  });

  it('DECIDED question_limit is 0', () => {
    assert.equal(decided.question_limit, 0);
  });

  it('DECIDED must_validate is true', () => {
    assert.equal(decided.must_validate, true);
  });

  it('DECIDED may_suggest_exercises is false', () => {
    assert.equal(decided.may_suggest_exercises, false);
  });

  it('DECIDED reason_code is POLICY_ESCALATION_TRIGGERED', () => {
    assert.equal(decided.reason_code, 'POLICY_ESCALATION_TRIGGERED');
  });

  it('DECIDED detection_ref links to detected.detection_id', () => {
    assert.equal(decided.detection_ref, detected.detection_id);
  });

  it('GENERATED uses crisis template (LLM not invoked)', () => {
    assert.equal(generated.content, generator.CRISIS_TEMPLATE);
    assert.equal(generated.model_id, generator.CRISIS_TEMPLATE_VERSION);
  });

  it('GENERATED validation_status is PASSED', () => {
    assert.equal(generated.validation_status, 'PASSED');
  });

  it('GENERATED violations is empty', () => {
    assert.deepEqual(generated.violations, []);
  });

  it('GENERATED decision_ref links to decided.decision_id', () => {
    assert.equal(generated.decision_ref, decided.decision_id);
  });

  it('canDeliver is true for PASSED GENERATED', () => {
    assert.equal(canDeliver(generated), true);
  });

  it('cross-record constraint: CRISIS_RESPONSE ↔ DETERMINISTIC_CRISIS', () => {
    assert.equal(decided.strategy, 'CRISIS_RESPONSE');
    assert.equal(decided.escalation_action, 'DETERMINISTIC_CRISIS');
  });

  it('crisis template contains no questions (question_limit = 0 satisfied)', () => {
    const questionCount = (generator.CRISIS_TEMPLATE.match(/\?/g) || []).length;
    assert.equal(questionCount, 0);
  });
});

// ─── 2. ELEVATED path ─────────────────────────────────────────────────────────

describe('Slice: ELEVATED keyword → VALIDATION_FOCUS + ESCALATE_TO_HUMAN', () => {
  let detected, decided;

  before(async () => {
    ({ detected } = await pipeline.run("I can't cope anymore", OBSERVED));
    decided = policyEngine.buildDecided(detected);
  });

  it('detected.risk_signal is ELEVATED', () => {
    assert.equal(detected.risk_signal.value, 'ELEVATED');
    assert.equal(detected.risk_signal.status, 'DETERMINISTIC');
  });

  it('DECIDED strategy is VALIDATION_FOCUS', () => {
    assert.equal(decided.strategy, 'VALIDATION_FOCUS');
  });

  it('DECIDED escalation_action is ESCALATE_TO_HUMAN', () => {
    assert.equal(decided.escalation_action, 'ESCALATE_TO_HUMAN');
  });

  it('DECIDED question_limit is 1', () => {
    assert.equal(decided.question_limit, 1);
  });

  it('DECIDED may_suggest_exercises is false', () => {
    assert.equal(decided.may_suggest_exercises, false);
  });

  it('DECIDED reason_code is POLICY_ESCALATION_TRIGGERED', () => {
    assert.equal(decided.reason_code, 'POLICY_ESCALATION_TRIGGERED');
  });
});

// ─── 3. PRESENT path ──────────────────────────────────────────────────────────

describe('Slice: PRESENT keyword → VALIDATION_FOCUS + SURFACE_RESOURCES', () => {
  let detected, decided;

  before(async () => {
    ({ detected } = await pipeline.run('I feel hopeless today', OBSERVED));
    decided = policyEngine.buildDecided(detected);
  });

  it('detected.risk_signal is PRESENT', () => {
    assert.equal(detected.risk_signal.value, 'PRESENT');
  });

  it('DECIDED strategy is VALIDATION_FOCUS', () => {
    assert.equal(decided.strategy, 'VALIDATION_FOCUS');
  });

  it('DECIDED escalation_action is SURFACE_RESOURCES', () => {
    assert.equal(decided.escalation_action, 'SURFACE_RESOURCES');
  });

  it('DECIDED question_limit is 2', () => {
    assert.equal(decided.question_limit, 2);
  });
});

// ─── 4. Safe path (ABSENT + fallback conversational) ─────────────────────────

describe('Slice: ABSENT keyword + fallback conversational → OPEN_SUPPORT + NONE', () => {
  let detected, decided;

  before(async () => {
    ({ detected } = await pipeline.run('I had a nice walk today', OBSERVED));
    decided = policyEngine.buildDecided(detected);
  });

  it('detected.risk_signal is ABSENT', () => {
    assert.equal(detected.risk_signal.value, 'ABSENT');
  });

  it('DECIDED escalation_action is NONE', () => {
    assert.equal(decided.escalation_action, 'NONE');
  });

  it('DECIDED strategy is OPEN_SUPPORT (fallback: NONE_IDENTIFIED support need)', () => {
    assert.equal(decided.strategy, 'OPEN_SUPPORT');
  });

  it('DECIDED reason_code is DEFAULT_STRATEGY_APPLIED', () => {
    // Fallback conversational source produces NONE_IDENTIFIED which maps to DEFAULT_STRATEGY_APPLIED
    assert.equal(decided.reason_code, 'DEFAULT_STRATEGY_APPLIED');
  });

  it('DECIDED upstream_uncertainty is false (all fallback fields are DETERMINISTIC)', () => {
    assert.equal(decided.upstream_uncertainty, false);
  });
});

// ─── 5. Constraint validation (pure — no I/O) ─────────────────────────────────

describe('generator.validateContent', () => {
  const base = { max_response_length: 400, question_limit: 2, may_suggest_exercises: false };

  it('clean content → no violations', () => {
    const v = generator.validateContent('I hear you. That sounds really hard.', base);
    assert.deepEqual(v, []);
  });

  it('content at exact limit → no violation', () => {
    const v = generator.validateContent('a'.repeat(400), base);
    assert.deepEqual(v, []);
  });

  it('content one char over limit → RESPONSE_LENGTH_EXCEEDED', () => {
    const v = generator.validateContent('a'.repeat(401), base);
    assert.ok(v.includes('RESPONSE_LENGTH_EXCEEDED'));
  });

  it('question count at limit → no violation', () => {
    const v = generator.validateContent('How are you? What happened?', base);
    assert.deepEqual(v, []);
  });

  it('question count over limit → QUESTION_LIMIT_EXCEEDED', () => {
    const v = generator.validateContent('How are you? What happened? Are you okay?', base);
    assert.ok(v.includes('QUESTION_LIMIT_EXCEEDED'));
  });

  it('question_limit = 0, one question → QUESTION_LIMIT_EXCEEDED', () => {
    const v = generator.validateContent('How are you?', { ...base, question_limit: 0 });
    assert.ok(v.includes('QUESTION_LIMIT_EXCEEDED'));
  });

  it('exercise mention when prohibited → EXERCISE_NOT_PERMITTED', () => {
    const v = generator.validateContent('Try this breathing exercise.', base);
    assert.ok(v.includes('EXERCISE_NOT_PERMITTED'));
  });

  it('exercise mention when permitted → no EXERCISE_NOT_PERMITTED', () => {
    const v = generator.validateContent('Try this breathing exercise.', { ...base, may_suggest_exercises: true });
    assert.ok(!v.includes('EXERCISE_NOT_PERMITTED'));
  });

  it('crisis template passes validation at CRISIS_RESPONSE constraints', () => {
    const crisisConstraints = { max_response_length: 400, question_limit: 0, may_suggest_exercises: false };
    const v = generator.validateContent(generator.CRISIS_TEMPLATE, crisisConstraints);
    assert.deepEqual(v, []);
  });

  it('multiple violation types collected together', () => {
    const content = 'a'.repeat(401) + ' How are you? Also try this breathing exercise.';
    const v = generator.validateContent(content, base);
    assert.ok(v.includes('RESPONSE_LENGTH_EXCEEDED'));
    assert.ok(v.includes('EXERCISE_NOT_PERMITTED'));
  });
});

// ─── 6. canDeliver ────────────────────────────────────────────────────────────

describe('canDeliver', () => {
  const base = {
    generation_id: 'eeeeeeee-0000-0000-0000-000000000001',
    decision_ref:  'eeeeeeee-0000-0000-0000-000000000002',
    model_id:      'groq/test@1.0.0',
    generated_at:  '2026-01-01T00:00:00.000Z',
    content:       'Hello.',
    violations:    [],
    schema_version: '1.0.0',
  };

  it('PASSED → deliverable', () => assert.equal(canDeliver({ ...base, validation_status: 'PASSED' }), true));
  it('SANITIZED → deliverable', () => assert.equal(canDeliver({ ...base, validation_status: 'SANITIZED' }), true));
  it('FAILED → not deliverable', () => assert.equal(canDeliver({ ...base, validation_status: 'FAILED' }), false));
});
