ALTER TABLE therapy_session_notes DROP COLUMN IF EXISTS note_type;

-- Restores UNIQUE only if no duplicate booking_id rows exist.
ALTER TABLE therapy_session_notes
  ADD CONSTRAINT therapy_session_notes_booking_id_key UNIQUE (booking_id);
