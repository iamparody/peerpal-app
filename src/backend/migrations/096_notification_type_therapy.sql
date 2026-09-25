-- Add therapy-specific notification types used by therapy routes and jobs
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'therapist_update';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'therapy_booking_confirmed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'therapy_session_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'therapy_dispute_update';
