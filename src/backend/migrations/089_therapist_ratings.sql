-- Ratings are always anonymous: member_user_id used only for dedup/fraud, never shown to therapist.
CREATE TABLE therapist_ratings (
  id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID     NOT NULL REFERENCES therapist_bookings(id) UNIQUE,
  member_user_id UUID     NULL REFERENCES users(id) ON DELETE SET NULL,
  therapist_id   UUID     NOT NULL REFERENCES therapist_profiles(id),
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT     NULL CHECK (char_length(comment) <= 300),
  flagged        BOOLEAN  NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_therapist ON therapist_ratings (therapist_id, created_at DESC);

ALTER TABLE therapist_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapist_ratings FOR ALL TO anon USING (false);
