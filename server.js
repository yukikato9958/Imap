
const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const sessions = new Map();

function auth(req, res, next) {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = sessions.get(key);

  if (!s) {
    return res.status(401).json({
      error: 'Sesi tidak valid. Login ulang.'
    });
  }

  req.mail = s;
  next();
}

function createImapClient(options) {
  return new ImapFlow({
    ...options,
    logger: false,
    tls: {
      rejectUnauthorized: true,
      ciphers: 'DEFAULT@SECLEVEL=1'
    }
  });
}

app.get('/health', (req, res) => res.send('OK'));

app.get('/api/providers', (req, res) => {
  res.json({ message: 'Provider preset tersedia di frontend.' });
});

app.post('/api/login', async (req, res) => {
  const {
    email,
    password,
    imapHost,
    imapPort = 993,
    imapSecure = true,
    smtpHost,
    smtpPort = 465,
    smtpSecure = true
  } = req.body || {};

  if (!email || !password || !imapHost || !smtpHost) {
    return res.status(400).json({
      error: 'Email, password, IMAP dan SMTP wajib diisi.'
    });
  }

  const client = createImapClient({
    host: imapHost,
    port: Number(imapPort),
    secure: Boolean(imapSecure),
    auth: { user: email, pass: password }
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    lock.release();

    await client.logout();

    const token = crypto.randomBytes(32).toString('hex');

    sessions.set(token, {
      email,
      password,
      imapHost,
      imapPort: Number(imapPort),
      imapSecure: Boolean(imapSecure),
      smtpHost,
      smtpPort: Number(smtpPort),
      smtpSecure: Boolean(smtpSecure)
    });

    res.json({ token, email });
  } catch (e) {
    try {
      await client.logout();
    } catch {}

    res.status(400).json({
      error: 'Login IMAP gagal: ' + (e.message || 'periksa server, password, dan akses IMAP')
    });
  }
});

app.get('/api/inbox', auth, async (req, res) => {
  const s = req.mail;

  const client = createImapClient({
    host: s.imapHost,
    port: s.imapPort,
    secure: s.imapSecure,
    auth: { user: s.email, pass: s.password }
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    const messages = [];

    try {
      const status = await client.status('INBOX', {
        messages: true
      });

      const start = Math.max(1, (status.messages || 0) - 49);

      for await (const m of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true
      })) {
        messages.push({
          uid: m.uid,
          subject: m.envelope?.subject || '(Tanpa subjek)',
          from: m.envelope?.from?.map(x => x.name || x.address).join(', ') || '',
          date: m.internalDate,
          flags: [...(m.flags || [])]
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();

    res.json({ messages: messages.reverse() });
  } catch (e) {
    try {
      await client.logout();
    } catch {}

    res.status(500).json({ error: e.message });
  }
});

app.get('/api/message/:uid', auth, async (req, res) => {
  const s = req.mail;

  const client = createImapClient({
    host: s.imapHost,
    port: s.imapPort,
    secure: s.imapSecure,
    auth: { user: s.email, pass: s.password }
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    let result = null;

    try {
      for await (const m of client.fetch(String(req.params.uid), {
        uid: true,
        envelope: true,
        source: true
      })) {
        result = {
          uid: m.uid,
          envelope: m.envelope,
          source: m.source?.toString('utf8') || ''
        };
        break;
      }
    } finally {
      lock.release();
    }

    await client.logout();

    if (!result) {
      return res.status(404).json({
        error: 'Email tidak ditemukan'
      });
    }

    res.json(result);
  } catch (e) {
    try {
      await client.logout();
    } catch {}

    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send', auth, async (req, res) => {
  const s = req.mail;
  const { to, subject = '', text = '' } = req.body || {};

  if (!to) {
    return res.status(400).json({
      error: 'Alamat penerima wajib diisi'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpSecure,
      auth: {
        user: s.email,
        pass: s.password
      }
    });

    const info = await transporter.sendMail({
      from: s.email,
      to,
      subject,
      text
    });

    res.json({
      ok: true,
      messageId: info.messageId
    });
  } catch (e) {
    res.status(500).json({
      error: 'SMTP gagal: ' + e.message
    });
  }
});

app.post('/api/logout', auth, (req, res) => {
  for (const [k, v] of sessions) {
    if (v === req.mail) sessions.delete(k);
  }

  res.json({ ok: true });
});

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log('Japan Mail berjalan di port ' + port);
});
