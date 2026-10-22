-- Allow multiple notes per booking (pre/session/follow_up).
-- Drop inline UNIQUE on booking_id; add note_type discriminator.
ALTER TABLE therapy_session_notes
  DROP CONSTRAINT therapy_session_notes_booking_id_key;

ALTER TABLE therapy_session_notes
  ADD COLUMN note_type VARCHAR(20) NOT NULL DEFAULT 'session'
  CHECK (note_type IN ('pre', 'session', 'follow_up'));
