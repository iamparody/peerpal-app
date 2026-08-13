-- Persistent routing schedule so escalations survive server restarts / sleep cycles.
ALTER TABLE peer_requests
  ADD COLUMN IF NOT EXISTS broaden_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalate_at TIMESTAMPTZ;

-- Backfill any existing open requests that lack timestamps
UPDATE peer_requests
SET
  broaden_at  = COALESCE(broaden_at,  created_at + INTERVAL '5 minutes'),
  escalate_at = COALESCE(escalate_at, created_at + INTERVAL '8 minutes')
WHERE status = 'open' AND (broaden_at IS NULL OR escalate_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_peer_requests_broaden
  ON peer_requests (broaden_at)
  WHERE status = 'open' AND broaden_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_peer_requests_escalate
  ON peer_requests (escalate_at)
  WHERE status = 'open' AND escalate_at IS NOT NULL;
