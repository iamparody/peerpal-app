-- Migration 072: Convert group_category ENUM to group_categories lookup table.
-- Allows admins to create, rename, and reorder categories without schema changes.

CREATE TABLE group_categories (
  slug       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0
);

INSERT INTO group_categories (slug, label, sort_order) VALUES
  ('anxiety',        'Anxiety',        1),
  ('depression',     'Depression',     2),
  ('ocd',            'OCD',            3),
  ('adhd',           'ADHD',           4),
  ('grief',          'Grief',          5),
  ('loneliness',     'Loneliness',     6),
  ('stress',         'Stress',         7),
  ('general_support','General Support',8);

-- Add new FK column (nullable first to allow backfill)
ALTER TABLE groups ADD COLUMN category_slug TEXT REFERENCES group_categories(slug);

-- Backfill from the existing ENUM column
UPDATE groups SET category_slug = condition_category::TEXT;

-- Make NOT NULL now that all rows are backfilled
ALTER TABLE groups ALTER COLUMN category_slug SET NOT NULL;

-- Drop old column (also drops idx_groups_category index automatically)
ALTER TABLE groups DROP COLUMN condition_category;

-- Drop the ENUM type (CASCADE removes any lingering implicit casts)
DROP TYPE group_category CASCADE;

-- Replacement index
CREATE INDEX idx_groups_category_slug ON groups (category_slug);
