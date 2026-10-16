-- Migration 107: Funnel-based re-engagement tracking columns + notification types
-- Tracks where each user is in the onboarding → first session → return funnel.
-- last_reengagement_push_at already added in migration 099 — not repeated here.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_session_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_session_at           TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_step         VARCHAR(30) NOT NULL DEFAULT 'step1_incomplete';

-- Values: step1_incomplete | step2_incomplete | step3_incomplete | converted

-- Backfill existing users so they don't receive incorrect step1 nudges after deploy.
-- Order matters: apply most-advanced state last so later rules can override earlier ones.

-- step2: persona created but no session yet
UPDATE users
   SET reengagement_step = 'step2_incomplete'
 WHERE persona_created = true
   AND reengagement_step = 'step1_incomplete';

-- step3: has completed at least one session
UPDATE users
   SET reengagement_step = 'step3_incomplete',
       first_session_completed_at = (
         SELECT MIN(ended_at) FROM sessions
          WHERE sessions.user_id = users.id AND sessions.status = 'completed'
       ),
       last_session_at = (
         SELECT MAX(ended_at) FROM sessions
          WHERE sessions.user_id = users.id AND sessions.status = 'completed'
       )
 WHERE EXISTS (
   SELECT 1 FROM sessions
    WHERE sessions.user_id = users.id AND sessions.status = 'completed'
 )
   AND reengagement_step IN ('step1_incomplete', 'step2_incomplete');

-- converted: has a confirmed credit purchase
UPDATE users
   SET reengagement_step = 'converted'
 WHERE EXISTS (
   SELECT 1 FROM credit_transactions
    WHERE credit_transactions.user_id = users.id
      AND credit_transactions.type = 'purchase'
      AND credit_transactions.status = 'confirmed'
 )
   AND reengagement_step != 'converted';

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step1';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step2';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_step3';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reengagement_purchase';
