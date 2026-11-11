
const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
const sessions = new Map();

function safeError(err) {
  return {
    message: err?.message || String(err),
    code: err?.code || null,
    response: err?.response || null,
    responseCode: err?.responseCode || null,
    command: err?.command || null
  };
}

function getSession(req) {
  const id = req.headers['x-session-id'] || req.body?.sessionId;
  return id ? sessions.get(id) : null;
}

app.get('/health', (_req, res) =>
  res.json({ ok: true, app: 'Danke Mail' })
);

app.get('/api/providers', (_req, res) => {
  try {
    res.json(require('./public/providers.js'));
  } catch (_e) {
    res.json([]);
  }
});

app.post('/api/login', async (req, res) => {
  const { host, port = 993, secure = true, username, password } = req.body || {};

  if (!host || !username || !password) {
    return res.status(400).json({
      error: 'Host, username, and password are required.'
    });
  }

  const client = new ImapFlow({
    host,
    port: Number(port),
    secure: Boolean(secure),
    auth: { user: username, pass: password },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      ciphers: 'DEFAULT@SECLEVEL=0',
      minDHSize: 512
    },
    socketTimeout: 30000
  });

  try {
    await client.connect();

    const sessionId =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    sessions.set(sessionId, { client, username, host });

    res.json({ ok: true, sessionId, username, host });

  } catch (err) {
    try { client.close(); } catch (_e) {}

    console.error('IMAP LOGIN ERROR:', safeError(err));

    res.status(401).json({
      error: 'IMAP login failed',
      details: safeError(err)
    });
  }
});

app.get('/api/folders', async (req, res) => {
  const session = getSession(req);

  if (!session)
    return res.status(401).json({ error: 'Not logged in' });

  try {
    const folders = await session.client.list();

    res.json(folders.map(f => ({
      name: f.name,
      path: f.path,
      delimiter: f.delimiter,
      specialUse: f.specialUse || null
    })));

  } catch (err) {
    console.error('FOLDER LIST ERROR:', safeError(err));

    res.status(500).json({
      error: 'Could not load folders',
      details: safeError(err)
    });
  }
});

app.get('/api/inbox', async (req, res) => {
  const session = getSession(req);

  if (!session)
    return res.status(401).json({ error: 'Not logged in' });

  const folder = req.query.folder || 'INBOX';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  try {
    const lock = await session.client.getMailboxLock(folder);

    try {
      const mailbox = session.client.mailbox;
      const total = mailbox?.exists || 0;

      const start = Math.max(1, total - (page * limit) + 1);
      const end = Math.max(0, total - ((page - 1) * limit));

      if (!total || end < start) {
        return res.json({ messages: [], total, page, limit });
      }

      const messages = [];

      for await (const msg of session.client.fetch(
        `${start}:${end}`,
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true
        }
      )) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || '(No subject)',
          from: msg.envelope?.from?.map(x =>
            x.name ? `${x.name} <${x.address}>` : x.address
          ).join(', ') || '',
          to: msg.envelope?.to?.map(x => x.address).join(', ') || '',
          date: msg.internalDate,
          flags: [...(msg.flags || [])],
          size: msg.size
        });
      }

      messages.sort((a, b) => b.uid - a.uid);

      res.json({ messages, total, page, limit });

    } finally {
      lock.release();
    }

  } catch (err) {
    console.error('INBOX ERROR:', safeError(err));

    res.status(500).json({
      error: 'Could not load messages',
      details: safeError(err)
    });
  }
});

app.get('/api/message/:uid', async (req, res) => {
  const session = getSession(req);

  if (!session)
    return res.status(401).json({ error: 'Not logged in' });

  const folder = req.query.folder || 'INBOX';

  try {
    const lock = await session.client.getMailboxLock(folder);

    try {
      const msg = await session.client.fetchOne(
        Number(req.params.uid),
        {
          uid: true,
          source: true,
          envelope: true,
          flags: true,
          internalDate: true
        },
        { uid: true }
      );

      if (!msg)
        return res.status(404).json({ error: 'Message not found' });

      const parsed = await simpleParser(msg.source);

      res.json({
        uid: msg.uid,
        subject: parsed.subject || '(No subject)',
        from: parsed.from?.text || '',
        to: parsed.to?.text || '',
        date: parsed.date || msg.internalDate,
        text: parsed.text || '',
        html: parsed.html || '',
        attachments: (parsed.attachments || []).map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size
        }))
      });

    } finally {
      lock.release();
    }

  } catch (err) {
    console.error('MESSAGE ERROR:', safeError(err));

    res.status(500).json({
      error: 'Could not open message',
      details: safeError(err)
    });
  }
});

app.post('/api/send', async (req, res) => {
  const session = getSession(req);

  if (!session)
    return res.status(401).json({ error: 'Not logged in' });

  const { to, subject, text, html } = req.body || {};

  if (!to)
    return res.status(400).json({ error: 'Recipient is required' });

  const transporter = nodemailer.createTransport({
    host: req.body.smtpHost,
    port: Number(req.body.smtpPort || 465),
    secure: req.body.smtpSecure !== false,
    auth: {
      user: session.username,
      pass: req.body.password
    },
    tls: { rejectUnauthorized: true }
  });

  try {
    const info = await transporter.sendMail({
      from: session.username,
      to,
      subject: subject || '',
      text: text || '',
      html: html || undefined
    });

    res.json({ ok: true, messageId: info.messageId });

  } catch (err) {
    console.error('SMTP SEND ERROR:', safeError(err));

    res.status(500).json({
      error: 'SMTP send failed',
      details: safeError(err)
    });
  }
});

app.post('/api/logout', async (req, res) => {
  const session = getSession(req);

  if (session) {
    sessions.delete(
      req.headers['x-session-id'] || req.body?.sessionId
    );

    try {
      await session.client.logout();
    } catch (_e) {
      try { session.client.close(); } catch (_e2) {}
    }
  }

  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Danke Mail running on port ${PORT}`);
});
