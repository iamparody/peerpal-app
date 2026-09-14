-- Migration 075: AI pipeline audit tables
--
-- Four tables cover the full OBSERVED → DETECTED_SOURCE → DETECTED → DECIDED → GENERATED pipeline.
-- Observability events (POLICY_DECISION, CRISIS_PATH_INVOKED, CLASSIFIER_FAILURE, etc.)
-- are written to the existing `events` table as structured JSONB — no separate event table needed.
--
-- Backend accesses all tables via service role (bypasses RLS).
-- Enabling RLS alone blocks direct PostgREST access via the anon key.
-- user_id is nullable on all tables: nulled on user data deletion (anonymised), record retained
-- if safety-relevant (same pattern as ai_interactions).

-- ── ai_detected_source ────────────────────────────────────────────────────────
-- Intermediate output of a single classifier before resolver merging.
-- KEYWORD_RISK and CONTEXTUAL_RISK = Section 3 risk classifiers.
-- CONVERSATIONAL_STATE = Section 4 conversational-state detector.
-- Records are joined to canonical ai_detected via (session_id, observed_ref).

CREATE TABLE ai_detected_source (
  source_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id          UUID         NULL     REFERENCES users(id)    ON DELETE SET NULL,
  observed_ref     UUID         NOT NULL,  -- ID of source record (mood, journal, session message)
  source_type      VARCHAR(30)  NOT NULL
                     CHECK (source_type IN ('KEYWORD_RISK', 'CONTEXTUAL_RISK', 'CONVERSATIONAL_STATE')),
  detector_version VARCHAR(100) NOT NULL,  -- version-pinned: e.g. "keyword-classifier@1.0.0"
  detected_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  payload          JSONB        NOT NULL,  -- Full DETECTED_SOURCE record per schemas.js
  schema_version   VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  retention_flag        BOOLEAN      NOT NULL DEFAULT true,
  scheduled_deletion_at TIMESTAMPTZ  NULL
);

CREATE INDEX idx_ai_detected_source_session  ON ai_detected_source (session_id, detected_at DESC);
CREATE INDEX idx_ai_detected_source_observed ON ai_detected_source (observed_ref);

ALTER TABLE ai_detected_source ENABLE ROW LEVEL SECURITY;


-- ── ai_detected ───────────────────────────────────────────────────────────────
-- Canonical DETECTED record assembled by the resolver from ai_detected_source records.
-- Immutable after write. This is what the policy engine reads.
-- DetectedField columns (risk_signal, support_need, urgency, expressed_emotion) are stored as
-- JSONB because they carry per-field metadata (confidence, uncertainty_flag, provenance,
-- detector_version, created_at) that does not map cleanly to flat columns.

CREATE TABLE ai_detected (
  detection_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id           UUID         NULL     REFERENCES users(id)    ON DELETE SET NULL,
  observed_ref      UUID         NOT NULL,
  detector_id       VARCHAR(100) NOT NULL,  -- assembly component version: "resolver@1.0.0"
  detected_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  risk_signal       JSONB        NOT NULL,  -- DetectedField<RiskSignal>
  support_need      JSONB        NOT NULL,  -- DetectedField<SupportNeed>
  urgency           JSONB        NOT NULL,  -- DetectedField<Urgency>
  expressed_emotion JSONB        NULL,      -- DetectedField<ExpressedEmotion> | null
  reason_code       VARCHAR(50)  NOT NULL,
  schema_version    VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  retention_flag        BOOLEAN      NOT NULL DEFAULT true,
  scheduled_deletion_at TIMESTAMPTZ  NULL
);

CREATE INDEX idx_ai_detected_session  ON ai_detected (session_id, detected_at DESC);
CREATE INDEX idx_ai_detected_user     ON ai_detected (user_id) WHERE user_id IS NOT NULL;
-- Partial index for safety monitoring: quickly find ELEVATED and CRITICAL detections
CREATE INDEX idx_ai_detected_risk_elevated ON ai_detected ((risk_signal->>'value'))
  WHERE risk_signal->>'value' IN ('ELEVATED', 'CRITICAL');

