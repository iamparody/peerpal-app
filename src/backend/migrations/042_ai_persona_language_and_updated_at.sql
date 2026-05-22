-- Adds mutable persona support (Phase 20.1) and language preference (Phase 20.2).
-- language: English / Swahili / Sheng — AI conversation language only, not app UI.
-- updated_at: NULL until first edit; populated by PATCH /api/ai/persona.
ALTER TABLE ai_personas
  ADD COLUMN IF NOT EXISTS language   VARCHAR(20) NOT NULL DEFAULT 'english'
    CHECK (language IN ('english', 'swahili', 'sheng')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
