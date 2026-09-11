/*
# Add permissive RLS policies for site_settings, submissions, sessions

## Purpose
The Express server connects to Supabase using the anon key (the only key available in this project).
RLS is enabled on all three tables but no policies exist, which means all access is denied by default.
These permissive policies allow the anon role full CRUD access.

## Security Notes
1. The frontend never talks to Supabase directly - all requests go through the Express API.
2. The Express server controls access to all endpoints (admin auth, rate limiting, etc).
3. This is a single-tenant app with no user sign-in, so anon access is intentional.
4. These policies are idempotent - safe to re-run.
*/

-- ── site_settings ──
DROP POLICY IF EXISTS "anon_all_site_settings" ON site_settings;
CREATE POLICY "anon_all_site_settings" ON site_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── submissions ──
DROP POLICY IF EXISTS "anon_all_submissions" ON submissions;
CREATE POLICY "anon_all_submissions" ON submissions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── sessions ──
DROP POLICY IF EXISTS "anon_all_sessions" ON sessions;
CREATE POLICY "anon_all_sessions" ON sessions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);