
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// CONFIGURATION
// ========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// PENTING:
// Atur SESSION_SECRET sebagai Environment Variable di Railway.
// Jangan mengubah nilainya setelah aplikasi berjalan.
const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
    console.warn(
        'WARNING: SESSION_SECRET is not configured. ' +
        'Sessions will not survive a server restart.'
    );
}

const SESSION_KEY = crypto
    .createHash('sha256')
    .update(SESSION_SECRET)
    .digest();

// Session berlaku 7 hari
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

// ========================================
// TLS COMPATIBILITY
// ========================================

const tlsOptions = {
    rejectUnauthorized: true,
    minDHSize: 512,
    ciphers: 'DEFAULT@SECLEVEL=0'
};

// ========================================
// ENCRYPTED SESSION TOKEN
// ========================================

function createSessionToken(config) {
    const iv = crypto.randomBytes(12);

    const payload = {
        config,
        expiresAt: Date.now() + SESSION_DURATION
    };

    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        SESSION_KEY,
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return [
        'v1',
        iv.toString('hex'),
        tag.toString('hex'),
        encrypted.toString('hex')
    ].join('.');
}

function readSessionToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }

    try {
        const parts = token.split('.');

        if (parts.length !== 4 || parts[0] !== 'v1') {
            return null;
        }

        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encrypted = Buffer.from(parts[3], 'hex');

        if (
            iv.length !== 12 ||
            tag.length !== 16 ||
            encrypted.length === 0
        ) {
            return null;
        }

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            SESSION_KEY,
            iv
        );

        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        const payload = JSON.parse(decrypted.toString('utf8'));

        if (!payload.expiresAt || Date.now() > payload.expiresAt) {
            return null;
        }

        if (
            !payload.config ||
            !payload.config.host ||
            !payload.config.username ||
            !payload.config.password
        ) {
            return null;
        }

        return payload.config;

    } catch (err) {
        return null;
    }
}

// ========================================
// SESSION
// ========================================

function getSession(req) {
    const id =
        req.headers['x-session-id'] ||
        req.body?.sessionId;

    return readSessionToken(id);
}

// ========================================
// IMAP CLIENT
// ========================================

function createImapClient(config) {
    const client = new ImapFlow({
        host: config.host,
        port: Number(config.port || 993),
        secure: config.secure !== false,

        auth: {
            user: config.username,
            pass: config.password
        },

        logger: false,

        connectionTimeout: 90000,
        greetingTimeout: 60000,
        socketTimeout: 120000,

        tls: { ...tlsOptions }
    });

    client.on('error', err => {
        console.error('IMAP connection error:', err.message);
    });

    client.on('close', () => {
        console.log('IMAP connection closed');
    });

    return client;
}

// ========================================
// SAFE IMAP CONNECTION
// ========================================

async function withImap(config, callback) {
    const client = createImapClient(config);
    let connected = false;

    try {
        await client.connect();
        connected = true;

        return await callback(client);

    } finally {
        if (connected) {
            try {
                await client.logout();
            } catch (err) {
                console.log('IMAP logout:', err.message);
            }
        } else {
            try {
                client.close();
            } catch (err) {
                // Ignore close errors
            }
        }
    }
}

// ========================================
// ADDRESS FORMAT
// ========================================

function addressList(list = []) {
    return list.map(x => {
        if (x.name && x.address) {
            return `${x.name} <${x.address}>`;
        }

        return x.address || x.name || '';

    }).filter(Boolean).join(', ');
}

// ========================================
// MESSAGE FORMAT
// ========================================

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

// ========================================
// FOLDER CHECK
// ========================================

function isSelectable(mailbox) {
    const flags = Array.from(mailbox.flags || []);

    return !flags.some(
        flag => String(flag).toLowerCase() === '\\noselect'
    );
}

// ========================================
// ERROR HANDLER
// ========================================

function sendError(res, err, operation) {
    console.error(operation + ':', err);

    const message = err.message || 'Unknown error';

    const timeout = /timeout|timed out|ETIMEDOUT/i.test(message);

    res.status(timeout ? 504 : 500).json({
        error: timeout
            ? 'Connection timed out'
            : operation + ' failed',

        details: {
            message
        }
    });
}

// ========================================
// HEALTH
// ========================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Danke Mail',
        sessionStorage: 'encrypted-token'
    });
});

// ========================================
// PROVIDERS
// ========================================

app.get('/api/providers', (req, res) => {
    res.json({
        providers: []
    });
});

