'use strict';

const { v4: uuidv4 } = require('uuid');
const THRESHOLDS     = require('./thresholds');

const DETECTOR_VERSION = 'resolver@1.0.0';
const SCHEMA_VERSION   = '1.0.0';

// Severity ordering for R_S1/R_S2 (Section 3.5.1)
const SEVERITY = { ABSENT: 0, PRESENT: 1, ELEVATED: 2, CRITICAL: 3 };

// ─── Risk signal resolution ───────────────────────────────────────────────────

function elevatedFallback(observed) {
  // FAIL_CLOSED: both risk sources unavailable (Section 3.5.1, Section 3.10)
  const now  = new Date().toISOString();
  const prov = { source_type: observed.source, id: observed.record_id };
  return {
    value:             'ELEVATED',
    status:            'DETERMINISTIC',
    confidence_status: 'NOT_APPLICABLE',
    confidence:        null,
    uncertainty_flag:  null,
    provenance:        prov,
    detector_version:  DETECTOR_VERSION,
    created_at:        now,
  };
}

// Implements Section 3.5.1 rules R_S1, R_S2, R_S3.
// Returns a risk_signal DetectedField for the canonical DETECTED record.
function resolveRiskSignal(kwSrc, ctxSrc, observed) {
  const hasKw  = kwSrc  !== null;
  const hasCtx = ctxSrc !== null;

  if (!hasKw && !hasCtx) return elevatedFallback(observed);

  const kw  = hasKw  ? kwSrc.risk_signal  : null;
  const ctx = hasCtx ? ctxSrc.risk_signal : null;

  // Single source available
  if (hasKw && !hasCtx) return kw;
  if (!hasKw && hasCtx) return ctx;

  const kwLevel  = SEVERITY[kw.value]  ?? 0;
  const ctxLevel = SEVERITY[ctx.value] ?? 0;
  const now      = new Date().toISOString();
  const prov     = (src) => src.provenance;

  // R_S1: Any source CRITICAL
  if (kw.value === 'CRITICAL' || ctx.value === 'CRITICAL') {
    const fromKeyword = kw.value === 'CRITICAL';
    return {
      value:             'CRITICAL',
      status:            fromKeyword ? 'DETERMINISTIC' : 'INFERRED',
      confidence_status: fromKeyword ? 'NOT_APPLICABLE' : 'AVAILABLE',
      confidence:        fromKeyword ? null : ctx.confidence,
      uncertainty_flag:  fromKeyword ? null : ctx.uncertainty_flag,
      provenance:        fromKeyword ? prov(kw) : prov(ctx),
      detector_version:  DETECTOR_VERSION,
      created_at:        now,
    };
  }

  // R_S2 + R_S3: keyword wins at same level (tie = keyword confirmation → DETERMINISTIC)
  const keywordWins = kwLevel >= ctxLevel;
  if (keywordWins) {
    return {
      value:             kw.value,
      status:            'DETERMINISTIC',
      confidence_status: 'NOT_APPLICABLE',
      confidence:        null,
      uncertainty_flag:  null,
      provenance:        prov(kw),
      detector_version:  DETECTOR_VERSION,
      created_at:        now,
    };
  }

  // Contextual wins (higher severity)
  return {
    value:             ctx.value,
    status:            'INFERRED',
    confidence_status: 'AVAILABLE',
    confidence:        ctx.confidence,
    uncertainty_flag:  ctx.uncertainty_flag,
    provenance:        prov(ctx),
    detector_version:  DETECTOR_VERSION,
    created_at:        now,
  };
}

// ─── Conversational fallback ──────────────────────────────────────────────────

function conversationalFallback(observed) {
  // Section 4.8: detector unavailable → deterministic NONE_IDENTIFIED / NONE
  const now  = new Date().toISOString();
  const prov = { source_type: observed.source, id: observed.record_id };
  const det  = (value) => ({
    value,
    status:            'DETERMINISTIC',
    confidence_status: 'NOT_APPLICABLE',
    confidence:        null,
    uncertainty_flag:  null,
    provenance:        prov,
    detector_version:  DETECTOR_VERSION,
    created_at:        now,
  });
  return { support_need: det('NONE_IDENTIFIED'), urgency: det('NONE'), expressed_emotion: null };
}

// ─── Detection reason_code ────────────────────────────────────────────────────

function determineReasonCode({ riskSignal, kwSrc, ctxSrc }) {
  const hasKw  = kwSrc  !== null;
  const hasCtx = ctxSrc !== null;

  if (!hasKw && !hasCtx) return 'NO_SIGNAL_DETECTED'; // fail-closed path; value is policy default
  if (riskSignal.value === 'ABSENT') return 'NO_SIGNAL_DETECTED';

  const kwSignal  = hasKw  && kwSrc.risk_signal.value  !== 'ABSENT';
  const ctxSignal = hasCtx && ctxSrc.risk_signal.value !== 'ABSENT';

  if (kwSignal && ctxSignal) {
    const kwLevel  = SEVERITY[kwSrc.risk_signal.value]  ?? 0;
    const ctxLevel = SEVERITY[ctxSrc.risk_signal.value] ?? 0;
    return kwLevel !== ctxLevel ? 'CONFLICTING_SIGNALS' : 'KEYWORD_RISK_MATCH';
  }
  if (kwSignal) return 'KEYWORD_RISK_MATCH';
  if (hasKw && !hasCtx) return 'SINGLE_SIGNAL_DOMINANT'; // only keyword, but it returned ABSENT
  if (ctxSignal) {
    return ctxSrc.risk_signal.confidence >= THRESHOLDS.RISK_UNCERTAINTY_THRESHOLD
      ? 'HIGH_CONFIDENCE_DETECTION'
      : 'LOW_CONFIDENCE_DETECTION';
  }
  return 'SINGLE_SIGNAL_DOMINANT';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Deterministic resolver. Assembles canonical DETECTED from DETECTED_SOURCE records.
 * Pure function — no side effects, no I/O.
 *
 * @param {object} keywordSource        - RiskSignalSourceSchema | null (keyword risk classifier)
 * @param {object} contextualSource     - RiskSignalSourceSchema | null (contextual risk classifier; may be null)
 * @param {object} conversationalSource - ConversationalStateSourceSchema | null (Section 4 detector)
 * @param {object} observed             - ObservedSchema record
 * @returns canonical DETECTED record (DetectedSchema-shaped); immutable after creation
 */
function resolve({ keywordSource, contextualSource = null, conversationalSource, observed }) {
  const riskSignal = resolveRiskSignal(keywordSource, contextualSource, observed);

  const useConv = conversationalSource && !conversationalSource._fallback;
  const conv    = useConv
    ? {
        support_need:      conversationalSource.support_need,
        urgency:           conversationalSource.urgency,
        expressed_emotion: conversationalSource.expressed_emotion ?? null,
      }
    : conversationalFallback(observed);

  return {
    detection_id:      uuidv4(),
    observed_ref:      observed.record_id,
    detector_id:       DETECTOR_VERSION,
    detected_at:       new Date().toISOString(),
    risk_signal:       riskSignal,
    support_need:      conv.support_need,
    urgency:           conv.urgency,
    expressed_emotion: conv.expressed_emotion,
    reason_code:       determineReasonCode({ riskSignal, kwSrc: keywordSource, ctxSrc: contextualSource }),
    schema_version:    SCHEMA_VERSION,
  };
}

module.exports = { DETECTOR_VERSION, resolve };
