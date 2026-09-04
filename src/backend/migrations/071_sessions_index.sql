-- Migration 071: Index sessions(started_at, type)
-- Fixes full table scan on admin daily stats queries that filter by date range and session type.
CREATE INDEX IF NOT EXISTS idx_sessions_started_type ON sessions (started_at, type);
