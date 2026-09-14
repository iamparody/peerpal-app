'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  UUID, SemVer, VersionPinnedId,
  ObservedSourceEnum, ExpressedEmotionEnum, SupportNeedEnum,
  UrgencyEnum, RiskSignalEnum, EscalationActionEnum, ValidationStatusEnum,
  ProvenanceSchema, DetectedField,
  ObservedSchema, RiskSignalSourceSchema, ConversationalStateSourceSchema,
  DetectedSchema, DecidedSchema, GeneratedSchema,
  validateCrossRecord, canDeliver,
} = require('./schemas');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ok(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Expected valid but got: ${JSON.stringify(result.error.issues)}`);
  }
}

function fail(schema, data) {
  const result = schema.safeParse(data);
  assert.equal(result.success, false, 'Expected validation to fail but it passed');
}

const NOW = new Date().toISOString();
const ID = '00000000-0000-4000-a000-000000000001';
const ID2 = '00000000-0000-4000-a000-000000000002';
const SEMVER = '1.0.0';
const PINNED = 'detector@1.0.0';

const baseProvenance = { source_type: 'SESSION_MESSAGE', id: ID };

function inferredField(valueEnum, value) {
  return {
    value,
    status: 'INFERRED',
    confidence_status: 'AVAILABLE',
    confidence: 0.85,
    uncertainty_flag: false,
    provenance: baseProvenance,
    detector_version: PINNED,
    created_at: NOW,
  };
}

function deterministicField(valueEnum, value) {
  return {
    value,
    status: 'DETERMINISTIC',
    confidence_status: 'NOT_APPLICABLE',
    confidence: null,
    uncertainty_flag: null,
    provenance: baseProvenance,
    detector_version: PINNED,
    created_at: NOW,
  };
}

// ─── Primitives ───────────────────────────────────────────────────────────────
describe('UUID', () => {
  test('accepts valid UUID v4', () => ok(UUID, ID));
  test('rejects plain string', () => fail(UUID, 'not-a-uuid'));
  test('rejects empty string', () => fail(UUID, ''));
});

describe('SemVer', () => {
  test('accepts 1.0.0', () => ok(SemVer, '1.0.0'));
  test('accepts 12.3.45', () => ok(SemVer, '12.3.45'));
  test('rejects v1.0.0 prefix', () => fail(SemVer, 'v1.0.0'));
  test('rejects 1.0', () => fail(SemVer, '1.0'));
  test('rejects text', () => fail(SemVer, 'latest'));
});

describe('VersionPinnedId', () => {
  test('accepts name@1.0.0', () => ok(VersionPinnedId, 'detector@1.0.0'));
  test('accepts path/name@1.0.0', () => ok(VersionPinnedId, 'groq/llama-3.3-70b@1.0.0'));
  test('rejects missing @', () => fail(VersionPinnedId, 'detector-1.0.0'));
  test('rejects @-only prefix', () => fail(VersionPinnedId, '@1.0.0'));
  test('rejects non-semver suffix', () => fail(VersionPinnedId, 'detector@latest'));
});

// ─── Enums ────────────────────────────────────────────────────────────────────
describe('Controlled enumerations', () => {
  test('RiskSignalEnum accepts ABSENT', () => ok(RiskSignalEnum, 'ABSENT'));
  test('RiskSignalEnum accepts CRITICAL', () => ok(RiskSignalEnum, 'CRITICAL'));
  test('RiskSignalEnum rejects unknown value', () => fail(RiskSignalEnum, 'UNKNOWN'));
  test('RiskSignalEnum rejects lowercase', () => fail(RiskSignalEnum, 'absent'));

  test('ExpressedEmotionEnum accepts DISTRESS', () => ok(ExpressedEmotionEnum, 'DISTRESS'));
  test('ExpressedEmotionEnum accepts MIXED', () => ok(ExpressedEmotionEnum, 'MIXED'));
  test('ExpressedEmotionEnum accepts UNCLEAR', () => ok(ExpressedEmotionEnum, 'UNCLEAR'));
  test('ExpressedEmotionEnum rejects HOPELESSNESS (prohibited clinical term)', () =>
    fail(ExpressedEmotionEnum, 'HOPELESSNESS'));

  test('SupportNeedEnum accepts SAFETY_ESCALATION', () =>
    ok(SupportNeedEnum, 'SAFETY_ESCALATION'));
  test('SupportNeedEnum accepts NONE_IDENTIFIED', () =>
    ok(SupportNeedEnum, 'NONE_IDENTIFIED'));
  test('SupportNeedEnum rejects unknown', () => fail(SupportNeedEnum, 'UNKNOWN_NEED'));

  test('EscalationActionEnum accepts DETERMINISTIC_CRISIS', () =>
    ok(EscalationActionEnum, 'DETERMINISTIC_CRISIS'));
  test('EscalationActionEnum rejects unknown', () => fail(EscalationActionEnum, 'ESCALATE'));
});

// ─── Provenance ───────────────────────────────────────────────────────────────
describe('ProvenanceSchema', () => {
  test('accepts valid provenance', () =>
    ok(ProvenanceSchema, { source_type: 'SESSION_MESSAGE', id: ID }));

  test('rejects free-form source_type', () =>
    fail(ProvenanceSchema, { source_type: 'CUSTOM_SOURCE', id: ID }));

  test('rejects missing id', () =>
    fail(ProvenanceSchema, { source_type: 'JOURNAL' }));

  test('rejects invalid UUID id', () =>
    fail(ProvenanceSchema, { source_type: 'JOURNAL', id: 'not-a-uuid' }));
});

// ─── DetectedField ────────────────────────────────────────────────────────────
describe('DetectedField', () => {
  const RiskField = DetectedField(RiskSignalEnum);

  test('accepts valid INFERRED field', () =>
    ok(RiskField, inferredField(RiskSignalEnum, 'ELEVATED')));

  test('accepts valid DETERMINISTIC field', () =>
    ok(RiskField, deterministicField(RiskSignalEnum, 'ABSENT')));

  test('requires confidence when confidence_status=AVAILABLE', () =>
    fail(RiskField, {
      ...inferredField(RiskSignalEnum, 'ELEVATED'),
      confidence: null,
    }));

  test('requires uncertainty_flag when confidence_status=AVAILABLE', () =>
    fail(RiskField, {
      ...inferredField(RiskSignalEnum, 'ELEVATED'),
      uncertainty_flag: null,
    }));

  test('rejects non-null confidence when confidence_status=NOT_APPLICABLE', () =>
    fail(RiskField, {
      ...deterministicField(RiskSignalEnum, 'ABSENT'),
      confidence: 0.9,
    }));

  test('rejects confidence > 1', () =>
    fail(RiskField, { ...inferredField(RiskSignalEnum, 'PRESENT'), confidence: 1.5 }));

  test('rejects confidence < 0', () =>
    fail(RiskField, { ...inferredField(RiskSignalEnum, 'PRESENT'), confidence: -0.1 }));

  test('rejects invalid enum value', () =>
    fail(RiskField, { ...inferredField(RiskSignalEnum, 'UNKNOWN') }));

  test('rejects missing provenance', () =>
    fail(RiskField, { ...inferredField(RiskSignalEnum, 'ABSENT'), provenance: undefined }));

  test('rejects free-form provenance source_type', () =>
    fail(RiskField, {
      ...inferredField(RiskSignalEnum, 'ABSENT'),
      provenance: { source_type: 'CUSTOM', id: ID },
    }));

  test('rejects unpinned detector_version', () =>
    fail(RiskField, {
      ...inferredField(RiskSignalEnum, 'ABSENT'),
      detector_version: 'detector-latest',
    }));
});

// ─── OBSERVED ─────────────────────────────────────────────────────────────────
describe('ObservedSchema', () => {
  const baseObserved = {
    record_id: ID,
    user_id: ID2,
    source: 'SESSION_MESSAGE',
    created_at: NOW,
    content_type: 'TEXT',
    content_ref: ID,
    schema_version: SEMVER,
  };

  test('accepts valid OBSERVED record', () => ok(ObservedSchema, baseObserved));
  test('accepts optional session_id', () =>
    ok(ObservedSchema, { ...baseObserved, session_id: ID2 }));
  test('accepts null session_id', () =>
    ok(ObservedSchema, { ...baseObserved, session_id: null }));
  test('rejects unknown source', () =>
    fail(ObservedSchema, { ...baseObserved, source: 'UNKNOWN_SOURCE' }));
  test('rejects missing content_ref', () =>
    fail(ObservedSchema, { ...baseObserved, content_ref: undefined }));
  test('rejects malformed schema_version', () =>
    fail(ObservedSchema, { ...baseObserved, schema_version: 'v1.0' }));
});

// ─── DETECTED_SOURCE ──────────────────────────────────────────────────────────
describe('RiskSignalSourceSchema', () => {
  const base = {
    source_id: ID,
    observed_ref: ID2,
    detector_version: PINNED,
    detected_at: NOW,
    risk_signal: deterministicField(RiskSignalEnum, 'ABSENT'),
  };

  test('accepts deterministic risk source', () => ok(RiskSignalSourceSchema, base));
  test('accepts inferred risk source', () =>
    ok(RiskSignalSourceSchema, {
      ...base,
      risk_signal: inferredField(RiskSignalEnum, 'ELEVATED'),
    }));
  test('rejects missing risk_signal', () =>
    fail(RiskSignalSourceSchema, { ...base, risk_signal: undefined }));
});

describe('ConversationalStateSourceSchema', () => {
  const base = {
    source_id: ID,
    observed_ref: ID2,
    detector_version: PINNED,
    detected_at: NOW,
    support_need: inferredField(SupportNeedEnum, 'EMOTIONAL_VALIDATION'),
    urgency: inferredField(UrgencyEnum, 'LOW'),
  };

  test('accepts valid conversational state source', () =>
    ok(ConversationalStateSourceSchema, base));
  test('accepts optional expressed_emotion', () =>
    ok(ConversationalStateSourceSchema, {
      ...base,
      expressed_emotion: inferredField(ExpressedEmotionEnum, 'SADNESS'),
    }));
  test('accepts absent expressed_emotion', () =>
    ok(ConversationalStateSourceSchema, { ...base, expressed_emotion: null }));
  test('rejects missing support_need', () =>
    fail(ConversationalStateSourceSchema, { ...base, support_need: undefined }));
  test('rejects missing urgency', () =>
    fail(ConversationalStateSourceSchema, { ...base, urgency: undefined }));
});

// ─── Canonical DETECTED ───────────────────────────────────────────────────────
describe('DetectedSchema', () => {
  const base = {
    detection_id: ID,
    observed_ref: ID2,
    detector_id: PINNED,
    detected_at: NOW,
    support_need: inferredField(SupportNeedEnum, 'EMOTIONAL_VALIDATION'),
    urgency: inferredField(UrgencyEnum, 'LOW'),
    risk_signal: deterministicField(RiskSignalEnum, 'ABSENT'),
    reason_code: 'NO_SIGNAL_DETECTED',
    schema_version: SEMVER,
  };

  test('accepts valid canonical DETECTED', () => ok(DetectedSchema, base));
  test('accepts with optional expressed_emotion', () =>
    ok(DetectedSchema, {
      ...base,
      expressed_emotion: inferredField(ExpressedEmotionEnum, 'DISTRESS'),
    }));
  test('accepts without expressed_emotion', () =>
    ok(DetectedSchema, base));
  test('accepts null expressed_emotion', () =>
    ok(DetectedSchema, { ...base, expressed_emotion: null }));
  test('rejects missing support_need', () =>
    fail(DetectedSchema, { ...base, support_need: undefined }));
  test('rejects missing urgency', () =>
    fail(DetectedSchema, { ...base, urgency: undefined }));
  test('rejects missing risk_signal', () =>
    fail(DetectedSchema, { ...base, risk_signal: undefined }));
  test('rejects unknown reason_code', () =>
    fail(DetectedSchema, { ...base, reason_code: 'MADE_UP_CODE' }));
});

// ─── DECIDED ──────────────────────────────────────────────────────────────────
describe('DecidedSchema', () => {
  const base = {
    decision_id: ID,
    detection_ref: ID2,
    policy_version: SEMVER,
    decided_at: NOW,
    upstream_uncertainty: false,
    strategy: 'VALIDATION_FOCUS',
    question_limit: 2,
    must_validate: true,
    may_suggest_exercises: false,
    max_response_length: 500,
    escalation_action: 'NONE',
    reason_code: 'STRATEGY_BY_SUPPORT_NEED',
    schema_version: SEMVER,
  };

  test('accepts valid DECIDED record', () => ok(DecidedSchema, base));
  test('accepts upstream_uncertainty=true', () =>
    ok(DecidedSchema, { ...base, upstream_uncertainty: true }));
  test('rejects question_limit > 5', () =>
    fail(DecidedSchema, { ...base, question_limit: 6 }));
  test('rejects question_limit < 0', () =>
    fail(DecidedSchema, { ...base, question_limit: -1 }));
  test('rejects max_response_length = 0', () =>
    fail(DecidedSchema, { ...base, max_response_length: 0 }));
  test('rejects unknown strategy', () =>
    fail(DecidedSchema, { ...base, strategy: 'EMPATHIZE' }));
  test('rejects unknown escalation_action', () =>
    fail(DecidedSchema, { ...base, escalation_action: 'CALL_HUMAN' }));
  test('rejects unknown reason_code', () =>
    fail(DecidedSchema, { ...base, reason_code: 'JUST_VIBES' }));
  test('rejects non-boolean must_validate', () =>
    fail(DecidedSchema, { ...base, must_validate: 'yes' }));
});

// ─── GENERATED ────────────────────────────────────────────────────────────────
describe('GeneratedSchema', () => {
  const base = {
    generation_id: ID,
    decision_ref: ID2,
    model_id: 'groq/llama-3.3-70b-versatile@1.0.0',
    generated_at: NOW,
    content: 'I hear you, and I want you to know that what you are feeling is valid.',
    validation_status: 'PASSED',
    violations: [],
    schema_version: SEMVER,
  };

  test('accepts valid PASSED GENERATED record', () => ok(GeneratedSchema, base));
  test('accepts SANITIZED with violations', () =>
    ok(GeneratedSchema, {
      ...base,
      validation_status: 'SANITIZED',
      violations: ['RESPONSE_LENGTH_EXCEEDED'],
    }));
  test('accepts FAILED with violations', () =>
    ok(GeneratedSchema, {
      ...base,
      validation_status: 'FAILED',
      violations: ['PROHIBITED_CONTENT'],
    }));
  test('rejects empty content', () =>
    fail(GeneratedSchema, { ...base, content: '' }));
  test('rejects unknown validation_status', () =>
    fail(GeneratedSchema, { ...base, validation_status: 'PENDING' }));
  test('rejects unknown violation code', () =>
    fail(GeneratedSchema, { ...base, violations: ['NOT_A_REAL_VIOLATION'] }));
  test('rejects unpinned model_id', () =>
    fail(GeneratedSchema, { ...base, model_id: 'llama-latest' }));
});

// ─── Cross-record constraints ─────────────────────────────────────────────────
describe('validateCrossRecord', () => {
  const baseDetected = {
    support_need: inferredField(SupportNeedEnum, 'EMOTIONAL_VALIDATION'),
    risk_signal: deterministicField(RiskSignalEnum, 'ABSENT'),
  };
  const baseDecided = {
    strategy: 'VALIDATION_FOCUS',
    escalation_action: 'NONE',
  };

  test('passes for normal interaction', () => {
    const errors = validateCrossRecord(baseDetected, baseDecided);
    assert.equal(errors.length, 0);
  });

  test('fails when SAFETY_ESCALATION support need but escalation_action=NONE', () => {
    const errors = validateCrossRecord(
      { ...baseDetected, support_need: inferredField(SupportNeedEnum, 'SAFETY_ESCALATION') },
      baseDecided
    );
    assert.ok(errors.length > 0, 'Expected cross-record violation');
    assert.ok(errors[0].includes('SAFETY_ESCALATION'));
  });

  test('passes when SAFETY_ESCALATION support need and escalation_action=SURFACE_RESOURCES', () => {
    const errors = validateCrossRecord(
      { ...baseDetected, support_need: inferredField(SupportNeedEnum, 'SAFETY_ESCALATION') },
      { ...baseDecided, escalation_action: 'SURFACE_RESOURCES' }
    );
    assert.equal(errors.length, 0);
  });

  test('fails when CRISIS_RESPONSE strategy but escalation_action not DETERMINISTIC_CRISIS', () => {
    const errors = validateCrossRecord(baseDetected, {
      strategy: 'CRISIS_RESPONSE',
      escalation_action: 'ESCALATE_TO_HUMAN',
    });
    assert.ok(errors.length > 0);
  });

  test('fails when DETERMINISTIC_CRISIS escalation but strategy not CRISIS_RESPONSE', () => {
    const errors = validateCrossRecord(baseDetected, {
      strategy: 'VALIDATION_FOCUS',
      escalation_action: 'DETERMINISTIC_CRISIS',
    });
    assert.ok(errors.length > 0);
  });

  test('passes for crisis: CRISIS_RESPONSE + DETERMINISTIC_CRISIS', () => {
    const errors = validateCrossRecord(baseDetected, {
      strategy: 'CRISIS_RESPONSE',
      escalation_action: 'DETERMINISTIC_CRISIS',
    });
    assert.equal(errors.length, 0);
  });
});

// ─── Delivery guard ───────────────────────────────────────────────────────────
describe('canDeliver', () => {
  test('allows PASSED', () => assert.ok(canDeliver({ validation_status: 'PASSED' })));
  test('allows SANITIZED', () => assert.ok(canDeliver({ validation_status: 'SANITIZED' })));
  test('blocks FAILED', () => assert.ok(!canDeliver({ validation_status: 'FAILED' })));
});
