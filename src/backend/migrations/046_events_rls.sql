-- 046_events_rls.sql
-- Enables RLS on the events table (missed in migration 034).
-- Deny-anon policy matches the pattern used across all other tables (migration 030).

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon_events_read
  ON events FOR SELECT
  TO anon
  USING (false);

CREATE POLICY deny_anon_events_write
  ON events FOR ALL
  TO anon
  USING (false);
