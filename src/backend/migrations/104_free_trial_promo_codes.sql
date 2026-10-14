-- Phase 47: Free Trial columns on users + promo_codes + promo_code_redemptions + notification types

-- Trial columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_claimed_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_ai_sessions_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_credits_issued   INTEGER NOT NULL DEFAULT 0;

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(20) UNIQUE NOT NULL CHECK (code = UPPER(code)),
  credit_value   INTEGER     NOT NULL CHECK (credit_value > 0),
  max_uses       INTEGER     NULL,
  uses_count     INTEGER     NOT NULL DEFAULT 0,
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until    TIMESTAMPTZ NULL,
  campaign_label VARCHAR(100) NULL,
  created_by     UUID        NOT NULL REFERENCES users(id),
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promo code redemptions table
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  UUID        NOT NULL REFERENCES promo_codes(id),
  user_id        UUID        NOT NULL REFERENCES users(id),
  credits_awarded INTEGER    NOT NULL,
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_code_id, user_id)
);

-- RLS: deny anon access to promo tables (same pattern as migration 030)
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY deny_anon_read  ON promo_codes FOR SELECT TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY deny_anon_write ON promo_codes FOR ALL    TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY deny_anon_read  ON promo_code_redemptions FOR SELECT TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY deny_anon_write ON promo_code_redemptions FOR ALL    TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notification enum additions
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trial_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trial_expired';

-- credit_tx_type: add trial_drip and promo if not present
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'trial_drip';
ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'promo';

-- credit_tx_channel: add trial if not present
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'trial';
