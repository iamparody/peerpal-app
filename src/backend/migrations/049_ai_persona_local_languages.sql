-- Expand AI persona language options to include local Kenyan languages (Phase AI.2)
-- Drops the existing CHECK constraint and replaces it with a wider one.

ALTER TABLE ai_personas
  DROP CONSTRAINT IF EXISTS ai_personas_language_check;

ALTER TABLE ai_personas
  ADD CONSTRAINT ai_personas_language_check
    CHECK (language IN ('english', 'swahili', 'sheng', 'kikuyu', 'luo', 'kamba', 'kalenjin'));
