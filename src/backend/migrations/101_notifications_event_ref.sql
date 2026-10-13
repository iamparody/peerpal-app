-- Add event_ref to notifications for idempotent push delivery.
-- The UNIQUE index means the INSERT itself is the atomic claim —
-- a duplicate job run fails with a unique violation, not a double-send.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_ref VARCHAR(100) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_user_type_event
  ON notifications (user_id, type, event_ref)
  WHERE event_ref IS NOT NULL;
