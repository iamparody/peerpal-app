-- Restore original migration 020 tables only if rolling back Phase 37 entirely.
CREATE TYPE referral_preferred_time  AS ENUM ('morning', 'afternoon', 'evening');
CREATE TYPE referral_contact_method  AS ENUM ('in_app', 'phone');
CREATE TYPE referral_status          AS ENUM ('pending', 'in_review', 'arranged', 'escalated', 'closed');

CREATE TABLE IF NOT EXISTS therapist_referrals (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  struggles       TEXT                    NOT NULL,
  preferred_time  referral_preferred_time NOT NULL,
  contact_method  referral_contact_method NOT NULL,
  contact_detail  TEXT                    NULL,
  specific_needs  TEXT                    NULL,
  status          referral_status         NOT NULL DEFAULT 'pending',
  admin_notes     TEXT                    NULL,
  created_at      TIMESTAMP               NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referrals_user_id ON therapist_referrals (user_id);
CREATE INDEX idx_referrals_status  ON therapist_referrals (status);
CREATE INDEX idx_referrals_created ON therapist_referrals (created_at DESC);
