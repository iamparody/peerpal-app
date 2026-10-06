-- Rollback for 098_therapist_onboarding.sql
ALTER TABLE therapist_profiles
  DROP COLUMN IF EXISTS onboarding_complete,
  DROP COLUMN IF EXISTS documents;
