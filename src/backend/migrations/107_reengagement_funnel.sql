-- Migration 107: Funnel-based re-engagement tracking columns + notification types
-- Tracks where each user is in the onboarding → first session → return funnel.
-- last_reengagement_push_at already added in migration 099 — not repeated here.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_session_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_session_at           TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_step         VARCHAR(30) NOT NULL DEFAULT 'step1_incomplete';

-- Values: step1_incomplete | step2_incomplete | step3_incomplete | converted

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step1';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step2';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step3';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_purchase';
