-- Phase 37 teardown: therapist_referrals (old referral flow) replaced by therapist_bookings.
-- Also drops the custom enum types created in migration 020.
DROP TABLE IF EXISTS therapist_referrals CASCADE;
DROP TYPE IF EXISTS referral_preferred_time;
DROP TYPE IF EXISTS referral_contact_method;
DROP TYPE IF EXISTS referral_status;
