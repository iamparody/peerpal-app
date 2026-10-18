-- Rollback for 108_perf_indexes.sql
DROP INDEX IF EXISTS idx_peer_requests_accepted_by;
DROP INDEX IF EXISTS idx_notifications_type;
