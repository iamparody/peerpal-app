-- 060_peer_requests_routing_audit.sql
-- Append-only audit trail for the 8-step routing contract.
-- Each tier transition appends a JSONB object: {ts, event, peer_count}.
-- Events: tier1_broadcast | tier2_broadcast | no_peer_fallback | accepted
-- Never deleted or overwritten — read-only after each append.

ALTER TABLE peer_requests
  ADD COLUMN routing_audit JSONB NOT NULL DEFAULT '[]';
