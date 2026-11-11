
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

function createImapClient(config) {
    return new ImapFlow({
        host: config.host,
        port: Number(config.port || 993),
        secure: config.secure !== false,
        auth: {
            user: config.username,
            pass: config.password
        },
        logger: false,
        socketTimeout: 60000,
        tls: {
            rejectUnauthorized: true,
            minDHSize: 512,
            ciphers: 'DEFAULT@SECLEVEL=0'
        }
    });
}

function getSession(req) {
    const id = req.headers['x-session-id'] || req.body?.sessionId;
    return id ? sessions.get(id) : null;
}

async function withImap(config, callback) {
    const client = createImapClient(config);

    await client.connect();

    try {
        return await callback(client);
    } finally {
        try {
            await client.logout();
        } catch (e) {
            // Connection may already be closed.
        }
    }
}

function addressList(list = []) {
    return list.map(x => {
        if (x.name && x.address) {
            return `${x.name} <${x.address}>`;
        }
        return x.address || x.name || '';
    }).filter(Boolean).join(', ');
}

function formatMessage(message, folder) {
    const envelope = message.envelope || {};

    return {
        uid: message.uid,
        folder,
        from: addressList(envelope.from),
        to: addressList(envelope.to),
        subject: envelope.subject || '(No subject)',
        date: message.internalDate || envelope.date || null,
        flags: Array.from(message.flags || [])
    };
}

function isSelectable(mailbox) {
    const flags = mailbox.flags || new Set();
    return !(flags.has && flags.has('\\Noselect'));
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Danke Mail'
    });
});

app.get('/api/providers', (req, res) => {
    res.json({ providers: [] });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const {
        host,
        port,
        secure,
        username,
        password
    } = req.body || {};

    if (!host || !username || !password) {
        return res.status(400).json({
            error: 'Host, username, and password are required.'
        });
    }

    const config = {
        host,
        port: Number(port || 993),
        secure: secure !== false,
        username,
        password
    };

    try {
        await withImap(config, async client => {
            await client.list();
        });

        const sessionId = crypto.randomBytes(32).toString('hex');

        sessions.set(sessionId, config);

        res.json({
            success: true,
            sessionId
        });

    } catch (err) {
        res.status(401).json({
            error: 'IMAP login failed',
            details: {
                message: err.message
            }
        });
    }
});

// AUTHENTICATED FOLDER LIST
app.get('/api/folders', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const folders = await withImap(config, async client => {
            const list = await client.list();

            return list.map(f => ({
                name: f.name,
                path: f.path,
                delimiter: f.delimiter,
                specialUse: f.specialUse || '',
                flags: Array.from(f.flags || [])
            }));
        });

        res.json(folders);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INBOX / FOLDER MESSAGES
app.get('/api/inbox', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const folder = String(req.query.folder || 'INBOX');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const uids = await client.search(
                    { all: true },
                    { uid: true }
                );

                if (!uids || !uids.length) {
                    return { messages: [], total: 0 };
                }

                const total = uids.length;
                const start = Math.max(0, total - page * limit);
                const end = total - (page - 1) * limit;
                const selected = uids.slice(start, end).reverse();

                const messages = await client.fetchAll(
                    selected,
                    {
                        uid: true,
                        envelope: true,
                        flags: true,
                        internalDate: true
                    },
                    { uid: true }
                );

                return {
                    messages: messages.map(m => formatMessage(m, folder)),
                    total
                };

            } finally {
                lock.release();
            }
        });

        res.json(result);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SEARCH ALL MAILBOXES
app.get('/api/search', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const query = String(req.query.q || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

    if (!query) {
        return res.status(400).json({
            error: 'Search query is required'
        });
    }

    if (query.length > 200) {
        return res.status(400).json({
            error: 'Search query is too long'
        });
    }

    try {
        const results = await withImap(config, async client => {
            const mailboxes = await client.list();
            const allResults = [];

            for (const mailbox of mailboxes) {
                if (!isSelectable(mailbox)) continue;

                const folder = mailbox.path;
                let lock;

                try {
                    lock = await client.getMailboxLock(folder);

                    const uids = await client.search(
                        { text: query },
                        { uid: true }
                    );

                    if (!uids || !uids.length) continue;

                    const selected = uids.slice(-limit).reverse();

                    const messages = await client.fetchAll(
                        selected,
                        {
                            uid: true,
                            envelope: true,
                            flags: true,
                            internalDate: true
                        },
                        { uid: true }
                    );

                    for (const message of messages) {
                        allResults.push(formatMessage(message, folder));
                    }

                } catch (err) {
                    // Skip folders that cannot be searched.
                    console.error('Search folder error:', folder, err.message);
                } finally {
                    if (lock) lock.release();
                }
            }

            allResults.sort((a, b) => {
                return new Date(b.date || 0) - new Date(a.date || 0);
            });

            return allResults.slice(0, limit);
        });

        res.json({
            query,
            total: results.length,
            messages: results
        });

    } catch (err) {
        res.status(500).json({
            error: 'Search failed',
            details: { message: err.message }
        });
    }
});

// OPEN MESSAGE
app.get('/api/message/:uid', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const uid = Number(req.params.uid);
    const folder = String(req.query.folder || 'INBOX');

    if (!Number.isSafeInteger(uid) || uid < 1) {
        return res.status(400).json({ error: 'Invalid message UID' });
    }

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const message = await client.fetchOne(
                    uid,
                    { source: true, uid: true },
                    { uid: true }
                );

                if (!message || !message.source) {
                    throw new Error('Message not found');
                }

                const parsed = await simpleParser(message.source);

                return {
                    uid,
                    folder,
                    from: parsed.from?.text || '',
                    to: parsed.to?.text || '',
                    cc: parsed.cc?.text || '',
                    subject: parsed.subject || '(No subject)',
                    date: parsed.date || null,
                    text: parsed.text || '',
                    html: parsed.html || ''
                };

            } finally {
                lock.release();
            }
        });

        res.json(result);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SEND EMAIL
app.post('/api/send', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const {
        to,
        subject,
        text,
        smtpHost,
        smtpPort,
        smtpSecure
    } = req.body || {};

    if (!to || !smtpHost) {
        return res.status(400).json({
            error: 'Recipient and SMTP host are required'
        });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number(smtpPort || 465),
            secure: smtpSecure !== false,
            auth: {
                user: config.username,
                pass: config.password
            },
            tls: {
                rejectUnauthorized: true
            }
        });

        const info = await transporter.sendMail({
            from: config.username,
            to,
            subject: subject || '',
            text: text || ''
        });

        res.json({
            success: true,
            messageId: info.messageId
        });

    } catch (err) {
        res.status(500).json({
            error: 'Send failed',
            details: { message: err.message }
        });
    }
});

// LOGOUT
app.post('/api/logout', (req, res) => {
    const id = req.headers['x-session-id'] || req.body?.sessionId;

    if (id) sessions.delete(id);

    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Danke Mail running on port ${PORT}`);
});
