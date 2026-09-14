'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { decide, URGENCY_UPSHIFT, NEED_TO_STRATEGY, MAX_RESPONSE_LENGTH } = require('./policyEngine');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROVENANCE = { source_type: 'SESSION_MESSAGE', id: '00000000-0000-0000-0000-000000000001' };
const DET_VER    = 'resolver@1.0.0';
const TS         = '2026-01-01T00:00:00.000Z';

function riskField(value, { uncertain = false, status = 'DETERMINISTIC' } = {}) {
  const deterministic = status === 'DETERMINISTIC';
  return {
    value,
    status,
    confidence_status: deterministic ? 'NOT_APPLICABLE' : 'AVAILABLE',
    confidence:        deterministic ? null : (uncertain ? 0.3 : 0.9),
    uncertainty_flag:  deterministic ? null : uncertain,
    provenance:        PROVENANCE,
    detector_version:  DET_VER,
    created_at:        TS,
  };
}

function inferredField(value, { uncertain = false } = {}) {
  return {
    value,
    status:            'INFERRED',
    confidence_status: 'AVAILABLE',
    confidence:        uncertain ? 0.3 : 0.9,
    uncertainty_flag:  uncertain,
    provenance:        PROVENANCE,
    detector_version:  DET_VER,
    created_at:        TS,
  };
}

function detected({
  risk       = 'ABSENT',
  riskUncertain = false,
  riskStatus = 'DETERMINISTIC',
  need       = 'NONE_IDENTIFIED',
  needUncertain = false,
  urgency    = 'NONE',
  urgencyUncertain = false,
} = {}) {
  return {
    detection_id:   '00000000-0000-0000-0000-000000000010',
    observed_ref:   '00000000-0000-0000-0000-000000000002',
    detector_id:    'resolver@1.0.0',
    detected_at:    TS,
    risk_signal:    riskField(risk, { uncertain: riskUncertain, status: riskStatus }),
    support_need:   inferredField(need, { uncertain: needUncertain }),
    urgency:        inferredField(urgency, { uncertain: urgencyUncertain }),
    expressed_emotion: null,
    reason_code:    'SINGLE_SIGNAL_DOMINANT',
    schema_version: '1.0.0',
  };
}

// ─── Rule R1: CRITICAL ───────────────────────────────────────────────────────

