-- Rollback 111: disable RLS on dlq_jobs.
ALTER TABLE dlq_jobs DISABLE ROW LEVEL SECURITY;
