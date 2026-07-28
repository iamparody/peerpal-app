-- 053_peer_permissions.sql
-- Records which permissions a peer currently holds and their status.
-- revoked_by must be non-null when status='revoked' or status='suspended' via admin action
-- (enforced at API level; DB constraint below guards against direct writes).
-- expires_if_inactive_days: permission goes inactive after this many days without last_active_at update.
-- Default 180 days per governance.md §4.

CREATE TABLE peer_permissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id            UUID NOT NULL REFERENCES permissions(id),
  granted_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_if_inactive_days INTEGER NOT NULL DEFAULT 180,
  last_active_at           TIMESTAMPTZ,
  status                   VARCHAR(20) NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'inactive', 'suspended', 'revoked')),
  scenario_version_at_grant SMALLINT NOT NULL DEFAULT 1,
  revoked_by               UUID REFERENCES users(id),
  revoked_at               TIMESTAMPTZ,
  UNIQUE(user_id, permission_id),
  -- Revocation requires a named reviewer — no anonymous automated revocations.
  CONSTRAINT revocation_requires_reviewer
    CHECK (status != 'revoked' OR revoked_by IS NOT NULL)
);

CREATE INDEX idx_peer_permissions_user_id      ON peer_permissions(user_id);
CREATE INDEX idx_peer_permissions_user_active  ON peer_permissions(user_id, status);
CREATE INDEX idx_peer_permissions_last_active  ON peer_permissions(last_active_at);
CREATE INDEX idx_peer_permissions_status       ON peer_permissions(status);

ALTER TABLE peer_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_peer_permissions_read  ON peer_permissions FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_peer_permissions_write ON peer_permissions FOR ALL    TO anon USING (false);
