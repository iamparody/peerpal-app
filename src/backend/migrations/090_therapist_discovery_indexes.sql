-- GIN indexes for array-column filtering used in discovery/browse queries.
CREATE INDEX idx_therapist_active_verified ON therapist_profiles (is_active, is_verified);
CREATE INDEX idx_therapist_categories      ON therapist_profiles USING GIN (category_ids);
CREATE INDEX idx_therapist_formats         ON therapist_profiles USING GIN (session_formats);
CREATE INDEX idx_therapist_languages       ON therapist_profiles USING GIN (languages);
