-- Migration 111: enable RLS on dlq_jobs.
-- dlq_jobs had no RLS, leaving it accessible via PostgREST to any authenticated client.
-- The backend uses a service-role pg connection (bypasses RLS), so no policies are needed —
-- RLS enabled with no policies is deny-all for PostgREST/anon access, which is correct.
ALTER TABLE dlq_jobs ENABLE ROW LEVEL SECURITY;
