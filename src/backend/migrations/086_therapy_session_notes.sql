-- Session notes are therapist-private. RLS: owner only + admin on dispute. Member never sees these.
CREATE TABLE therapy_session_notes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        NOT NULL REFERENCES therapist_bookings(id) ON DELETE CASCADE UNIQUE,
  therapist_id UUID        NOT NULL REFERENCES therapist_profiles(id),
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_notes_booking ON therapy_session_notes (booking_id);

ALTER TABLE therapy_session_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapy_session_notes FOR ALL TO anon USING (false);
