-- 054_topics.sql
-- Requester-facing situation categories. Labels are situation-based (not diagnosis-based).
-- required_permission_id: the permission a peer must hold to receive this request type.
-- secondary_permission_id: fallback permission if no primary peers are available after 5 min.
-- confidence_keywords: used by the routing engine to classify free-text topic descriptions.

CREATE TABLE topics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    VARCHAR(100) UNIQUE NOT NULL,
  label                   VARCHAR(300) NOT NULL,
  required_permission_id  UUID REFERENCES permissions(id),
  secondary_permission_id UUID REFERENCES permissions(id),
  confidence_keywords     TEXT[] NOT NULL DEFAULT '{}',
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_topics_slug                      ON topics(slug);
CREATE INDEX idx_topics_required_permission_id    ON topics(required_permission_id);
CREATE INDEX idx_topics_active                    ON topics(is_active);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon_topics_read  ON topics FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_topics_write ON topics FOR ALL    TO anon USING (false);
