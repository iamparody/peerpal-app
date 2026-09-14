'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolve, DETECTOR_VERSION } = require('./resolver');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OBSERVED = {
  record_id:     '00000000-0000-0000-0000-000000000010',
  user_id:       '00000000-0000-0000-0000-000000000011',
  source:        'SESSION_MESSAGE',
  created_at:    '2026-01-01T00:00:00.000Z',
  session_id:    '00000000-0000-0000-0000-000000000012',
  content_type:  'TEXT',
  content_ref:   '00000000-0000-0000-0000-000000000013',
  schema_version: '1.0.0',
};

const PROV = { source_type: 'SESSION_MESSAGE', id: OBSERVED.record_id };

function riskSource(value, { status = 'DETERMINISTIC', confidence = null, uncertaintyFlag = null } = {}) {
  const det = status === 'DETERMINISTIC';
  return {
    source_id:        '00000000-0000-0000-0000-000000000020',
    observed_ref:     OBSERVED.record_id,
    detector_version: 'test-classifier@1.0.0',
    detected_at:      '2026-01-01T00:00:00.000Z',
    risk_signal: {
      value,
      status,
      confidence_status: det ? 'NOT_APPLICABLE' : 'AVAILABLE',
      confidence:        det ? null : confidence,
      uncertainty_flag:  det ? null : uncertaintyFlag,
      provenance:        PROV,
      detector_version:  'test-classifier@1.0.0',
      created_at:        '2026-01-01T00:00:00.000Z',
    },
  };
}

function convSource({ need = 'NONE_IDENTIFIED', urgency = 'NONE', emotion = null, fallback = false, needConf = 0.9, urgConf = 0.9 } = {}) {
  if (fallback) return { _fallback: true, _fallback_reason: 'TEST_FALLBACK' };
  const now  = '2026-01-01T00:00:00.000Z';
  const mkField = (value, confidence) => ({
    value,
    status: 'INFERRED', confidence_status: 'AVAILABLE',
    confidence, uncertainty_flag: confidence < 0.60,
    provenance: PROV, detector_version: 'conv-detector@1.0.0', created_at: now,
  });
  return {
    source_id: '00000000-0000-0000-0000-000000000030',
    observed_ref: OBSERVED.record_id,
    detector_version: 'conv-detector@1.0.0',
    detected_at: now,
    support_need: mkField(need, needConf),
    urgency:      mkField(urgency, urgConf),
    expressed_emotion: emotion
      ? mkField(emotion, 0.85)
      : null,
    _fallback: false,
  };
}

// ─── Risk signal resolution (R_S1, R_S2, R_S3) ───────────────────────────────

