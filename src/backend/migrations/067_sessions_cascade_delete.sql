-- Migration 067: Change sessions.user_id FK from RESTRICT to CASCADE
-- Allows deleting a user without manually removing their sessions first.

ALTER TABLE sessions
  DROP CONSTRAINT sessions_user_id_fkey;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
