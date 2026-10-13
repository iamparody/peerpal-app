ALTER TABLE users
  DROP COLUMN IF EXISTS engagement_segment,
  DROP COLUMN IF EXISTS engagement_score;
