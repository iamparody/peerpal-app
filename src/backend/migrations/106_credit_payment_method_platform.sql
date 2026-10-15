-- utils/creditDeductor.js records platform debits/refunds with payment_method = 'platform'
-- (since f323aea, 2026-10-03), but the enum only had mpesa|card|bonus. Every deductCredit /
-- refundCredit call failed: peer requests never broadcast, extensions, referrals and therapy
-- booking credit charges failed too. Additive and safe for code that does not use the value.
ALTER TYPE credit_payment_method ADD VALUE IF NOT EXISTS 'platform';
