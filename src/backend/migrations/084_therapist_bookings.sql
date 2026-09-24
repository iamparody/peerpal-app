CREATE TABLE therapist_bookings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_user_id       UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
  therapist_id         UUID        NOT NULL REFERENCES therapist_profiles(id),
  category_id          UUID        NOT NULL REFERENCES therapist_categories(id),
  session_format       VARCHAR(10) NOT NULL
    CHECK (session_format IN ('text','voice','video')),
  scheduled_at         TIMESTAMPTZ NOT NULL,
  duration_minutes     INTEGER     NOT NULL DEFAULT 60,
  rate_kes             INTEGER     NOT NULL,
  platform_fee_kes     INTEGER     NOT NULL,
  therapist_payout_kes INTEGER     NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','disputed','therapist_no_show','member_no_show')),
  cancelled_by         VARCHAR(10) NULL
    CHECK (cancelled_by IN ('member','therapist','admin')),
  cancellation_reason  TEXT        NULL,
  credit_charged       INTEGER     NOT NULL DEFAULT 1,
  payment_status       VARCHAR(20) NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded','partial_refund','disputed')),
  payment_reference    VARCHAR(100) NULL,
  escrow_status        VARCHAR(20) NOT NULL DEFAULT 'held'
    CHECK (escrow_status IN ('held','released','refunded','disputed')),
  notes                TEXT        NULL,
  pre_session_checkin  JSONB       NULL,
  idempotency_key      UUID        NOT NULL DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_member   ON therapist_bookings (member_user_id, scheduled_at DESC);
CREATE INDEX idx_bookings_therapist ON therapist_bookings (therapist_id, scheduled_at DESC);
CREATE INDEX idx_bookings_status   ON therapist_bookings (status, scheduled_at);
CREATE INDEX idx_bookings_payment  ON therapist_bookings (payment_reference);

ALTER TABLE therapist_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapist_bookings FOR ALL TO anon USING (false);
