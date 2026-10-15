-- Postgres cannot drop an enum value. Rolling back means reverting creditDeductor.js to a
-- different payment_method; rows already written with 'platform' must be updated first.
-- Intentionally a no-op.
SELECT 1;
