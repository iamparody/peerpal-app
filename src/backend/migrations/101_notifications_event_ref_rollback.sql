DROP INDEX IF EXISTS uq_notif_user_type_event;
ALTER TABLE notifications DROP COLUMN IF EXISTS event_ref;
