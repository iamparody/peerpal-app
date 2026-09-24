CREATE TABLE therapist_payouts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id     UUID        NOT NULL REFERENCES therapist_profiles(id),
  booking_id       UUID        NOT NULL REFERENCES therapist_bookings(id) UNIQUE,
  amount_kes       INTEGER     NOT NULL,
  mpesa_number     VARCHAR(20) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  idempotency_key  UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  retry_count      INTEGER     NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ NULL,
  mpesa_reference  VARCHAR(100) NULL,
  initiated_at     TIMESTAMPTZ NULL,
  completed_at     TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_status ON therapist_payouts (status, created_at);

ALTER TABLE therapist_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapist_payouts FOR ALL TO anon USING (false);
