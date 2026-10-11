-- Rollback 099
-- Enum values cannot be removed in Postgres — only the column is reversible.
ALTER TABLE users DROP COLUMN IF EXISTS last_reengagement_push_at;
