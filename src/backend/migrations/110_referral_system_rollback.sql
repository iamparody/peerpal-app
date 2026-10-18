-- Rollback 108. Enum values cannot be dropped in Postgres; 'referral_reward' and
-- 'referral_reward_credited' stay as unused labels (same approach as 104/107 rollbacks).
-- Credits already awarded stay in credits.balance; their ledger rows stay in credit_transactions.
DROP TABLE IF EXISTS referral_rewards;
ALTER TABLE users DROP COLUMN IF EXISTS referred_by;
ALTER TABLE users DROP COLUMN IF EXISTS referral_code;
