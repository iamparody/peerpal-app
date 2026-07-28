-- 051_peer_skills.sql
-- Records which skills a peer has earned, at what level, and from which scenario version.
-- is_active=false when the skill lapses (prerequisite lapsed or version drift exceeded grace period).
-- A lapsed skill also lapses any downstream peer_permissions that depended on it.

CREATE TABLE peer_skills (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id                   UUID NOT NULL REFERENCES skills(id),
  level                      SMALLINT NOT NULL DEFAULT 1 CHECK (level IN (1, 2, 3)),
  scenario_version_completed SMALLINT NOT NULL DEFAULT 1,
  earned_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at               TIMESTAMPTZ,
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, skill_id)
);

CREATE INDEX idx_peer_skills_user_id        ON peer_skills(user_id);
CREATE INDEX idx_peer_skills_user_active    ON peer_skills(user_id, is_active);
CREATE INDEX idx_peer_skills_last_used      ON peer_skills(last_used_at);

ALTER TABLE peer_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_peer_skills_read  ON peer_skills FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_peer_skills_write ON peer_skills FOR ALL    TO anon USING (false);
