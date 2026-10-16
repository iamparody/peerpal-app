-- Rollback for migration 107
-- Note: PostgreSQL enum values added with ADD VALUE cannot be removed.
-- Only the column additions are rolled back here.

ALTER TABLE users
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS first_session_completed_at,
  DROP COLUMN IF EXISTS last_session_at,
  DROP COLUMN IF EXISTS reengagement_step;
