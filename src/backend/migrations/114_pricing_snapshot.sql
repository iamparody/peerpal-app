-- Migration 114: additive pricing snapshot columns on therapist_bookings.
--
-- Adds three columns that make the pricing contract explicit and auditable.
-- rate_kes is retained unchanged (expand-and-contract; retire in a later migration).
--
-- therapist_rate_kes  — the therapist's advertised rate at booking time (60-min base)
-- client_charge_kes   — what the client was charged (= therapist_rate_kes under current policy)
-- fee_rate_bps        — fee rate in basis points applied at booking time (2000 = 20%)
--
-- Backfill strategy:
--   client_charge_kes = rate_kes (they are equal under all historic bookings)
--   therapist_rate_kes = rate_kes (same reason)
--   fee_rate_bps derived from actual stored amounts:
--     ROUND(platform_fee_kes::numeric / NULLIF(rate_kes, 0) * 10000)
--   This preserves actual historical amounts without manufacturing certainty.
--   Rows with rate_kes = 0 (none expected, defensive) get fee_rate_bps = NULL.

ALTER TABLE therapist_bookings
  ADD COLUMN IF NOT EXISTS therapist_rate_kes  INTEGER,
  ADD COLUMN IF NOT EXISTS client_charge_kes   INTEGER,
  ADD COLUMN IF NOT EXISTS fee_rate_bps        INTEGER;

-- Backfill existing rows
UPDATE therapist_bookings SET
  therapist_rate_kes = rate_kes,
  client_charge_kes  = rate_kes,
  fee_rate_bps       = ROUND(platform_fee_kes::numeric / NULLIF(rate_kes, 0) * 10000)::INTEGER
WHERE therapist_rate_kes IS NULL;

-- Make non-nullable for new rows going forward (existing rows now all have values)
ALTER TABLE therapist_bookings
  ALTER COLUMN therapist_rate_kes SET NOT NULL,
  ALTER COLUMN client_charge_kes  SET NOT NULL;
-- fee_rate_bps left nullable: NULL means "historic, rate uncertain" (defensive for edge cases)
