CREATE TABLE therapy_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID        NOT NULL REFERENCES therapist_bookings(id) ON DELETE CASCADE UNIQUE,
  room_token_member     TEXT        NULL,
  room_token_therapist  TEXT        NULL,
  started_at            TIMESTAMPTZ NULL,
  ended_at              TIMESTAMPTZ NULL,
  duration_billed_minutes INTEGER   NULL,
  therapist_joined_at   TIMESTAMPTZ NULL,
  member_joined_at      TIMESTAMPTZ NULL
);

-- No separate index needed: booking_id UNIQUE constraint creates one implicitly.

ALTER TABLE therapy_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapy_sessions FOR ALL TO anon USING (false);
