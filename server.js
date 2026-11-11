const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const sessions = new Map();

function auth(req, res, next) {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(key);
  if (!session) return res.status(401).json({ error: 'Sesi tidak valid. Login ulang.' });
  req.mail = session;
  next();
}

function createImapClient(s) {
  return new ImapFlow({
    host: s.imapHost,
    port: Number(s.imapPort),
    secure: Boolean(s.imapSecure),
    auth: { user: s.email, pass: s.password },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      ciphers: 'DEFAULT@SECLEVEL=1'
    }
  });
}

function safeFolder(value) {
  if (typeof value !== 'string' || !value.trim()) return 'INBOX';
  if (value.length > 500 || /[\r\n\0]/.test(value)) return 'INBOX';
  return value;
}

async function withImap(session, work) {
  const client = createImapClient(session);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    return await work(client);
  } finally {
    if (connected) {
      try { await client.logout(); } catch {}
    }
  }
}

app.get('/health', (req, res) => res.send('OK'));
app.get('/api/providers', (req, res) => res.json({ message: 'Provider preset tersedia di frontend.' }));

app.post('/api/login', async (req, res) => {
  const {
    email, password, imapHost, imapPort = 993, imapSecure = true,
    smtpHost, smtpPort = 465, smtpSecure = true
  } = req.body || {};

  if (!email || !password || !imapHost || !smtpHost) {
    return res.status(400).json({ error: 'Email, password, IMAP dan SMTP wajib diisi.' });
  }

  const session = {
    email, password, imapHost, imapPort: Number(imapPort),
    imapSecure: Boolean(imapSecure), smtpHost,
    smtpPort: Number(smtpPort), smtpSecure: Boolean(smtpSecure)
  };

  try {
    await withImap(session, async client => {
      const lock = await client.getMailboxLock('INBOX');
      lock.release();
    });

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, session);
    res.json({ token, email });
  } catch (e) {
    res.status(400).json({ error: 'Login IMAP gagal: ' + (e.message || 'periksa server, password, dan akses IMAP') });
  }
});

app.get('/api/folders', auth, async (req, res) => {
  try {
    const folders = await withImap(req.mail, async client => {
      const list = await client.list();
      return list.map(folder => ({
        path: folder.path,
        name: folder.name || folder.path,
        specialUse: folder.specialUse || null,
        delimiter: folder.delimiter || '/'
      }));
    });
    res.json({ folders });
  } catch (e) {
    res.status(500).json({ error: 'Gagal membaca folder: ' + e.message });
  }
});

app.get('/api/inbox', auth, async (req, res) => {
  const folder = safeFolder(req.query.folder);
  try {
    const messages = await withImap(req.mail, async client => {
      const lock = await client.getMailboxLock(folder);
      const output = [];
      try {
        const status = await client.status(folder, { messages: true });
        const total = Number(status.messages || 0);
        if (total > 0) {
          const start = Math.max(1, total - 49);
          for await (const m of client.fetch(`${start}:*`, {
            uid: true, envelope: true, flags: true, internalDate: true
          })) {
            output.push({
              uid: m.uid,
              subject: m.envelope?.subject || '(Tanpa subjek)',
              from: m.envelope?.from?.map(x => x.name || x.address).join(', ') || '',
              date: m.internalDate,
              flags: [...(m.flags || [])]
            });
          }
        }
      } finally {
        lock.release();
      }
      return output.reverse();
    });
    res.json({ folder, messages });
  } catch (e) {
    res.status(500).json({ error: 'Gagal membaca folder ' + folder + ': ' + e.message });
  }
});

app.get('/api/message/:uid', auth, async (req, res) => {
  const folder = safeFolder(req.query.folder);
  const uid = Number(req.params.uid);
  if (!Number.isSafeInteger(uid) || uid < 1) return res.status(400).json({ error: 'UID email tidak valid.' });

  try {
    const message = await withImap(req.mail, async client => {
      const lock = await client.getMailboxLock(folder);
      try {
        const raw = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!raw || !raw.source) return null;
        const parsed = await simpleParser(raw.source);
        return {
          uid,
          folder,
          subject: parsed.subject || '(Tanpa subjek)',
          from: parsed.from?.text || '',
          to: parsed.to?.text || '',
          date: parsed.date || null,
          text: parsed.text || '(Pesan ini tidak memiliki versi teks.)',
          htmlAvailable: Boolean(parsed.html),
          attachments: (parsed.attachments || []).map(a => ({
            filename: a.filename || 'lampiran',
            contentType: a.contentType,
            size: a.size
          }))
        };
      } finally {
        lock.release();
      }
    });

    if (!message) return res.status(404).json({ error: 'Email tidak ditemukan.' });
    res.json(message);
  } catch (e) {
    res.status(500).json({ error: 'Gagal membuka email: ' + e.message });
  }
});

app.post('/api/send', auth, async (req, res) => {
  const s = req.mail;
  const { to, subject = '', text = '' } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Alamat penerima wajib diisi.' });

  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost, port: s.smtpPort, secure: s.smtpSecure,
      auth: { user: s.email, pass: s.password }
    });
    const info = await transporter.sendMail({ from: s.email, to, subject, text });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ error: 'SMTP gagal: ' + e.message });
  }
});

app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log('Japan Mail berjalan di port ' + port));
    
