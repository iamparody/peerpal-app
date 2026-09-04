-- Migration 070: admin_audit_log
-- Tracks who did what, when, to which target, with before/after values for high-risk actions.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  admin_id      UUID         NOT NULL REFERENCES users(id),
  action        TEXT         NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  target_alias  TEXT,
  before_value  TEXT,
  after_value   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx   ON admin_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx     ON admin_audit_log (action);
