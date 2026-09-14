'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { run, DETECTOR_VERSION } = require('./keywordClassifier');

const OBSERVED = {
  record_id:     '00000000-0000-0000-0000-000000000001',
  user_id:       '00000000-0000-0000-0000-000000000002',
  source:        'SESSION_MESSAGE',
  created_at:    '2026-01-01T00:00:00.000Z',
  session_id:    '00000000-0000-0000-0000-000000000003',
  content_type:  'TEXT',
  content_ref:   '00000000-0000-0000-0000-000000000004',
  schema_version: '1.0.0',
};

describe('keywordClassifier.run — risk_signal mapping', () => {
  it('critical keyword → CRITICAL', () => {
    const src = run('I want to kill myself', OBSERVED);
    assert.equal(src.risk_signal.value, 'CRITICAL');
  });

  it('high keyword → ELEVATED', () => {
    const src = run("I can't cope anymore and I feel absolutely hopeless", OBSERVED);
    assert.equal(src.risk_signal.value, 'ELEVATED');
  });

  it('medium keyword → PRESENT', () => {
    const src = run('I feel hopeless today', OBSERVED);
    assert.equal(src.risk_signal.value, 'PRESENT');
  });

  it('no match → ABSENT', () => {
    const src = run('I had a good day today', OBSERVED);
    assert.equal(src.risk_signal.value, 'ABSENT');
  });

  it('empty string → ABSENT', () => {
    const src = run('', OBSERVED);
    assert.equal(src.risk_signal.value, 'ABSENT');
  });

  it('null text → ABSENT (does not throw)', () => {
    const src = run(null, OBSERVED);
    assert.equal(src.risk_signal.value, 'ABSENT');
  });
});

describe('keywordClassifier.run — DetectedField invariants', () => {
  it('status is always DETERMINISTIC', () => {
    const src = run('I want to die', OBSERVED);
    assert.equal(src.risk_signal.status, 'DETERMINISTIC');
  });

  it('confidence_status is always NOT_APPLICABLE', () => {
    const src = run('I want to die', OBSERVED);
    assert.equal(src.risk_signal.confidence_status, 'NOT_APPLICABLE');
  });

  it('confidence is always null', () => {
    const src = run('I want to die', OBSERVED);
    assert.equal(src.risk_signal.confidence, null);
  });

  it('uncertainty_flag is always null', () => {
    const src = run('I want to die', OBSERVED);
    assert.equal(src.risk_signal.uncertainty_flag, null);
  });

  it('provenance.source_type matches observed.source', () => {
    const src = run('hello', OBSERVED);
    assert.equal(src.risk_signal.provenance.source_type, OBSERVED.source);
  });

  it('provenance.id matches observed.record_id', () => {
    const src = run('hello', OBSERVED);
    assert.equal(src.risk_signal.provenance.id, OBSERVED.record_id);
  });

  it('detector_version is version-pinned format', () => {
    const src = run('hello', OBSERVED);
    assert.match(src.risk_signal.detector_version, /^[^@]+@\d+\.\d+\.\d+$/);
    assert.equal(src.risk_signal.detector_version, DETECTOR_VERSION);
  });

  it('observed_ref matches observed.record_id', () => {
    const src = run('hello', OBSERVED);
    assert.equal(src.observed_ref, OBSERVED.record_id);
  });
});

describe('keywordClassifier.run — highest severity wins', () => {
  it('message with both critical and high terms → CRITICAL (severity-first)', () => {
    const src = run('I want to kill myself and I cannot cope', OBSERVED);
    assert.equal(src.risk_signal.value, 'CRITICAL');
  });
});