describe('R1 — CRITICAL risk', () => {
  it('produces CRISIS_RESPONSE and DETERMINISTIC_CRISIS', () => {
    const d = decide(detected({ risk: 'CRITICAL', riskStatus: 'DETERMINISTIC' }));
    assert.equal(d.strategy, 'CRISIS_RESPONSE');
    assert.equal(d.escalation_action, 'DETERMINISTIC_CRISIS');
    assert.equal(d.question_limit, 0);
    assert.equal(d.must_validate, true);
    assert.equal(d.may_suggest_exercises, false);
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED');
    assert.equal(d.max_response_length, MAX_RESPONSE_LENGTH.CRISIS_RESPONSE);
  });

  it('CRITICAL overrides SAFETY_ESCALATION support need', () => {
    const d = decide(detected({ risk: 'CRITICAL', riskStatus: 'DETERMINISTIC', need: 'SAFETY_ESCALATION' }));
    assert.equal(d.strategy, 'CRISIS_RESPONSE');
    assert.equal(d.escalation_action, 'DETERMINISTIC_CRISIS');
  });

  it('CRITICAL overrides urgency uncertainty (R7 does not apply)', () => {
    const d = decide(detected({ risk: 'CRITICAL', riskStatus: 'DETERMINISTIC', urgency: 'LOW', urgencyUncertain: true }));
    assert.equal(d.strategy, 'CRISIS_RESPONSE');
    assert.equal(d.escalation_action, 'DETERMINISTIC_CRISIS');
    assert.equal(d.effectiveUrgency, 'LOW'); // R7 not applied; already at highest precedence
  });

  it('upstream_uncertainty true when any field is uncertain at CRITICAL', () => {
    const d = decide(detected({ risk: 'CRITICAL', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.upstream_uncertainty, true);
  });
});

// ─── Rule R2: ELEVATED ───────────────────────────────────────────────────────

describe('R2 — ELEVATED risk', () => {
  it('produces VALIDATION_FOCUS and ESCALATE_TO_HUMAN', () => {
    const d = decide(detected({ risk: 'ELEVATED', riskStatus: 'DETERMINISTIC' }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'ESCALATE_TO_HUMAN');
    assert.equal(d.question_limit, 1);
    assert.equal(d.must_validate, true);
    assert.equal(d.may_suggest_exercises, false);
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED');
  });

  it('ELEVATED with risk uncertainty_flag=true does not reduce escalation', () => {
    const d = decide(detected({ risk: 'ELEVATED', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.escalation_action, 'ESCALATE_TO_HUMAN');
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED');
    assert.equal(d.upstream_uncertainty, true);
  });

  it('ELEVATED overrides support_need routing', () => {
    const d = decide(detected({ risk: 'ELEVATED', riskStatus: 'DETERMINISTIC', need: 'PSYCHOEDUCATION' }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'ESCALATE_TO_HUMAN');
  });
});

// ─── Rule R3: SAFETY_ESCALATION with ABSENT risk ─────────────────────────────

describe('R3 — SAFETY_ESCALATION support need with ABSENT risk', () => {
  it('produces SURFACE_RESOURCES; satisfies cross-record constraint', () => {
    const d = decide(detected({ risk: 'ABSENT', need: 'SAFETY_ESCALATION' }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES');
    assert.equal(d.question_limit, 1);
    assert.notEqual(d.escalation_action, 'NONE');
    assert.equal(d.reason_code, 'STRATEGY_BY_SUPPORT_NEED');
  });

  it('upstream_uncertainty reflects need.uncertainty_flag', () => {
    const d = decide(detected({ risk: 'ABSENT', need: 'SAFETY_ESCALATION', needUncertain: true }));
    assert.equal(d.upstream_uncertainty, true);
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES'); // escalation unchanged
  });
});

// ─── Rule R4: PRESENT risk ────────────────────────────────────────────────────

describe('R4 — PRESENT risk', () => {
  it('produces VALIDATION_FOCUS and SURFACE_RESOURCES', () => {
    const d = decide(detected({ risk: 'PRESENT', riskStatus: 'DETERMINISTIC' }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES');
    assert.equal(d.question_limit, 2);
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED');
  });

  it('PRESENT with uncertain risk still triggers R4 (not R5)', () => {
    const d = decide(detected({ risk: 'PRESENT', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES');
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED');
  });
});

// ─── Rule R5: ABSENT with uncertainty ────────────────────────────────────────

describe('R5 — ABSENT risk with uncertainty_flag', () => {
  it('treats uncertain ABSENT conservatively', () => {
    const d = decide(detected({ risk: 'ABSENT', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES');
    assert.equal(d.question_limit, 2);
    assert.equal(d.reason_code, 'UNCERTAINTY_CONSERVED');
    assert.equal(d.upstream_uncertainty, true);
  });
});

// ─── Rule R6: Support need routing ───────────────────────────────────────────

describe('R6 — support need routing (safe path)', () => {
  const safe = (need) => detected({ risk: 'ABSENT', need });

  it('EMOTIONAL_VALIDATION → VALIDATION_FOCUS', () => {
    const d = decide(safe('EMOTIONAL_VALIDATION'));
    assert.equal(d.strategy, 'VALIDATION_FOCUS');
    assert.equal(d.escalation_action, 'NONE');
    assert.equal(d.question_limit, 2);
    assert.equal(d.reason_code, 'STRATEGY_BY_SUPPORT_NEED');
  });

  it('PRACTICAL_GUIDANCE → OPEN_SUPPORT', () => {
    const d = decide(safe('PRACTICAL_GUIDANCE'));
    assert.equal(d.strategy, 'OPEN_SUPPORT');
    assert.equal(d.question_limit, 2);
    assert.equal(d.reason_code, 'STRATEGY_BY_SUPPORT_NEED');
  });

  it('PSYCHOEDUCATION → PSYCHOEDUCATION, question_limit 1', () => {
    const d = decide(safe('PSYCHOEDUCATION'));
    assert.equal(d.strategy, 'PSYCHOEDUCATION');
    assert.equal(d.question_limit, 1);
    assert.equal(d.reason_code, 'STRATEGY_BY_SUPPORT_NEED');
  });

  it('PEER_BRIDGE → OPEN_SUPPORT, question_limit 1', () => {
    const d = decide(safe('PEER_BRIDGE'));
    assert.equal(d.strategy, 'OPEN_SUPPORT');
    assert.equal(d.question_limit, 1);
  });

  it('CHECK_IN → OPEN_SUPPORT, question_limit 2', () => {
    const d = decide(safe('CHECK_IN'));
    assert.equal(d.strategy, 'OPEN_SUPPORT');
    assert.equal(d.question_limit, 2);
  });

  it('NONE_IDENTIFIED → OPEN_SUPPORT, DEFAULT_STRATEGY_APPLIED', () => {
    const d = decide(safe('NONE_IDENTIFIED'));
    assert.equal(d.strategy, 'OPEN_SUPPORT');
    assert.equal(d.escalation_action, 'NONE');
    assert.equal(d.reason_code, 'DEFAULT_STRATEGY_APPLIED');
  });

  it('max_response_length matches strategy', () => {
    const d = decide(safe('PSYCHOEDUCATION'));
    assert.equal(d.max_response_length, MAX_RESPONSE_LENGTH.PSYCHOEDUCATION);
  });

  it('upstream_uncertainty false when all fields certain', () => {
    const d = decide(safe('NONE_IDENTIFIED'));
    assert.equal(d.upstream_uncertainty, false);
  });
});

// ─── Rule R7: Urgency uncertainty conservation ───────────────────────────────

describe('R7 — urgency uncertainty conservation', () => {
  const safe = (need, urgency, urgencyUncertain) =>
    detected({ risk: 'ABSENT', need, urgency, urgencyUncertain });

  it('NONE urgency with uncertainty → effectiveUrgency = LOW', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'NONE', true));
    assert.equal(d.effectiveUrgency, URGENCY_UPSHIFT.NONE);
    assert.equal(d.effectiveUrgency, 'LOW');
    assert.equal(d.reason_code, 'UNCERTAINTY_CONSERVED');
  });

  it('LOW urgency with uncertainty → effectiveUrgency = MODERATE', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'LOW', true));
    assert.equal(d.effectiveUrgency, 'MODERATE');
  });

  it('MODERATE urgency with uncertainty → effectiveUrgency = HIGH', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'MODERATE', true));
    assert.equal(d.effectiveUrgency, 'HIGH');
  });

  it('HIGH urgency with uncertainty → effectiveUrgency = HIGH (no further escalation)', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'HIGH', true));
    assert.equal(d.effectiveUrgency, 'HIGH');
  });

  it('CRITICAL urgency with uncertainty → effectiveUrgency = CRITICAL', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'CRITICAL', true));
    assert.equal(d.effectiveUrgency, 'CRITICAL');
  });

  it('R7 does not fire when urgency is certain', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'MODERATE', false));
    assert.equal(d.effectiveUrgency, 'MODERATE');
    assert.equal(d.reason_code, 'DEFAULT_STRATEGY_APPLIED');
  });

  it('R7 sets upstream_uncertainty = true', () => {
    const d = decide(safe('NONE_IDENTIFIED', 'LOW', true));
    assert.equal(d.upstream_uncertainty, true);
  });

  it('R7 does not change strategy or escalation_action — only effectiveUrgency and reason_code', () => {
    const certain  = decide(safe('EMOTIONAL_VALIDATION', 'LOW', false));
    const uncertain = decide(safe('EMOTIONAL_VALIDATION', 'LOW', true));
    assert.equal(certain.strategy, uncertain.strategy);
    assert.equal(certain.escalation_action, uncertain.escalation_action);
    assert.notEqual(certain.reason_code, uncertain.reason_code);
  });

  it('R7 does not apply when R2 (ELEVATED) already fires', () => {
    const d = decide(detected({ risk: 'ELEVATED', riskStatus: 'DETERMINISTIC', urgency: 'LOW', urgencyUncertain: true }));
    assert.equal(d.escalation_action, 'ESCALATE_TO_HUMAN');
    assert.equal(d.effectiveUrgency, 'LOW'); // R7 not applied
  });
});

