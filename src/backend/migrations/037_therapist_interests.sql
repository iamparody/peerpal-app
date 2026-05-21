-- Therapist interests: member selects up to 3 therapists per referral.
-- Status tracks admin matching action.

CREATE TABLE therapist_interests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  therapist_id     UUID        NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
  referral_id      UUID        NOT NULL REFERENCES therapist_referrals(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_user_id, therapist_id, referral_id),
  CONSTRAINT check_interest_status CHECK (status IN ('pending', 'matched', 'closed'))
);

CREATE INDEX idx_therapist_interests_referral  ON therapist_interests (referral_id);
CREATE INDEX idx_therapist_interests_member    ON therapist_interests (member_user_id);
CREATE INDEX idx_therapist_interests_therapist ON therapist_interests (therapist_id);
