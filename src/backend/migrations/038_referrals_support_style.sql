-- Adds the intake step 2 selection to referrals: what kind of support feels right.
-- Also adds specific_needs column if missing (was already present — idempotent guard).

ALTER TABLE therapist_referrals
  ADD COLUMN IF NOT EXISTS support_style_preference VARCHAR(60) NULL;
