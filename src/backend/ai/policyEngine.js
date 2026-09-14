'use strict';

const { v4: uuidv4 } = require('uuid');
const { DecidedSchema } = require('./schemas');

const POLICY_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

// Policy parameters — changes require DUAL_REVIEW (Section 3.1)
const MAX_RESPONSE_LENGTH = {
  CRISIS_RESPONSE:  400, // sized for crisis template (~280 chars); template is fixed, not LLM-generated
  SAFETY_HOLD:      150,
  VALIDATION_FOCUS: 400,
  OPEN_SUPPORT:     600,
  PSYCHOEDUCATION:  800,
  GUIDED_EXERCISE:  600,
};

// R7: urgency upshift table. HIGH and CRITICAL do not escalate further —
// risk_signal rules already cover those levels.
const URGENCY_UPSHIFT = {
  NONE:     'LOW',
  LOW:      'MODERATE',
  MODERATE: 'HIGH',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
};

// R6: Support need → strategy mapping (Section 3.7 table)
// CHECK_IN exercise eligibility is owned by Section 7; may_suggest_exercises = false here.
const NEED_TO_STRATEGY = {
  EMOTIONAL_VALIDATION: { strategy: 'VALIDATION_FOCUS', question_limit: 2, may_suggest_exercises: false },
  PRACTICAL_GUIDANCE:   { strategy: 'OPEN_SUPPORT',     question_limit: 2, may_suggest_exercises: false },
  PSYCHOEDUCATION:      { strategy: 'PSYCHOEDUCATION',  question_limit: 1, may_suggest_exercises: false },
  PEER_BRIDGE:          { strategy: 'OPEN_SUPPORT',     question_limit: 1, may_suggest_exercises: false },
  CHECK_IN:             { strategy: 'OPEN_SUPPORT',     question_limit: 2, may_suggest_exercises: false },
  NONE_IDENTIFIED:      { strategy: 'OPEN_SUPPORT',     question_limit: 2, may_suggest_exercises: false },
};

/**
 * Pure policy decision function. Implements Section 3 rules R1–R7 in precedence order.
 *
 * Input: validated canonical DETECTED record (DetectedSchema).
 * Returns policy fields for DECIDED, plus `effectiveUrgency` (R7 internal; log in
 * POLICY_DECISION event; strip before writing DECIDED schema).
 *
 * No side effects. No I/O. Safe to call in tests without infrastructure.
 */
