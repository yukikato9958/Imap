
const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const sessions = new Map();

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }

  req.mailSession = session;
  next();
}

function createImapClient(session) {
  return new ImapFlow({
    host: session.imapHost,
    port: Number(session.imapPort),
    secure: session.imapSecure,
    auth: {
      user: session.email,
      pass: session.password
    },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      ciphers: 'DEFAULT@SECLEVEL=0',
      minDHSize: 512
    }
  });
}

function safeFolder(value) {
  if (typeof value !== 'string' || !value.trim()) return 'INBOX';
  return value;
}

async function withImap(session, work) {
  const client = createImapClient(session);

  try {
    await client.connect();
    return await work(client);
  } finally {
    try {
      await client.logout();
    } catch (_) {}
  }
}

function addressList(list) {
  if (!Array.isArray(list)) return '';

  return list.map(x =>
    x.name
      ? `${x.name} <${x.address || ''}>`
      : (x.address || '')
  ).join(', ');
}

function embedInlineImages(html, attachments) {
  let result = html || '';

  for (const file of attachments || []) {
    if (!file.contentId || !file.content) continue;

    const cid = String(file.contentId).replace(/^<|>$/g, '');
    const mime = file.contentType || 'application/octet-stream';
    const data = `data:${mime};base64,${file.content.toString('base64')}`;
    const escapedCid = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    result = result.replace(
      new RegExp(`cid:${escapedCid}`, 'gi'),
      data
    );
  }

  return result;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, app: 'Danke Mail' });
});

app.get('/api/providers', (req, res) => {
  res.json({ ok: true });
});

/* LOGIN */
app.post('/api/login', async (req, res) => {
  const {
    email,
    password,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure
  } = req.body || {};

  if (!email || !password || !imapHost) {
    return res.status(400).json({
      error: 'Email, password and IMAP host are required.'
    });
  }

  const session = {
    email: String(email).trim(),
    password: String(password),
    imapHost: String(imapHost).trim(),
    imapPort: Number(imapPort || 993),
    imapSecure: imapSecure !== false,
    smtpHost: String(smtpHost || '').trim(),
    smtpPort: Number(smtpPort || 465),
    smtpSecure: smtpSecure !== false
  };

  try {
    await withImap(session, async client => {
      const lock = await client.getMailboxLock('INBOX');
      lock.release();
    });

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, session);

    res.json({
      ok: true,
      token,
      email: session.email
    });
  } catch (error) {
    res.status(400).json({
      error: `IMAP login failed: ${error.message}`
    });
  }
});

/* FOLDERS */
app.get('/api/folders', auth, async (req, res) => {
  try {
    const folders = await withImap(req.mailSession, async client => {
      const list = await client.list();

      return list.map(folder => ({
        path: folder.path,
        name: folder.name,
        specialUse: folder.specialUse || '',
        delimiter: folder.delimiter || '/'
      }));
    });

    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* INBOX AND PAGINATION */
app.get('/api/inbox', auth, async (req, res) => {
  const folder = safeFolder(req.query.folder);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

  try {
    const result = await withImap(req.mailSession, async client => {
      const lock = await client.getMailboxLock(folder);

      try {
        const found = await client.search({ all: true }, { uid: true });
        const uids = Array.isArray(found) ? found : [];
        const total = uids.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);

        const end = total - ((safePage - 1) * limit);
        const start = Math.max(0, end - limit);
        const selected = uids.slice(start, end).reverse();

        let messages = [];

        if (selected.length) {
          const fetched = await client.fetchAll(
            selected,
            {
              uid: true,
              envelope: true,
              flags: true,
              internalDate: true
            },
            { uid: true }
          );

          messages = fetched.map(message => {
            const env = message.envelope || {};

            return {
              uid: message.uid,
              from: addressList(env.from),
              to: addressList(env.to),
              subject: env.subject || '(No subject)',
              date: message.internalDate || env.date || null,
              flags: Array.from(message.flags || [])
            };
          }).sort((a, b) => Number(b.uid) - Number(a.uid));
        }

        return {
          folder,
          messages,
          total,
          page: safePage,
          limit,
          totalPages,
          hasPrevious: safePage > 1,
          hasNext: safePage < totalPages
        };
      } finally {
        lock.release();
      }
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* READ MESSAGE */
app.get('/api/message/:uid', auth, async (req, res) => {
  const folder = safeFolder(req.query.folder);
  const uid = String(req.params.uid);

  if (!/^\d+$/.test(uid)) {
    return res.status(400).json({ error: 'Invalid message ID.' });
  }

  try {
    const result = await withImap(req.mailSession, async client => {
      const lock = await client.getMailboxLock(folder);

      try {
        const message = await client.fetchOne(
          uid,
          { uid: true, source: true },
          { uid: true }
        );

        if (!message || !message.source) {
          throw new Error('Message not found.');
        }

        const parsed = await simpleParser(message.source);
        const html = embedInlineImages(parsed.html || '', parsed.attachments);

        return {
          uid: message.uid,
          subject: parsed.subject || '(No subject)',
          from: addressList(parsed.from && parsed.from.value),
          to: addressList(parsed.to && parsed.to.value),
          date: parsed.date || null,
          text: parsed.text || '',
          html,
          attachments: (parsed.attachments || []).map(file => ({
            filename: file.filename || 'attachment',
            contentType: file.contentType,
            size: file.size
          }))
        };
      } finally {
        lock.release();
      }
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* SEND EMAIL */
app.post('/api/send', auth, async (req, res) => {
  const { to, subject, text } = req.body || {};
  const session = req.mailSession;

  if (!to || !session.smtpHost) {
    return res.status(400).json({
      error: 'Recipient and SMTP host are required.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: session.smtpHost,
      port: session.smtpPort,
      secure: session.smtpSecure,
      auth: {
        user: session.email,
        pass: session.password
      }
    });

    const info = await transporter.sendMail({
      from: session.email,
      to,
      subject: subject || '(No subject)',
      text: text || ''
    });

    res.json({
      ok: true,
      messageId: info.messageId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* LOGOUT */
app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});

/* SERVER */
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Danke Mail running on port ${PORT}`);
});
