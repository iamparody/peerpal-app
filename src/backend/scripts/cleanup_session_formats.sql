-- One-time cleanup: remove 'voice' and 'text' from therapist session_formats.
-- Run manually against production. Verify counts before and after.

-- Preview affected rows:
SELECT id, display_name, session_formats
FROM therapist_profiles
WHERE session_formats && ARRAY['voice','text'];

-- Apply:
UPDATE therapist_profiles
SET session_formats = ARRAY(
  SELECT f FROM unnest(session_formats) AS f
  WHERE f NOT IN ('voice', 'text')
)
WHERE session_formats && ARRAY['voice','text'];
