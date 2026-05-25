-- 045_user_phone.sql
-- Adds phone number field to users — required for Daraja M-Pesa STK Push.
-- Format: Safaricom Kenya numbers, stored as E.164 without leading + (e.g. 254712345678).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(15) NULL;
