// Thresholds and feature flags for the peer competency / routing system.
// Editing these values changes system behaviour; see docs/peer-screening/governance.md before modifying.

module.exports = {
  // Set to true only after clinical sign-off (see governance.md §5).
  PEER_SCREENING_LIVE: process.env.PEER_SCREENING_LIVE === 'true',

  // Scenario scoring: percentage of points available that a peer must score to pass.
  SCENARIO_PASS_PERCENT: 0.55,

  // Minimum days of activity before a skill can be awarded (prevents same-day farming).
  MIN_DAYS_BETWEEN_ATTEMPTS: 0, // 0 during development; raise to 1 before production launch

  // Permission inactivity expiry (days). Mirrors the DB default in peer_permissions.
  PERMISSION_INACTIVE_EXPIRY_DAYS: 180,

  // Supervision queue — signal thresholds that trigger a permission_flag row.
  // Each key matches a signal_type value in the permission_flags table.
  SUPERVISION_THRESHOLDS: {
    // Fraction of sessions in the past 30 days rated below 3 stars
    low_feedback: { ratio: 0.40, window_days: 30, min_sessions: 5 },

    // Fraction of recent sessions where peer requested a different topic category
    category_drift: { ratio: 0.30, window_days: 30, min_sessions: 5 },

    // Any moderation intervention (contact-info warn, report) in the past 14 days
    moderation_intervention: { count: 2, window_days: 14 },

    // Fraction of post-session reflections where felt_prepared = false
    unprepared_reflections: { ratio: 0.50, window_days: 30, min_sessions: 5 },
  },
};
