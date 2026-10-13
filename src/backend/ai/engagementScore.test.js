'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeScoreFromMetrics, scoreToSegment } = require('./engagementScore');

// Test cases from spec — all must pass before integration
// Profile                                          | recency | freq | breadth | history | score | segment
// Opens app daily, uses 3 features                |  40     |  30  |  15     |  10     |  95   | healthy
// 4 days quiet, long-term user (30 active/90)     |  28     |  24  |  20     |  10     |  82   | healthy
// 8 days quiet, moderate user (15 active/90)      |  16     |  12  |  10     |   5     |  43   | cooling
// 12 days quiet, light user (3 active/90)         |   4     |   3  |   5     |   1     |  13   | at_risk
// 20 days gone, tried it twice                    |   0     |   0  |   5     |   0     |   5   | dormant
// New user, day 3, tried AI once                  |  37     |   3  |   5     |   1     |  46   | cooling

describe('computeScoreFromMetrics — spec test cases', () => {
  it('opens app daily, uses 3 features → 95, healthy', () => {
    // days_inactive=0 → recency=40; activity_count_30d=10 → freq=30; features=3 → breadth=15; active_days_last_90d=30 → history=10
    const r = computeScoreFromMetrics({ days_inactive: 0, activity_count_30d: 10, distinct_features: 3, active_days_last_90d: 30 });
    assert.equal(r.score, 95);
    assert.equal(r.segment, 'healthy');
  });

  it('4 days quiet, long-term user → 82, healthy', () => {
    // days_inactive=4 → recency=28; activity_count_30d=8 → freq=24; features=4 → breadth=20; active_days_last_90d=30 → history=10
    const r = computeScoreFromMetrics({ days_inactive: 4, activity_count_30d: 8, distinct_features: 4, active_days_last_90d: 30 });
    assert.equal(r.score, 82);
    assert.equal(r.segment, 'healthy');
  });

  it('8 days quiet, moderate user → 43, cooling', () => {
    // days_inactive=8 → recency=16; activity_count_30d=4 → freq=12; features=2 → breadth=10; active_days_last_90d=15 → history=5
    const r = computeScoreFromMetrics({ days_inactive: 8, activity_count_30d: 4, distinct_features: 2, active_days_last_90d: 15 });
    assert.equal(r.score, 43);
    assert.equal(r.segment, 'cooling');
  });

  it('12 days quiet, light user → 13, dormant', () => {
    // days_inactive=12 → recency=4; activity_count_30d=1 → freq=3; features=1 → breadth=5; active_days_last_90d=3 → history=1
    // Score 13 falls in dormant (0–14) per threshold table — threshold table takes precedence over test-case intuition
    const r = computeScoreFromMetrics({ days_inactive: 12, activity_count_30d: 1, distinct_features: 1, active_days_last_90d: 3 });
    assert.equal(r.score, 13);
    assert.equal(r.segment, 'dormant');
  });

  it('20 days gone, tried it twice → 5, dormant', () => {
    // days_inactive=20 → recency=0 (clamped); activity_count_30d=0 → freq=0; features=1 → breadth=5; active_days_last_90d=0 → history=0
    const r = computeScoreFromMetrics({ days_inactive: 20, activity_count_30d: 0, distinct_features: 1, active_days_last_90d: 0 });
    assert.equal(r.score, 5);
    assert.equal(r.segment, 'dormant');
  });

  it('new user, day 3, tried AI once → 46, cooling', () => {
    // days_inactive=0.3 → recency≈39→rounded; use days_inactive≈1 → recency=37; activity_count_30d=1 → freq=3; features=1 → breadth=5; active_days_last_90d=2 → history≈0.67→rounds to 1
    const r = computeScoreFromMetrics({ days_inactive: 1, activity_count_30d: 1, distinct_features: 1, active_days_last_90d: 2 });
    assert.equal(r.score, 46);
    assert.equal(r.segment, 'cooling');
  });
});

describe('scoreToSegment — boundary values', () => {
  it('100 → healthy', () => assert.equal(scoreToSegment(100), 'healthy'));
  it('70 → healthy',  () => assert.equal(scoreToSegment(70),  'healthy'));
  it('69 → cooling',  () => assert.equal(scoreToSegment(69),  'cooling'));
  it('40 → cooling',  () => assert.equal(scoreToSegment(40),  'cooling'));
  it('39 → at_risk',  () => assert.equal(scoreToSegment(39),  'at_risk'));
  it('15 → at_risk',  () => assert.equal(scoreToSegment(15),  'at_risk'));
  it('14 → dormant',  () => assert.equal(scoreToSegment(14),  'dormant'));
  it('0  → dormant',  () => assert.equal(scoreToSegment(0),   'dormant'));
});
