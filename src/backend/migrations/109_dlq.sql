-- Phase 52.10: Dead-letter queue for push and email jobs
-- Captures BullMQ jobs that exhausted all Redis-level retries.
-- dlqRetryJob.js polls this table and retries with exponential backoff.

CREATE TABLE IF NOT EXISTS dlq_jobs (
  id               BIGSERIAL PRIMARY KEY,
  job_type         TEXT        NOT NULL,                  -- 'push' | 'email'
  payload          JSONB       NOT NULL,
  attempts         INT         NOT NULL DEFAULT 0,
  max_attempts     INT         NOT NULL DEFAULT 3,
  last_attempted_at TIMESTAMPTZ,
  next_retry_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'succeeded' | 'dead'
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_pending
  ON dlq_jobs (next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dlq_job_type
  ON dlq_jobs (job_type, status);
