ALTER TABLE users ADD COLUMN IF NOT EXISTS last_nudge_variant JSONB DEFAULT '{}'::jsonb;
