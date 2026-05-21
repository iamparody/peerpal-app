-- RLS: deny anonymous access to therapist tables (consistent with migration 030).

ALTER TABLE therapist_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapist_interests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'therapist_profiles' AND policyname = 'deny_anon_therapist_profiles'
  ) THEN
    CREATE POLICY deny_anon_therapist_profiles
      ON therapist_profiles FOR ALL TO anon USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'therapist_interests' AND policyname = 'deny_anon_therapist_interests'
  ) THEN
    CREATE POLICY deny_anon_therapist_interests
      ON therapist_interests FOR ALL TO anon USING (false);
  END IF;
END $$;
