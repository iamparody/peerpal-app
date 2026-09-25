-- Add therapy_booking to credit_tx_channel enum
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'therapy_booking';
