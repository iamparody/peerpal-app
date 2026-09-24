CREATE TABLE booking_slot_locks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID        NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  locked_by    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  UNIQUE (therapist_id, scheduled_at)
);

-- Cleanup cron scans by expiry
CREATE INDEX idx_slot_locks_expires ON booking_slot_locks (expires_at);

ALTER TABLE booking_slot_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON booking_slot_locks FOR ALL TO anon USING (false);
