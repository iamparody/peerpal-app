-- Note: PostgreSQL does not support removing enum values directly.
-- To rollback: migrate any rows using 'therapy_booking' to 'purchase',
-- recreate the enum without it, and update the column.
-- Left as no-op since enum removal requires a full type recreation.
SELECT 1;
