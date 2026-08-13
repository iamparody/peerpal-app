-- Availability window for FCM peer broadcast eligibility.
-- NULL  = peer is not opted in for push notifications.
-- value = timestamp until which the peer is reachable via FCM push.
ALTER TABLE users ADD COLUMN IF NOT EXISTS peer_available_until TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_peer_available_until
  ON users (peer_available_until)
  WHERE peer_available_until IS NOT NULL;
