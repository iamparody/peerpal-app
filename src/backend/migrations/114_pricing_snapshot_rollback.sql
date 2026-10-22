-- Rollback for migration 114
ALTER TABLE therapist_bookings
  DROP COLUMN IF EXISTS therapist_rate_kes,
  DROP COLUMN IF EXISTS client_charge_kes,
  DROP COLUMN IF EXISTS fee_rate_bps;
