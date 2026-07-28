-- 059_skills_version_bumped_at.sql
-- Tracks when each skill's scenario content was last versioned up.
-- The version drift job uses this to enforce the 30-day grace period:
-- a peer has 30 days from version_bumped_at to re-complete the scenario
-- before their dependent permissions are set inactive.
-- Defaults to NOW() for existing rows so no permissions immediately lapse on deploy.

ALTER TABLE skills
  ADD COLUMN version_bumped_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
