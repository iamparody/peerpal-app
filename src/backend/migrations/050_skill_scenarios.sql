-- 050_skill_scenarios.sql
-- Branching scenario content for each skill, stored as versioned JSONB.
-- status='draft' during development/testing; 'approved' required for production use
-- (controlled by PEER_SCREENING_LIVE env flag, not enforced here at DB level).
-- scenario_json structure: { version, title, intro, estimated_minutes, nodes: {}, scoring: {} }

CREATE TABLE skill_scenarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id          UUID NOT NULL REFERENCES skills(id),
  version           SMALLINT NOT NULL DEFAULT 1,
  title             VARCHAR(200) NOT NULL,
  estimated_minutes SMALLINT,
  scenario_json     JSONB NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'archived')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_id, version)
);

CREATE INDEX idx_skill_scenarios_skill_id ON skill_scenarios(skill_id);
CREATE INDEX idx_skill_scenarios_active   ON skill_scenarios(is_active, status);

ALTER TABLE skill_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_skill_scenarios_read  ON skill_scenarios FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_skill_scenarios_write ON skill_scenarios FOR ALL    TO anon USING (false);
