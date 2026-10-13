-- Enable RLS on waitlist_signups.
-- The backend writes and reads via a direct pg connection (service role),
-- which bypasses RLS entirely — no policies needed.
-- This blocks any direct Supabase client (anon/authenticated JWT) from
-- reading or writing the table, which is the correct posture for PII.

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
