CREATE TABLE therapy_disputes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES therapist_bookings(id) ON DELETE CASCADE,
  raised_by       UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
  raised_by_role  VARCHAR(10) NOT NULL CHECK (raised_by_role IN ('member','therapist')),
  reason          TEXT        NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved_refund','resolved_partial','resolved_release')),
  admin_notes     TEXT        NULL,
  resolved_by     UUID        NULL REFERENCES users(id),
  resolved_at     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_booking ON therapy_disputes (booking_id);
CREATE INDEX idx_disputes_status  ON therapy_disputes (status);

ALTER TABLE therapy_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapy_disputes FOR ALL TO anon USING (false);
