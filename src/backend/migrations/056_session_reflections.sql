-- 056_session_reflections.sql
-- Post-session reflections submitted by the peer after a session ends.
-- Feeds system analytics and training improvement — never linked to individual
-- permission decisions or permission_flags. This separation is a safety invariant.
-- One reflection per session (unique constraint on session_id).

CREATE TABLE session_reflections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  UUID NOT NULL REFERENCES sessions(id),
  peer_user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_stayed_in_category    BOOLEAN,
  unexpected_topic_arose      BOOLEAN,
  felt_prepared               BOOLEAN,
  additional_training_wanted  BOOLEAN,
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id)
);

CREATE INDEX idx_session_reflections_peer_user  ON session_reflections(peer_user_id);
CREATE INDEX idx_session_reflections_submitted  ON session_reflections(submitted_at DESC);

ALTER TABLE session_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_session_reflections_read  ON session_reflections FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_session_reflections_write ON session_reflections FOR ALL    TO anon USING (false);
