-- Rollback for 104_free_trial_promo_codes.sql
-- NOTE: Postgres does not support removing enum values.
-- trial_reminder, trial_expired, trial_drip, promo, trial enum values cannot be removed.
-- Rolling back table and column changes only.

DROP TABLE IF EXISTS promo_code_redemptions;
DROP TABLE IF EXISTS promo_codes;

ALTER TABLE users
  DROP COLUMN IF EXISTS trial_claimed_at,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS trial_ai_sessions_used,
  DROP COLUMN IF EXISTS trial_credits_issued;
