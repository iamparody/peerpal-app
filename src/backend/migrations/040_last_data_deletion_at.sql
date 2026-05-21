-- Tracks when a user last purged their data so analytics can anchor
-- "all time" to the correct start date rather than account creation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_data_deletion_at TIMESTAMPTZ NULL;
