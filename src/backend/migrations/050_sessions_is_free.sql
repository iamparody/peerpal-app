-- Track whether an AI session consumed the user's weekly free allowance (1 free/week).
-- Default false so all existing sessions are treated as paid (no retroactive free grants).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_free_session BOOLEAN NOT NULL DEFAULT false;