// ─── Precedence ordering ─────────────────────────────────────────────────────

describe('Rule precedence', () => {
  it('R1 beats R3 (CRITICAL beats SAFETY_ESCALATION+ABSENT)', () => {
    const d = decide(detected({ risk: 'CRITICAL', riskStatus: 'DETERMINISTIC', need: 'SAFETY_ESCALATION' }));
    assert.equal(d.strategy, 'CRISIS_RESPONSE');
    assert.equal(d.escalation_action, 'DETERMINISTIC_CRISIS');
  });

  it('R2 beats R6 (ELEVATED beats any support need)', () => {
    const d = decide(detected({ risk: 'ELEVATED', riskStatus: 'DETERMINISTIC', need: 'PSYCHOEDUCATION' }));
    assert.equal(d.escalation_action, 'ESCALATE_TO_HUMAN');
  });

  it('R4 beats R5 (PRESENT does not hit uncertain-ABSENT path)', () => {
    const d = decide(detected({ risk: 'PRESENT', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.reason_code, 'POLICY_ESCALATION_TRIGGERED'); // R4, not R5
  });

  it('R3 fires before R4 when need=SAFETY_ESCALATION and risk=ABSENT', () => {
    const d = decide(detected({ risk: 'ABSENT', need: 'SAFETY_ESCALATION' }));
    assert.equal(d.reason_code, 'STRATEGY_BY_SUPPORT_NEED'); // R3
    assert.equal(d.escalation_action, 'SURFACE_RESOURCES');
  });
});

// ─── Upstream uncertainty ─────────────────────────────────────────────────────

describe('upstream_uncertainty', () => {
  it('false when risk, urgency, and need all certain', () => {
    const d = decide(detected());
    assert.equal(d.upstream_uncertainty, false);
  });

  it('true when only urgency is uncertain', () => {
    const d = decide(detected({ urgencyUncertain: true }));
    assert.equal(d.upstream_uncertainty, true);
  });

  it('true when only support_need is uncertain', () => {
    const d = decide(detected({ needUncertain: true }));
    assert.equal(d.upstream_uncertainty, true);
  });

  it('true when only risk is uncertain (INFERRED)', () => {
    const d = decide(detected({ risk: 'ABSENT', riskStatus: 'INFERRED', riskUncertain: true }));
    assert.equal(d.upstream_uncertainty, true);
  });
});
