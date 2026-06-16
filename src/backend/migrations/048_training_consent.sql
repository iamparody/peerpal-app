-- Training data consent (Phase AI.1)
-- Adds opt-in training consent to users, language tagging + training eligibility
-- to ai_interactions, and per-session private flag to sessions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_consent         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_consented_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS training_consent_version VARCHAR(10);

ALTER TABLE ai_interactions
  ADD COLUMN IF NOT EXISTS language_detected  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS training_eligible  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_interactions_training
  ON ai_interactions (training_eligible, flagged)
  WHERE training_eligible = true AND flagged = false;
