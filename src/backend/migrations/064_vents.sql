-- Vent records: private pressure-valve text, separate from journals.
-- 90-day retention policy: purge_after computed at insert time.
-- Raw content never enters escalation logs (see routes/vents.js).
CREATE TABLE IF NOT EXISTS vents (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  risk_flagged BOOLEAN NOT NULL DEFAULT false,
  purge_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vents_user_id    ON vents (user_id);
CREATE INDEX IF NOT EXISTS idx_vents_purge_after ON vents (purge_after);

-- RLS: users see only their own vents. Admins access via backend service role only.
ALTER TABLE vents ENABLE ROW LEVEL SECURITY;

CREATE POLICY vents_user_select ON vents FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY vents_user_insert ON vents FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
