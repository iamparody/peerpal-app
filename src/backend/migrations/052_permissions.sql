-- 052_permissions.sql
-- Permissions are policy decisions that map a set of required skills to a routing category.
-- required_skills: [{skill_id: UUID, min_version: int}]
-- disclaimer is the text shown to requesters when matched with a peer holding this permission.
-- Changing required_skills here is a policy change, not a routing change.

CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(100) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  disclaimer      TEXT NOT NULL,
  required_skills JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_slug   ON permissions(slug);
CREATE INDEX idx_permissions_active ON permissions(is_active);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_permissions_read  ON permissions FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_permissions_write ON permissions FOR ALL    TO anon USING (false);
