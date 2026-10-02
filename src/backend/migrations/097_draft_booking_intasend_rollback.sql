-- Rollback 097
ALTER TABLE therapist_bookings DROP COLUMN IF EXISTS slot_lock_id;
ALTER TABLE therapist_bookings DROP COLUMN IF EXISTS expires_at;

ALTER TABLE therapist_bookings DROP CONSTRAINT IF EXISTS therapist_bookings_status_check;
ALTER TABLE therapist_bookings ADD CONSTRAINT therapist_bookings_status_check
  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','therapist_no_show','member_no_show'));
