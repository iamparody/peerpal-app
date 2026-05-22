-- Migration 043: Credit system v2
-- Adds duration_minutes to credit_transactions, extends enum types for refund/ai/referral channels

ALTER TYPE credit_tx_type ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'ai';
ALTER TYPE credit_tx_channel ADD VALUE IF NOT EXISTS 'referral';

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NULL;
