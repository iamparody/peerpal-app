-- Adds 'therapist' to the user_role enum.
-- Required for therapist profile creation (Phase 19).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'therapist';
