-- 049_skills.sql
-- Skill taxonomy for the peer competency system.
-- Skills are atomic capabilities. prerequisite_skill_ids is an array of UUIDs
-- that must all be held (is_active=true in peer_skills) before this skill can be started.

CREATE TABLE skills (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   VARCHAR(100) UNIQUE NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  description            TEXT,
  icon_name              VARCHAR(100),          -- matches frontend SVG icon key
  skill_group            VARCHAR(20) NOT NULL DEFAULT 'baseline'
                           CHECK (skill_group IN ('baseline', 'specialty')),
  prerequisite_skill_ids UUID[] NOT NULL DEFAULT '{}',
  current_version        SMALLINT NOT NULL DEFAULT 1,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_slug      ON skills(slug);
CREATE INDEX idx_skills_active    ON skills(is_active);
CREATE INDEX idx_skills_group     ON skills(skill_group);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_skills_read  ON skills FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_skills_write ON skills FOR ALL    TO anon USING (false);
