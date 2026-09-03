-- Phase 33.B — AI conversation quota, separate from peer credits
ALTER TABLE users  ADD COLUMN IF NOT EXISTS free_ai_used_at TIMESTAMPTZ;
ALTER TABLE credits ADD COLUMN IF NOT EXISTS ai_conversations_used INT NOT NULL DEFAULT 0;
ALTER TABLE credits ADD COLUMN IF NOT EXISTS ai_conversations_cap  INT NOT NULL DEFAULT 0;
