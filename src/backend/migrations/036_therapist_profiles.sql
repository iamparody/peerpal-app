-- Therapist profiles: verified partner therapists with public-facing profile data.
-- Member identity is never stored here; connection is admin-facilitated.

CREATE TABLE therapist_profiles (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name          VARCHAR(50)  NOT NULL,
  full_name             VARCHAR(100) NOT NULL,
  photo_url             VARCHAR(500) NULL,
  credentials           VARCHAR(200) NOT NULL,
  years_experience      INTEGER      NOT NULL DEFAULT 0,
  specializations       TEXT[]       NOT NULL DEFAULT '{}',
  languages             TEXT[]       NOT NULL DEFAULT '{}',
  session_formats       TEXT[]       NOT NULL DEFAULT '{}',
  location              VARCHAR(100) NULL,
  statement             VARCHAR(300) NULL,
  plain_language_intro  TEXT         NULL,
  cultural_competencies TEXT[]       NOT NULL DEFAULT '{}',
  approach_plain        VARCHAR(400) NULL,
  availability_status   VARCHAR(20)  NOT NULL DEFAULT 'available',
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT check_therapist_availability CHECK (availability_status IN ('available', 'limited', 'unavailable'))
);

CREATE INDEX idx_therapist_profiles_active       ON therapist_profiles (is_active);
CREATE INDEX idx_therapist_profiles_availability  ON therapist_profiles (availability_status);
CREATE INDEX idx_therapist_profiles_user_id       ON therapist_profiles (user_id);
