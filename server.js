
const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const sessions = new Map();

function auth(req, res, next) {
  const session = sessions.get(req.headers.authorization || '');
  if (!session) return res.status(401).json({ error: 'Login ulang.' });
  req.mail = session;
  next();
}

app.get('/health', (req, res) => res.send('OK'));

app.post('/api/login', async (req, res) => {
  const { email, password, imapHost, imapPort = 993, smtpHost, smtpPort = 465 } = req.body;

  if (!email || !password || !imapHost)
    return res.status(400).json({ error: 'Data login wajib diisi.' });

  const client = new ImapFlow({
    host: imapHost,
    port: Number(imapPort),
    secure: Number(imapPort) === 993,
    auth: { user: email, pass: password },
    logger: false
  });

  try {
    await client.connect();
    await client.logout();

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      email, password, imapHost,
      imapPort: Number(imapPort),
      smtpHost, smtpPort: Number(smtpPort)
    });

    res.json({ token, email });
  } catch (error) {
    res.status(400).json({ error: 'IMAP gagal: ' + error.message });
  }
});

app.get('/api/inbox', auth, async (req, res) => {
  const mail = req.mail;
  const client = new ImapFlow({
    host: mail.imapHost,
    port: mail.imapPort,
    secure: mail.imapPort === 993,
    auth: { user: mail.email, pass: mail.password },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = [];
      const total = client.mailbox.exists || 0;
      const start = Math.max(1, total - 29);

      for (let seq = start; seq <= total; seq++) {
        for await (const msg of client.fetch(seq, {
          envelope: true, uid: true
        })) {
          messages.push({
            uid: msg.uid,
            subject: msg.envelope?.subject || '(Tanpa subjek)',
            from: msg.envelope?.from?.map(x => x.name || x.address).join(', ') || '',
            date: msg.envelope?.date
          });
        }
      }

      res.json({ total, messages: messages.reverse() });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send', auth, async (req, res) => {
  const { to, subject, text } = req.body;
  const mail = req.mail;

  if (!to || !subject || !text)
    return res.status(400).json({ error: 'Isi email wajib.' });

  if (!mail.smtpHost)
    return res.status(400).json({ error: 'SMTP host wajib.' });

  try {
    const transporter = nodemailer.createTransport({
      host: mail.smtpHost,
      port: mail.smtpPort,
      secure: mail.smtpPort === 465,
      auth: { user: mail.email, pass: mail.password }
    });

    const info = await transporter.sendMail({
      from: mail.email, to, subject, text
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (error) {
    res.status(500).json({ error: 'SMTP gagal: ' + error.message });
  }
});

app.post('/api/logout', auth, (req, res) => {
  sessions.delete(req.headers.authorization);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log('Japan Mail berjalan di port ' + port);
});