function decide(detected) {
  const risk   = detected.risk_signal;
  const urgency = detected.urgency;
  const need   = detected.support_need;

  const upstream_uncertainty =
    risk.uncertainty_flag === true   ||
    urgency.uncertainty_flag === true ||
    need.uncertainty_flag === true;

  // R1 — CRITICAL: deterministic crisis path; LLM not invoked (Section 3.6)
  if (risk.value === 'CRITICAL') {
    return {
      strategy:              'CRISIS_RESPONSE',
      escalation_action:     'DETERMINISTIC_CRISIS',
      must_validate:         true,
      may_suggest_exercises: false,
      question_limit:        0,
      max_response_length:   MAX_RESPONSE_LENGTH.CRISIS_RESPONSE,
      reason_code:           'POLICY_ESCALATION_TRIGGERED',
      upstream_uncertainty,
      effectiveUrgency:      urgency.value,
    };
  }

  // R2 — ELEVATED: uncertainty does not reduce escalation (Section 3.7 R2 note)
  if (risk.value === 'ELEVATED') {
    return {
      strategy:              'VALIDATION_FOCUS',
      escalation_action:     'ESCALATE_TO_HUMAN',
      must_validate:         true,
      may_suggest_exercises: false,
      question_limit:        1,
      max_response_length:   MAX_RESPONSE_LENGTH.VALIDATION_FOCUS,
      reason_code:           'POLICY_ESCALATION_TRIGGERED',
      upstream_uncertainty,
      effectiveUrgency:      urgency.value,
    };
  }

  // R3 — SAFETY_ESCALATION with ABSENT risk
  // Satisfies cross-record constraint: escalation_action ≠ NONE when SAFETY_ESCALATION
  if (need.value === 'SAFETY_ESCALATION' && risk.value === 'ABSENT') {
    return {
      strategy:              'VALIDATION_FOCUS',
      escalation_action:     'SURFACE_RESOURCES',
      must_validate:         true,
      may_suggest_exercises: false,
      question_limit:        1,
      max_response_length:   MAX_RESPONSE_LENGTH.VALIDATION_FOCUS,
      reason_code:           'STRATEGY_BY_SUPPORT_NEED',
      upstream_uncertainty,
      effectiveUrgency:      urgency.value,
    };
  }

  // R4 — PRESENT risk
  if (risk.value === 'PRESENT') {
    return {
      strategy:              'VALIDATION_FOCUS',
      escalation_action:     'SURFACE_RESOURCES',
      must_validate:         true,
      may_suggest_exercises: false,
      question_limit:        2,
      max_response_length:   MAX_RESPONSE_LENGTH.VALIDATION_FOCUS,
      reason_code:           'POLICY_ESCALATION_TRIGGERED',
      upstream_uncertainty,
      effectiveUrgency:      urgency.value,
    };
  }

  // R5 — ABSENT with uncertainty: treat conservatively; uncertain ABSENT ≠ safe state
  if (risk.value === 'ABSENT' && risk.uncertainty_flag === true) {
    return {
      strategy:              'VALIDATION_FOCUS',
      escalation_action:     'SURFACE_RESOURCES',
      must_validate:         true,
      may_suggest_exercises: false,
      question_limit:        2,
      max_response_length:   MAX_RESPONSE_LENGTH.VALIDATION_FOCUS,
      reason_code:           'UNCERTAINTY_CONSERVED',
      upstream_uncertainty,
      effectiveUrgency:      urgency.value,
    };
  }

  // R6 — Default: support need routing
  // Precondition: risk = ABSENT, uncertainty_flag = false, need ≠ SAFETY_ESCALATION
  // R7: upshift urgency by one level when urgency.uncertainty_flag = true
  const urgencyUncertain  = urgency.uncertainty_flag === true;
  const effectiveUrgency  = urgencyUncertain ? URGENCY_UPSHIFT[urgency.value] : urgency.value;

  const mapping     = NEED_TO_STRATEGY[need.value];
  const reason_code = urgencyUncertain
    ? 'UNCERTAINTY_CONSERVED'
    : need.value === 'NONE_IDENTIFIED'
      ? 'DEFAULT_STRATEGY_APPLIED'
      : 'STRATEGY_BY_SUPPORT_NEED';

  return {
    strategy:              mapping.strategy,
    escalation_action:     'NONE',
    must_validate:         true,
    may_suggest_exercises: mapping.may_suggest_exercises,
    question_limit:        mapping.question_limit,
    max_response_length:   MAX_RESPONSE_LENGTH[mapping.strategy],
    reason_code,
    upstream_uncertainty,
    effectiveUrgency,
  };
}

/**
 * Builds and validates a complete DECIDED record from a canonical DETECTED record.
 * Validates against DecidedSchema; throws on violation.
 *
 * effectiveUrgency is stripped from the DECIDED record — callers must log it
 * separately in the POLICY_DECISION observability event (Section 3.11).
 */
function buildDecided(detected) {
  const { effectiveUrgency: _logOnly, ...policyFields } = decide(detected);

  const record = {
    decision_id:    uuidv4(),
    detection_ref:  detected.detection_id,
    policy_version: POLICY_VERSION,
    decided_at:     new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    ...policyFields,
  };

  const result = DecidedSchema.safeParse(record);
  if (!result.success) {
    throw new Error(`DECIDED schema violation: ${JSON.stringify(result.error.issues)}`);
  }

  return result.data;
}

module.exports = {
  POLICY_VERSION,
  SCHEMA_VERSION,
  MAX_RESPONSE_LENGTH,
  URGENCY_UPSHIFT,
  NEED_TO_STRATEGY,
  decide,
  buildDecided,
};
