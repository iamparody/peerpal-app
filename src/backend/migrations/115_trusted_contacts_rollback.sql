-- Rollback 115: Trusted Contacts
-- Note: ALTER TYPE ADD VALUE cannot be rolled back in Postgres without dropping
-- the enum entirely. The 4 new notification_type values are left in place —
-- they are unused once the table is dropped and cause no harm.

DROP TABLE IF EXISTS trusted_contacts;
