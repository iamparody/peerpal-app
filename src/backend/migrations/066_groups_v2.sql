-- Migration 066: Groups v2
-- Adds post_type, parent_id, risk_flagged to group_messages.
-- post_type: announcement (default, all existing rows), prompt, response
-- parent_id: NULL for announcements/prompts; references the prompt message for responses
-- risk_flagged: true for MEDIUM-severity responses (published but visible to admin)
-- Note: is_deleted already exists (migration 015) and is reused for HIGH/critical holds

ALTER TABLE group_messages
  ADD COLUMN post_type   TEXT    NOT NULL DEFAULT 'announcement'
    CHECK (post_type IN ('announcement', 'prompt', 'response')),
  ADD COLUMN parent_id   UUID    REFERENCES group_messages(id) ON DELETE SET NULL,
  ADD COLUMN risk_flagged BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_group_messages_post_type ON group_messages (group_id, post_type, created_at DESC);
CREATE INDEX idx_group_messages_parent    ON group_messages (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_group_messages_held      ON group_messages (is_deleted, post_type, created_at DESC)
  WHERE is_deleted = true AND post_type = 'response';
