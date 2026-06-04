-- 047_ai_memories_peer_reports.sql
-- AI conversation memory: stores per-session summaries for personalised recall.
-- Peer reports: lets users report peer misbehaviour after a session.

-- ── ai_memories ──────────────────────────────────────────────────────────────
CREATE TABLE ai_memories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  summary      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_memories_user_created ON ai_memories(user_id, created_at DESC);

ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_ai_memories_read  ON ai_memories FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_ai_memories_write ON ai_memories FOR ALL    TO anon USING (false);

-- ── peer_reports ──────────────────────────────────────────────────────────────
CREATE TABLE peer_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  peer_alias   VARCHAR(50),
  channel      VARCHAR(20),
  description  TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'open'
                 CHECK (status IN ('open', 'reviewed', 'resolved')),
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_peer_reports_status ON peer_reports(status, created_at DESC);

ALTER TABLE peer_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_peer_reports_read  ON peer_reports FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_peer_reports_write ON peer_reports FOR ALL    TO anon USING (false);
