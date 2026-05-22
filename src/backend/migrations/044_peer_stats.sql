-- Migration 044: Peer stats table + peer_earning credit types

-- Peer earnings accumulator table
CREATE TABLE IF NOT EXISTS peer_stats (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  sessions_completed        INTEGER NOT NULL DEFAULT 0,
  pending_credits           DECIMAL(10,2) NOT NULL DEFAULT 0,
  earned_credits_lifetime   DECIMAL(10,2) NOT NULL DEFAULT 0,
  redeemed_credits_lifetime DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peer_stats_user_id ON peer_stats(user_id);

-- RLS: deny anonymous access (consistent with migrations 026/030)
ALTER TABLE peer_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_peer_stats" ON peer_stats
  AS RESTRICTIVE FOR ALL TO anon USING (false);

-- Extend enums for peer earning transactions
ALTER TYPE credit_tx_type    ADD VALUE IF NOT EXISTS 'peer_earning';
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'peer_earning';
