-- Migration 098: Waitlist signups (pre-launch landing page)
-- Public, pre-auth table. Email is the identity; deduped case-insensitively.
-- No RLS: this table is written by the public waitlist endpoint before any user exists.

CREATE TABLE waitlist_signups (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT         NOT NULL,
  source     VARCHAR(60)  NOT NULL DEFAULT 'landing',
  user_agent TEXT         NULL,
  ip_hash    VARCHAR(64)  NULL,
  invited_at TIMESTAMP    NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness so the same address can't join twice.
CREATE UNIQUE INDEX idx_waitlist_email_unique ON waitlist_signups (LOWER(email));
CREATE INDEX idx_waitlist_created ON waitlist_signups (created_at DESC);
