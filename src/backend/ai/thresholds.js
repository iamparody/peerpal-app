'use strict';

// Confidence thresholds for uncertainty_flag determination.
// These are policy parameters — changes require DUAL_REVIEW (Section 3.9).
// Values below are operational defaults; must be calibrated against evaluation
// data before production deployment of any capability that relies on them.

module.exports = {
  RISK_UNCERTAINTY_THRESHOLD:         0.70, // conservative — over-flagging is safer than under-flagging
  URGENCY_UNCERTAINTY_THRESHOLD:      0.65,
  SUPPORT_NEED_UNCERTAINTY_THRESHOLD: 0.60,
  EMOTION_UNCERTAINTY_THRESHOLD:      0.55,
};
