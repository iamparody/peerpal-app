'use strict';

const { v4: uuidv4 } = require('uuid');
const { classify }   = require('../utils/riskClassifier');

const DETECTOR_VERSION = 'keyword-classifier@1.0.0';

// Maps riskClassifier severity levels to the pipeline's RiskSignal enum.
// riskClassifier uses: critical | high | medium
// Pipeline uses:       CRITICAL | ELEVATED | PRESENT
const SEVERITY_MAP = {
  critical: 'CRITICAL',
  high:     'ELEVATED',
  medium:   'PRESENT',
};

/**
 * Synchronous keyword risk classifier. Wraps riskClassifier.classify().
 * Produces a RiskSignalSourceSchema-shaped record with status = DETERMINISTIC.
 *
 * @param {string} text     - Sanitized message text
 * @param {object} observed - ObservedSchema record
 * @returns RiskSignalSourceSchema-shaped object
 */
function run(text, observed) {
  const result = typeof text === 'string' ? classify(text) : null;
  const value  = result ? (SEVERITY_MAP[result.severity] || 'PRESENT') : 'ABSENT';
  const now    = new Date().toISOString();
  const prov   = { source_type: observed.source, id: observed.record_id };

  return {
    source_id:        uuidv4(),
    observed_ref:     observed.record_id,
    detector_version: DETECTOR_VERSION,
    detected_at:      now,
    risk_signal: {
      value,
      status:            'DETERMINISTIC',
      confidence_status: 'NOT_APPLICABLE',
      confidence:        null,
      uncertainty_flag:  null,
      provenance:        prov,
      detector_version:  DETECTOR_VERSION,
      created_at:        now,
    },
    // Internal metadata for the pipeline — stripped before DB persistence
    _matched_keyword:  result?.keyword  ?? null,
    _matched_category: result?.category ?? null,
  };
}

module.exports = { DETECTOR_VERSION, run };
