-- Migration 098: Therapist self-service onboarding fields
-- Adds onboarding_complete flag and documents JSONB array to therapist_profiles.
-- documents stores [{type, file_path, uploaded_at}] — no binary data in DB.

ALTER TABLE therapist_profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documents           JSONB   NOT NULL DEFAULT '[]';

COMMENT ON COLUMN therapist_profiles.onboarding_complete IS
  'Set true when therapist submits their profile via the portal onboarding flow. '
  'Portal gates all tabs behind this flag.';

COMMENT ON COLUMN therapist_profiles.documents IS
  'Array of {type, file_path, uploaded_at}. '
  'type IN (photo, kcpa_cert, academic_cert, indemnity, good_conduct, agreement). '
  'file_path is the Supabase Storage path: therapist-docs/{user_id}/{type}/{filename}.';
