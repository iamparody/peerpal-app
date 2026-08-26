-- Migration 068: Fix all ON DELETE RESTRICT foreign keys referencing users(id)
-- Policy:
--   CASCADE  → user-owned data (deleted with the user)
--   SET NULL → audit/safety logs and "created_by" columns (keep record, detach user)

-- peer_requests.user_id
ALTER TABLE peer_requests DROP CONSTRAINT peer_requests_user_id_fkey;
ALTER TABLE peer_requests ADD CONSTRAINT peer_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- group_messages.user_id
ALTER TABLE group_messages DROP CONSTRAINT group_messages_user_id_fkey;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- emergency_logs.user_id
ALTER TABLE emergency_logs DROP CONSTRAINT emergency_logs_user_id_fkey;
ALTER TABLE emergency_logs ADD CONSTRAINT emergency_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- escalation_logs.user_id
ALTER TABLE escalation_logs DROP CONSTRAINT escalation_logs_user_id_fkey;
ALTER TABLE escalation_logs ADD CONSTRAINT escalation_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- groups.created_by
ALTER TABLE groups DROP CONSTRAINT groups_created_by_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

-- group_bans.banned_by
ALTER TABLE group_bans DROP CONSTRAINT group_bans_banned_by_fkey;
ALTER TABLE group_bans ADD CONSTRAINT group_bans_banned_by_fkey
  FOREIGN KEY (banned_by) REFERENCES users (id) ON DELETE SET NULL;

-- psychoeducation_articles.created_by
ALTER TABLE psychoeducation_articles DROP CONSTRAINT psychoeducation_articles_created_by_fkey;
ALTER TABLE psychoeducation_articles ADD CONSTRAINT psychoeducation_articles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;
