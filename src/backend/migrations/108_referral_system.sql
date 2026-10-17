-- Migration 108: Phase 46 referral system (CHECKLIST.md Phase 46).
-- A referred user gets +1 bonus credit at signup; the referrer earns 2 credits when
-- the referred user's first credit purchase is confirmed.

-- users: own code (generated at signup, lazily for pre-108 accounts) and who referred them.
-- referred_by is SET NULL on delete: deletionJob hard-deletes users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(10) UNIQUE NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited')),
  credits_awarded  INTEGER     NOT NULL DEFAULT 2,
  triggered_by     VARCHAR(50) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credited_at      TIMESTAMPTZ NULL,
  UNIQUE (referrer_user_id, referred_user_id)
);

-- A user can only ever be referred once (users.referred_by is a single value).
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_referred ON referral_rewards (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_status ON referral_rewards (referrer_user_id, status);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- 'referral' channel already exists from 043; IF NOT EXISTS keeps this idempotent.
ALTER TYPE credit_tx_type    ADD VALUE IF NOT EXISTS 'referral_reward';
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'referral';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_reward_credited';