// ========================================
// LOGIN
// ========================================

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
        host: String(host).trim(),
        port: Number(port || 993),
        secure: secure !== false,
        username: String(username).trim(),
        password: String(password)
    };

    if (
        !Number.isInteger(config.port) ||
        config.port < 1 ||
        config.port > 65535
    ) {
        return res.status(400).json({
            error: 'Invalid IMAP port.'
        });
    }

    try {
        await withImap(config, async client => {
            await client.list();
        });

        const sessionId = createSessionToken(config);

        res.json({
            success: true,
            sessionId
        });

    } catch (err) {
        console.error('IMAP login failed:', err.message);

        const timeout =
            /timeout|timed out|ETIMEDOUT/i.test(err.message);

        res.status(timeout ? 504 : 401).json({
            error: timeout
                ? 'IMAP connection timed out'
                : 'IMAP login failed',

            details: {
                message: err.message
            }
        });
    }
});

// ========================================
// FOLDER LIST
// ========================================

app.get('/api/folders', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
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
        sendError(res, err, 'Folder loading');
    }
});

// ========================================
// INBOX / FOLDER MESSAGES
// ========================================

app.get('/api/inbox', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const folder = String(req.query.folder || 'INBOX');

    const page = Math.max(
        1,
        Number(req.query.page || 1)
    );

    const limit = Math.min(
        100,
        Math.max(1, Number(req.query.limit || 25))
    );

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const uids = await client.search(
                    { all: true },
                    { uid: true }
                );

                if (!uids || !uids.length) {
                    return {
                        messages: [],
                        total: 0
                    };
                }

                const total = uids.length;

                const start = Math.max(
                    0,
                    total - page * limit
                );

                const end = total - (page - 1) * limit;

                const selected = uids
                    .slice(start, end)
                    .reverse();

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
                    messages: messages.map(
                        m => formatMessage(m, folder)
                    ),
                    total
                };

            } finally {
                lock.release();
            }
        });

        res.json(result);

    } catch (err) {
        sendError(res, err, 'Inbox loading');
    }
});

// ========================================
// SEARCH ALL MAILBOXES
// ========================================

app.get('/api/search', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const query = String(req.query.q || '').trim();

    const limit = Math.min(
        200,
        Math.max(1, Number(req.query.limit || 100))
    );

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
                if (!isSelectable(mailbox)) {
                    continue;
                }

                const folder = mailbox.path;
                let lock;

                try {
                    lock = await client.getMailboxLock(folder);

                    const uids = await client.search(
                        { text: query },
                        { uid: true }
                    );

                    if (!uids || !uids.length) {
                        continue;
                    }

                    const selected = uids
                        .slice(-limit)
                        .reverse();

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
                        allResults.push(
                            formatMessage(message, folder)
                        );
                    }

                } catch (err) {
                    console.error(
                        'Search folder error:',
                        folder,
                        err.message
                    );

                } finally {
                    if (lock) {
                        lock.release();
                    }
                }
            }

            allResults.sort((a, b) => {
                return new Date(b.date || 0) -
                    new Date(a.date || 0);
            });

            return allResults.slice(0, limit);
        });

        res.json({
            query,
            total: results.length,
            messages: results
        });

    } catch (err) {
        sendError(res, err, 'Search');
    }
});

// ========================================
// OPEN MESSAGE
// ========================================

app.get('/api/message/:uid', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const uid = Number(req.params.uid);

    const folder = String(
        req.query.folder || 'INBOX'
    );

    if (!Number.isSafeInteger(uid) || uid < 1) {
        return res.status(400).json({
            error: 'Invalid message UID'
        });
    }

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const message = await client.fetchOne(
                    uid,
                    {
                        source: true,
                        uid: true
                    },
                    { uid: true }
                );

                if (!message || !message.source) {
                    throw new Error('Message not found');
                }

                const parsed = await simpleParser(
                    message.source
                );

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
        sendError(res, err, 'Message loading');
    }
});

// ========================================
// SEND EMAIL
// ========================================

app.post('/api/send', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
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

    const port = Number(smtpPort || 465);

    if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        return res.status(400).json({
            error: 'Invalid SMTP port'
        });
    }

    const transporter = nodemailer.createTransport({
        host: String(smtpHost).trim(),
        port,

        secure: smtpSecure !== false,

        auth: {
            user: config.username,
            pass: config.password
        },

        connectionTimeout: 90000,
        greetingTimeout: 60000,
        socketTimeout: 120000,

        tls: { ...tlsOptions }
    });

    try {
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
        sendError(res, err, 'Email sending');

    } finally {
        transporter.close();
    }
});

// ========================================
// LOGOUT
// ========================================

app.post('/api/logout', (req, res) => {
    // Client clears its saved token.
    // Stateless encrypted tokens expire automatically.

    res.json({
        success: true
    });
});

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        error: 'Internal server error',
        details: {
            message: err.message
        }
    });
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Danke Mail running on port ${PORT}`);
});