ALTER TABLE ai_detected ENABLE ROW LEVEL SECURITY;


-- ── ai_decided ────────────────────────────────────────────────────────────────
-- Deterministic policy engine output. Immutable after write.
-- CHECK constraints mirror the Zod enums in schemas.js — both must stay in sync.
-- No user-generated content in this table; retention_flag not needed.

CREATE TABLE ai_decided (
  decision_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id               UUID         NULL     REFERENCES users(id)    ON DELETE SET NULL,
  detection_ref         UUID         NOT NULL REFERENCES ai_detected(detection_id) ON DELETE CASCADE,
  policy_version        VARCHAR(20)  NOT NULL,
  decided_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  upstream_uncertainty  BOOLEAN      NOT NULL,
  strategy              VARCHAR(30)  NOT NULL
                          CHECK (strategy IN (
                            'OPEN_SUPPORT', 'VALIDATION_FOCUS', 'PSYCHOEDUCATION',
                            'GUIDED_EXERCISE', 'SAFETY_HOLD', 'CRISIS_RESPONSE'
                          )),
  question_limit        SMALLINT     NOT NULL CHECK (question_limit BETWEEN 0 AND 5),
  must_validate         BOOLEAN      NOT NULL,
  may_suggest_exercises BOOLEAN      NOT NULL,
  max_response_length   INTEGER      NOT NULL CHECK (max_response_length > 0),
  escalation_action     VARCHAR(30)  NOT NULL
                          CHECK (escalation_action IN (
                            'NONE', 'SURFACE_RESOURCES', 'ESCALATE_TO_HUMAN', 'DETERMINISTIC_CRISIS'
                          )),
  reason_code           VARCHAR(50)  NOT NULL,
  schema_version        VARCHAR(20)  NOT NULL DEFAULT '1.0.0'
);

CREATE INDEX idx_ai_decided_session    ON ai_decided (session_id, decided_at DESC);
CREATE INDEX idx_ai_decided_detection  ON ai_decided (detection_ref);
-- Partial index for safety monitoring and audit: exclude routine NONE decisions
CREATE INDEX idx_ai_decided_escalation ON ai_decided (escalation_action, decided_at DESC)
  WHERE escalation_action != 'NONE';

ALTER TABLE ai_decided ENABLE ROW LEVEL SECURITY;


-- ── ai_generated ──────────────────────────────────────────────────────────────
-- LLM output produced within the constraints of DECIDED.
-- FAILED records are never delivered to users but are retained for safety audit.
-- flagged = true marks records escalated for human review (mirrors ai_interactions pattern).

CREATE TABLE ai_generated (
  generation_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id           UUID         NULL     REFERENCES users(id)    ON DELETE SET NULL,
  decision_ref      UUID         NOT NULL REFERENCES ai_decided(decision_id) ON DELETE CASCADE,
  model_id          VARCHAR(100) NOT NULL,  -- version-pinned: e.g. "groq/llama-3.3-70b@1.0.0"
  generated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  content           TEXT         NOT NULL,
  validation_status VARCHAR(20)  NOT NULL
                      CHECK (validation_status IN ('PASSED', 'SANITIZED', 'FAILED')),
  violations        JSONB        NOT NULL DEFAULT '[]',
  schema_version    VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  flagged           BOOLEAN      NOT NULL DEFAULT false,
  flag_reason       VARCHAR(100) NULL,
  retention_flag        BOOLEAN      NOT NULL DEFAULT true,
  scheduled_deletion_at TIMESTAMPTZ  NULL
);

CREATE INDEX idx_ai_generated_session   ON ai_generated (session_id, generated_at DESC);
CREATE INDEX idx_ai_generated_decision  ON ai_generated (decision_ref);
-- Partial indexes for safety audit queries
CREATE INDEX idx_ai_generated_non_pass  ON ai_generated (validation_status, generated_at DESC)
  WHERE validation_status IN ('SANITIZED', 'FAILED');
CREATE INDEX idx_ai_generated_flagged   ON ai_generated (flagged, generated_at DESC)
  WHERE flagged = true;

ALTER TABLE ai_generated ENABLE ROW LEVEL SECURITY;
