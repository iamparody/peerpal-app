CREATE TABLE therapist_availability (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID     NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME     NOT NULL,
  end_time     TIME     NOT NULL,
  is_active    BOOLEAN  NOT NULL DEFAULT true,
  UNIQUE (therapist_id, day_of_week, start_time)
);

CREATE INDEX idx_therapist_availability_therapist ON therapist_availability (therapist_id, day_of_week);

ALTER TABLE therapist_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapist_availability FOR ALL TO anon USING (false);
