-- kcpa_level was VARCHAR(30) — too short for full KCPA credential titles.
-- e.g. "Licensed Professional Counsellor" is 34 chars. Widen to 100.
ALTER TABLE therapist_profiles
  ALTER COLUMN kcpa_level TYPE VARCHAR(100);
