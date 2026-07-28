-- 055_skill_attempts.sql
-- Records each peer's scenario attempts. Multiple attempts per scenario are allowed.
-- score_json: { total: int, tags: {tag: points, ...}, pass_threshold: int }
-- passed is set on completion; null while in-progress.

CREATE TABLE skill_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id  UUID NOT NULL REFERENCES skill_scenarios(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score_json   JSONB,
  passed       BOOLEAN
);

CREATE INDEX idx_skill_attempts_user_id          ON skill_attempts(user_id);
CREATE INDEX idx_skill_attempts_user_scenario    ON skill_attempts(user_id, scenario_id);
CREATE INDEX idx_skill_attempts_user_completed   ON skill_attempts(user_id, completed_at DESC);

ALTER TABLE skill_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_skill_attempts_read  ON skill_attempts FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_skill_attempts_write ON skill_attempts FOR ALL    TO anon USING (false);
