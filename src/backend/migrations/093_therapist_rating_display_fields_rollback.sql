ALTER TABLE therapist_profiles
  DROP COLUMN IF EXISTS show_rating,
  DROP COLUMN IF EXISTS bayesian_average;
