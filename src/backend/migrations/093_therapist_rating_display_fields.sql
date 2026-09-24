-- Add display control and Bayesian rating fields to therapist_profiles.
-- show_rating: therapist can opt out of showing their rating publicly.
-- bayesian_average: pre-computed Bayesian-smoothed rating (C=10, mean=3.5).

ALTER TABLE therapist_profiles
  ADD COLUMN IF NOT EXISTS show_rating      BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bayesian_average DECIMAL(5,4)  NOT NULL DEFAULT 0;
