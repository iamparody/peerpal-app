-- Phase 52.8: Add missing performance indexes identified in N+1 audit
-- peer_requests.accepted_by is used in GET /peer/stats and /peer/leaderboard
-- notifications.type is used in broadcast dedup query in broadenToGeneralTier

CREATE INDEX IF NOT EXISTS idx_peer_requests_accepted_by
  ON peer_requests (accepted_by)
  WHERE accepted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications (type);
