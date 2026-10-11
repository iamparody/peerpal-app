-- Migration 099: Re-engagement notification infrastructure
-- Adds last_reengagement_push_at to users for the 24h cap guard.
-- Adds notification_type enum values for every P3 nudge type.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reengagement_push_at TIMESTAMPTZ NULL;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'streak_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'streak_broken';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dormant_nudge';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'bad_mood_followup';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'session_followup_peer';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'session_followup_therapy';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'unmatched_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ai_dormant';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'credit_zero';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'no_safety_plan';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'low_mood_streak';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'therapist_upsell';