describe('resolver — both risk sources null (fail-closed)', () => {
  it('produces ELEVATED when both keyword and contextual sources are null', () => {
    const d = resolve({ keywordSource: null, contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.status, 'DETERMINISTIC');
    assert.equal(d.risk_signal.confidence, null);
    assert.equal(d.risk_signal.uncertainty_flag, null);
  });

  it('reason_code is NO_SIGNAL_DETECTED on fail-closed path', () => {
    const d = resolve({ keywordSource: null, contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.reason_code, 'NO_SIGNAL_DETECTED');
  });
});

describe('resolver — single risk source (Section 3.5.1 failure handling)', () => {
  it('keyword only — uses keyword result directly', () => {
    const d = resolve({ keywordSource: riskSource('CRITICAL'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.risk_signal.value, 'CRITICAL');
    assert.equal(d.risk_signal.status, 'DETERMINISTIC');
  });

  it('contextual only — uses contextual result directly', () => {
    const ctx = riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.85, uncertaintyFlag: false });
    const d = resolve({ keywordSource: null, contextualSource: ctx, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.status, 'INFERRED');
  });

  it('reason_code SINGLE_SIGNAL_DOMINANT when only keyword available (no signal)', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    // ABSENT → NO_SIGNAL_DETECTED
    assert.equal(d.reason_code, 'NO_SIGNAL_DETECTED');
  });
});

describe('resolver — R_S1: any source CRITICAL', () => {
  it('keyword CRITICAL → DETERMINISTIC CRITICAL', () => {
    const d = resolve({
      keywordSource: riskSource('CRITICAL'),
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'CRITICAL');
    assert.equal(d.risk_signal.status, 'DETERMINISTIC');
    assert.equal(d.risk_signal.confidence_status, 'NOT_APPLICABLE');
    assert.equal(d.risk_signal.confidence, null);
  });

  it('contextual CRITICAL only → INFERRED CRITICAL with inherited confidence', () => {
    const ctx = riskSource('CRITICAL', { status: 'INFERRED', confidence: 0.92, uncertaintyFlag: false });
    const d = resolve({
      keywordSource: riskSource('ABSENT'),
      contextualSource: ctx,
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'CRITICAL');
    assert.equal(d.risk_signal.status, 'INFERRED');
    assert.equal(d.risk_signal.confidence, 0.92);
    assert.equal(d.risk_signal.uncertainty_flag, false);
  });

  it('CRITICAL reason_code is KEYWORD_RISK_MATCH when keyword triggers it', () => {
    const d = resolve({
      keywordSource: riskSource('CRITICAL'),
      contextualSource: null,
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.reason_code, 'KEYWORD_RISK_MATCH');
  });
});

describe('resolver — R_S2/R_S3: severity-first with status determination', () => {
  it('keyword higher → DETERMINISTIC at keyword level', () => {
    const d = resolve({
      keywordSource:    riskSource('ELEVATED'),
      contextualSource: riskSource('PRESENT', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.status, 'DETERMINISTIC');
    assert.equal(d.risk_signal.confidence, null);
  });

  it('contextual higher → INFERRED at contextual level with inherited confidence', () => {
    const d = resolve({
      keywordSource:    riskSource('PRESENT'),
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.88, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.status, 'INFERRED');
    assert.equal(d.risk_signal.confidence, 0.88);
  });

  it('same level from both sources → DETERMINISTIC (keyword confirmation)', () => {
    const d = resolve({
      keywordSource:    riskSource('ELEVATED'),
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.status, 'DETERMINISTIC');
    assert.equal(d.risk_signal.confidence, null);
  });

  it('uncertainty_flag inherited from contextual when contextual wins', () => {
    const d = resolve({
      keywordSource:    riskSource('PRESENT'),
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.50, uncertaintyFlag: true }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.value, 'ELEVATED');
    assert.equal(d.risk_signal.uncertainty_flag, true);
  });

  it('DETERMINISTIC result has null uncertainty_flag', () => {
    const d = resolve({
      keywordSource:    riskSource('ELEVATED'),
      contextualSource: riskSource('PRESENT', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.risk_signal.uncertainty_flag, null);
  });
});

describe('resolver — reason_code derivation', () => {
  it('KEYWORD_RISK_MATCH when keyword produces non-ABSENT and wins', () => {
    const d = resolve({ keywordSource: riskSource('PRESENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.reason_code, 'KEYWORD_RISK_MATCH');
  });

  it('CONFLICTING_SIGNALS when keyword and contextual disagree on level', () => {
    const d = resolve({
      keywordSource:    riskSource('PRESENT'),
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.reason_code, 'CONFLICTING_SIGNALS');
  });

  it('HIGH_CONFIDENCE_DETECTION when contextual only produces signal above threshold', () => {
    const d = resolve({
      keywordSource: null,
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.reason_code, 'HIGH_CONFIDENCE_DETECTION');
  });

  it('LOW_CONFIDENCE_DETECTION when contextual only produces signal below threshold', () => {
    const d = resolve({
      keywordSource: null,
      contextualSource: riskSource('ELEVATED', { status: 'INFERRED', confidence: 0.50, uncertaintyFlag: true }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.reason_code, 'LOW_CONFIDENCE_DETECTION');
  });

  it('NO_SIGNAL_DETECTED when both sources return ABSENT', () => {
    const d = resolve({
      keywordSource: riskSource('ABSENT'),
      contextualSource: riskSource('ABSENT', { status: 'INFERRED', confidence: 0.9, uncertaintyFlag: false }),
      conversationalSource: null, observed: OBSERVED,
    });
    assert.equal(d.reason_code, 'NO_SIGNAL_DETECTED');
  });
});

describe('resolver — conversational source assembly', () => {
  it('uses conversational source fields when present', () => {
    const conv = convSource({ need: 'EMOTIONAL_VALIDATION', urgency: 'MODERATE', emotion: 'DISTRESS' });
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: conv, observed: OBSERVED });
    assert.equal(d.support_need.value, 'EMOTIONAL_VALIDATION');
    assert.equal(d.urgency.value, 'MODERATE');
    assert.equal(d.expressed_emotion?.value, 'DISTRESS');
  });

  it('applies conversational fallback when source is null', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.support_need.value, 'NONE_IDENTIFIED');
    assert.equal(d.urgency.value, 'NONE');
    assert.equal(d.expressed_emotion, null);
  });

  it('applies conversational fallback when _fallback=true', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: convSource({ fallback: true }), observed: OBSERVED });
    assert.equal(d.support_need.value, 'NONE_IDENTIFIED');
    assert.equal(d.support_need.status, 'DETERMINISTIC');
    assert.equal(d.urgency.value, 'NONE');
  });

  it('fallback support_need status is DETERMINISTIC, confidence null', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.support_need.status, 'DETERMINISTIC');
    assert.equal(d.support_need.confidence, null);
    assert.equal(d.support_need.confidence_status, 'NOT_APPLICABLE');
    assert.equal(d.support_need.uncertainty_flag, null);
  });

  it('expressed_emotion null when conv source has no emotion', () => {
    const conv = convSource({ need: 'CHECK_IN', urgency: 'NONE', emotion: null });
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: conv, observed: OBSERVED });
    assert.equal(d.expressed_emotion, null);
  });
});

describe('resolver — canonical DETECTED structure', () => {
  it('result has all required top-level fields', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.ok(d.detection_id);
    assert.equal(d.observed_ref, OBSERVED.record_id);
    assert.equal(d.detector_id, DETECTOR_VERSION);
    assert.ok(d.detected_at);
    assert.ok(d.risk_signal);
    assert.ok(d.support_need);
    assert.ok(d.urgency);
    assert.ok(d.reason_code);
    assert.equal(d.schema_version, '1.0.0');
  });

  it('resolver detector_id matches DETECTOR_VERSION export', () => {
    const d = resolve({ keywordSource: riskSource('ABSENT'), contextualSource: null, conversationalSource: null, observed: OBSERVED });
    assert.equal(d.detector_id, DETECTOR_VERSION);
  });
});
