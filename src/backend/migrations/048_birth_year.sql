-- 048_birth_year.sql
-- Stores birth year to enforce 18+ age requirement at onboarding consent.
-- Only the year is kept (not full DOB) to minimise PII stored.
-- birth_month is collected on the frontend for an accurate age check
-- but is discarded server-side after validation.

ALTER TABLE users ADD COLUMN birth_year SMALLINT NULL;
