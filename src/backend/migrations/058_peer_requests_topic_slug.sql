-- 058_peer_requests_topic_slug.sql
-- Adds topic_slug to peer_requests so the routing engine knows which permission
-- category is required for each request. NULL = general (pre-screening requests).

ALTER TABLE peer_requests
  ADD COLUMN topic_slug VARCHAR(100) NULL,
  ADD COLUMN secondary_topic_slug VARCHAR(100) NULL;
