-- 061_peer_requests_decline_count.sql
-- Tracks how many times peers dismissed the confidence-to-accept overlay ("Not this time").
-- Used by the admin competency dashboard for the confidence-decline rate metric.

ALTER TABLE peer_requests
  ADD COLUMN decline_count SMALLINT NOT NULL DEFAULT 0;
