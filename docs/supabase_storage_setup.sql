-- Supabase Storage: therapist-docs bucket setup
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- After creating the bucket manually in Storage → New bucket (name: therapist-docs, Public: OFF)

-- ── RLS policies ─────────────────────────────────────────────────────────────
-- The backend always uses the service_role key for all storage operations.
-- No client-side direct access is permitted at any time.
-- These policies enforce that only the service_role can read or write this bucket.

-- Allow service_role full access (backend upload + admin signed URL generation)
CREATE POLICY "service_role_full_access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'therapists-docs')
WITH CHECK (bucket_id = 'therapists-docs');

-- Deny all other roles explicitly (defence in depth)
CREATE POLICY "deny_all_non_service_role"
ON storage.objects FOR ALL
TO authenticated, anon
USING (bucket_id != 'therapists-docs');

-- ── Verify ───────────────────────────────────────────────────────────────────
-- After applying, confirm:
--   SELECT policyname, roles, cmd FROM pg_policies
--   WHERE tablename = 'objects' AND schemaname = 'storage';
-- You should see service_role_full_access with ALL command.
-- No public URL should ever be generated — bucket must remain private.
