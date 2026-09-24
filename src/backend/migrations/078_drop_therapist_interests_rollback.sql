-- Recreate therapist_interests only if rolling back to pre-Phase-37 state.
-- Also restore routes/referrals.js, App.jsx routes, admin.js endpoints before this rollback.
CREATE TABLE IF NOT EXISTS therapist_interests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id  UUID        NOT NULL REFERENCES therapist_referrals(id) ON DELETE CASCADE,
  therapist_id UUID        NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes        TEXT        NULL,
  responded_at TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referral_id, therapist_id)
);
