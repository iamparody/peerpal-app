-- Add outcome column to therapy_disputes for admin resolution tracking
ALTER TABLE therapy_disputes ADD COLUMN IF NOT EXISTS outcome TEXT;
