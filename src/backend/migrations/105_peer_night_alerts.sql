-- Night alerts opt-in for peer-request pushes (docs/peer-request-push.md).
-- During Nairobi quiet hours (22:00–07:00 EAT) a peer-request push is only sent to peers
-- with an active availability window AND this flag on. Default off: nobody is woken
-- at night without explicitly asking for it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notif_peer_night BOOLEAN NOT NULL DEFAULT false;
