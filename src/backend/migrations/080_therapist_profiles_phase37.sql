-- Phase 37: Extend therapist_profiles for full marketplace (discovery, booking, payout).
-- specializations is replaced by category_ids UUID[]; languages was already an array, keep it.
-- session_formats already exists as TEXT[] — add CHECK constraint.

ALTER TABLE therapist_profiles
  DROP COLUMN IF EXISTS specializations,
  ADD COLUMN IF NOT EXISTS gender                   VARCHAR(20)   NULL
    CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS age                      INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS rate_per_session_kes     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified              BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS average_rating           DECIMAL(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings_count      INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sessions           INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_show_count            INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kcpa_level               VARCHAR(30)   NULL,
  ADD COLUMN IF NOT EXISTS kcpa_verified_at         TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS registration_number      VARCHAR(50)   NULL,
  ADD COLUMN IF NOT EXISTS kmpdc_number             VARCHAR(50)   NULL,
  ADD COLUMN IF NOT EXISTS indemnity_verified       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS good_conduct_verified    BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS good_conduct_expires_at  DATE          NULL,
  ADD COLUMN IF NOT EXISTS teletherapy_agreement_signed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS credentials_verified_by  UUID          NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS credentials_verified_at  TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS mpesa_number             VARCHAR(20)   NULL,
  ADD COLUMN IF NOT EXISTS agreement_signed_at      TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS suspended                BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_ids             UUID[]        NOT NULL DEFAULT '{}';

-- Add CHECK on session_formats (column pre-exists from migration 036).
-- NOT VALID skips validation of existing rows — safe for existing therapist profiles
-- that may have legacy values. New rows and updates are fully enforced.
ALTER TABLE therapist_profiles
  ADD CONSTRAINT chk_therapist_session_formats
    CHECK (session_formats <@ ARRAY['text','voice','video']::TEXT[]) NOT VALID;
