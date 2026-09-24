ALTER TABLE users
  DROP COLUMN IF EXISTS therapy_consent_version,
  DROP COLUMN IF EXISTS therapy_consented_at,
  DROP COLUMN IF EXISTS last_therapy_nudge_at;
