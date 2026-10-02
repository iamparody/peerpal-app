-- Migration 097: Draft booking model + IntaSend STK push payment support
-- Adds 'draft' status, expires_at, slot_lock_id columns to therapist_bookings

-- 1. Extend status CHECK to include 'draft'
ALTER TABLE therapist_bookings DROP CONSTRAINT IF EXISTS therapist_bookings_status_check;
ALTER TABLE therapist_bookings ADD CONSTRAINT therapist_bookings_status_check
  CHECK (status IN ('draft','pending','confirmed','in_progress','completed','cancelled','therapist_no_show','member_no_show'));

-- 2. Payment window expiry timestamp (set at draft creation, cleared on payment success)
ALTER TABLE therapist_bookings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. Reference to the slot lock held during the payment window
--    ON DELETE SET NULL: if the lock is cleaned up before the booking, the reference is cleared safely
ALTER TABLE therapist_bookings ADD COLUMN IF NOT EXISTS slot_lock_id UUID
  REFERENCES booking_slot_locks(id) ON DELETE SET NULL;
