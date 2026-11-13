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

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    throw new Error(
        'SESSION_SECRET belum diatur. Tambahkan SESSION_SECRET di environment variables.'
    );
}

const SESSION_KEY = crypto
    .createHash('sha256')
    .update(SESSION_SECRET)
    .digest();

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

const tlsOptions = {
    rejectUnauthorized: true,
    minDHSize: 512,
    ciphers: 'DEFAULT@SECLEVEL=0'
};

// ========================================
// MESSAGE CACHE
// ========================================

const MESSAGE_CACHE = new Map();
const MESSAGE_CACHE_TTL = 300000;
const MESSAGE_CACHE_MAX = 100;

const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 90 * 1000;
const SEARCH_CACHE_MAX = 20;

function getCachedSearch(key) {
    const item = SEARCH_CACHE.get(key);

    if (!item) return null;

    if (Date.now() > item.expiresAt) {
        SEARCH_CACHE.delete(key);
        return null;
    }

    SEARCH_CACHE.delete(key);
    SEARCH_CACHE.set(key, item);

    return item.data;
}

function setCachedSearch(key, data) {
    SEARCH_CACHE.delete(key);

    while (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) {
        SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value);
    }

    SEARCH_CACHE.set(key, {
        data,
        expiresAt: Date.now() + SEARCH_CACHE_TTL
    });
}

function getCachedMessage(key) {
    const item = MESSAGE_CACHE.get(key);

    if (!item) return null;

    if (Date.now() > item.expiresAt) {
        MESSAGE_CACHE.delete(key);
        return null;
    }

    MESSAGE_CACHE.delete(key);
    MESSAGE_CACHE.set(key, item);

    return item.data;
}

function setCachedMessage(key, data) {
    MESSAGE_CACHE.delete(key);

    while (MESSAGE_CACHE.size >= MESSAGE_CACHE_MAX) {
        MESSAGE_CACHE.delete(MESSAGE_CACHE.keys().next().value);
    }

    MESSAGE_CACHE.set(key, {
        data,
        expiresAt: Date.now() + MESSAGE_CACHE_TTL
    });
}

// ========================================
// ENCRYPTED SESSION
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

    return [
        'v1',
        iv.toString('hex'),
        cipher.getAuthTag().toString('hex'),
        encrypted.toString('hex')
    ].join('.');
}

function readSessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    try {
        const parts = token.split('.');

        if (parts.length !== 4 || parts[0] !== 'v1') {
            return null;
        }

        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encrypted = Buffer.from(parts[3], 'hex');

        if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) {
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

        if (Date.now() > payload.expiresAt) return null;

        const config = payload.config;

        if (!config || !config.host || !config.username || !config.password) {
            return null;
        }

        return config;
    } catch {
        return null;
    }
}

// ========================================
// SESSION HELPER
// ========================================

function getSession(req) {
    const authorization = req.headers.authorization || '';

    const bearer = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

    const token =
        req.headers['x-session-id'] ||
        bearer ||
        req.body?.sessionId ||
        req.query?.sessionId;

    return readSessionToken(token);
}

// ========================================
// IMAP CONNECTION POOL
// ========================================

const IMAP_POOL = new Map();

const IMAP_IDLE_TIMEOUT = 5 * 60 * 1000;
const IMAP_POOL_MAX = 20;

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
        connectionTimeout: 30000,
        greetingTimeout: 20000,
        socketTimeout: 60000,
        tls: { ...tlsOptions }
    });

    client.on('error', err => {
        console.error('IMAP:', err.message);
    });

    return client;
}

function getImapPoolKey(config) {
    return crypto.createHash('sha256')
        .update(JSON.stringify({
            host: config.host,
            port: config.port,
            secure: config.secure,
            username: config.username,
            password: config.password
        }))
        .digest('hex');
}

function removeImapConnection(key, entry) {
    if (IMAP_POOL.get(key) === entry) {
        IMAP_POOL.delete(key);
    }
}

async function closeImapConnection(entry) {
    if (!entry || entry.closed || entry.closing) return;

    entry.closing = true;

    try {
        await entry.client.logout();
    } catch {
        try {
            entry.client.close();
        } catch {}
    } finally {
        entry.closed = true;
        entry.closing = false;
    }
}

async function withImap(config, callback) {
    const key = getImapPoolKey(config);

    let entry = IMAP_POOL.get(key);

    if (!entry || entry.closed || entry.closing) {
        const client = createImapClient(config);

        entry = {
            client,
            active: 0,
            lastUsed: Date.now(),
            closed: false,
            closing: false,
            connectPromise: null
        };

        IMAP_POOL.set(key, entry);

        client.on('close', () => {
            entry.closed = true;
            removeImapConnection(key, entry);
        });
    }

    entry.active++;
    entry.lastUsed = Date.now();

    try {
        if (!entry.connectPromise) {
            entry.connectPromise = entry.client.connect()
                .catch(err => {
                    entry.closed = true;
                    removeImapConnection(key, entry);

                    try {
                        entry.client.close();
                    } catch {}

                    throw err;
                });
        }

        await entry.connectPromise;

        if (entry.closed || entry.closing) {
            throw new Error('IMAP connection closed');
        }

        return await callback(entry.client);

    } finally {
        entry.active = Math.max(0, entry.active - 1);
        entry.lastUsed = Date.now();
    }
}

// Close connections that have been idle for too long.
const imapCleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of IMAP_POOL) {
        if (
            entry.active === 0 &&
            !entry.closing &&
            now - entry.lastUsed > IMAP_IDLE_TIMEOUT
        ) {
            removeImapConnection(key, entry);
            closeImapConnection(entry);
        }
    }

    if (IMAP_POOL.size > IMAP_POOL_MAX) {
        const idleEntries = [...IMAP_POOL.entries()]
            .filter(([, entry]) =>
                entry.active === 0 && !entry.closing
            )
            .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        while (
            IMAP_POOL.size > IMAP_POOL_MAX &&
            idleEntries.length
        ) {
            const [key, entry] = idleEntries.shift();

            removeImapConnection(key, entry);
            closeImapConnection(entry);
        }
    }
}, 60000);

if (imapCleanupTimer.unref) {
    imapCleanupTimer.unref();
}

// ========================================
// HELPERS
// ========================================

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
    return !Array.from(mailbox.flags || []).some(
        flag => String(flag).toLowerCase() === '\\noselect'
    );
}

function sendError(res, err, operation) {
    console.error(operation + ':', err);

    const message = err.message || 'Unknown error';
    const timeout = /timeout|timed out|ETIMEDOUT/i.test(message);

    res.status(timeout ? 504 : 500).json({
        error: timeout ? 'Connection timed out' : operation + ' failed',
        details: { message }
    });
}

function clearMessageCache(config, folder, uids) {
    for (const uid of uids) {
        const key = [
            config.username,
            config.host,
            folder,
            uid
        ].join(':');

        MESSAGE_CACHE.delete(key);
    }
}

function normalizeFolder(value) {
    return String(value || 'INBOX').trim();
}

function getPagination(query) {
    const page = Math.max(
        1,
        Math.floor(Number(query.page) || 1)
    );

    const limit = Math.min(
        100,
        Math.max(1, Math.floor(Number(query.limit) || 50))
    );

    return { page, limit };
}

function paginateMessages(messages, page, limit) {
    const total = messages.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
        messages: messages.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages
    };
}

// ========================================
// HEALTH
// ========================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Danke Mail',
        cache: MESSAGE_CACHE.size,
        imapConnections: IMAP_POOL.size
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Danke Mail',
        cache: MESSAGE_CACHE.size,
        imapConnections: IMAP_POOL.size
    });
});

// ========================================
// PROVIDERS
// ========================================

app.get('/api/providers', (req, res) => {
    res.json({ providers: [] });
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
            sessionId,
            account: {
                username: config.username,
                host: config.host
            }
        });
    } catch (err) {
        console.error('Login:', err.message);

        const timeout = /timeout|timed out|ETIMEDOUT/i.test(err.message);

        res.status(timeout ? 504 : 401).json({
            error: timeout ? 'IMAP connection timed out' : 'IMAP login failed',
            details: { message: err.message }
        });
    }
});

// ========================================
// FOLDERS
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
// INBOX / ALL FOLDERS
// PAGINATION
// ========================================

app.get('/api/inbox', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const folder = normalizeFolder(req.query.folder);
    const { page, limit } = getPagination(req.query);

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const uids = await client.search(
                    { all: true },
                    { uid: true }
                );

                const total = uids.length;

                if (!total) {
                    return {
                        messages: [],
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        hasPrevious: false,
                        hasNext: false,
                        folder
                    };
                }

                const start = Math.max(
                    0,
                    total - page * limit
                );

                const end = total - (page - 1) * limit;

                const selected = uids
                    .slice(start, end)
                    .reverse();

                const messages = selected.length
                    ? await client.fetchAll(
                        selected,
                        {
                            uid: true,
                            envelope: true,
                            flags: true,
                            internalDate: true
                        },
                        { uid: true }
                    )
                    : [];

                const totalPages = Math.ceil(total / limit);

                return {
                    messages: messages.map(m =>
                        formatMessage(m, folder)
                    ),
                    total,
                    page,
                    limit,
                    totalPages,
                    hasPrevious: page > 1,
                    hasNext: page < totalPages,
                    folder
                };
            } finally {
                lock.release();
            }
        });

        res.json(result);
    } catch (err) {
        sendError(res, err, 'Folder message loading');
    }
});

// ========================================
// SEARCH - OPTIMIZED
// ========================================

app.get('/api/search', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const query = String(req.query.q || '').trim();
    const requestedFolder = String(req.query.folder || 'ALL');
    const { page, limit } = getPagination(req.query);

    if (!query || query.length > 200) {
        return res.status(400).json({
            error: 'Invalid search query'
        });
    }

    const cacheKey = crypto.createHash('sha256')
        .update(JSON.stringify({
            username: config.username,
            host: config.host,
            query: query.toLowerCase(),
            folder: requestedFolder
        }))
        .digest('hex');

    try {
        let allResults = getCachedSearch(cacheKey);

        if (!allResults) {
            const folders = await withImap(config, async client => {
                const mailboxes = await client.list();

                const selected = requestedFolder.toUpperCase() === 'ALL'
                    ? mailboxes.filter(isSelectable)
                    : mailboxes.filter(mailbox =>
                        mailbox.path === requestedFolder &&
                        isSelectable(mailbox)
                    );

                return selected.map(mailbox => mailbox.path);
            });

            const workerCount = Math.min(3, folders.length);
            let nextFolder = 0;
            const collected = [];

            const workers = Array.from({ length: workerCount }, async () => {
                const client = createImapClient(config);
                let connected = false;

                try {
                    await client.connect();
                    connected = true;

                    while (true) {
                        const index = nextFolder++;

                        if (index >= folders.length) break;

                        const folder = folders[index];
                        let lock;

                        try {
                            lock = await client.getMailboxLock(folder);

                            const uids = await client.search(
                                { text: query },
                                { uid: true }
                            );

                            if (!uids || !uids.length) continue;

                            const messages = await client.fetchAll(
                                uids,
                                {
                                    uid: true,
                                    envelope: true,
                                    flags: true,
                                    internalDate: true
                                },
                                { uid: true }
                            );

                            for (const message of messages) {
                                collected.push(formatMessage(message, folder));
                            }
                        } catch (err) {
                            console.error(
                                'Search folder:',
                                folder,
                                err.message
                            );
                        } finally {
                            if (lock) lock.release();
                        }
                    }
                } finally {
                    if (connected) {
                        try {
                            await client.logout();
                        } catch {
                            try {
                                client.close();
                            } catch {}
                        }
                    } else {
                        try {
                            client.close();
                        } catch {}
                    }
                }
            });

            await Promise.all(workers);

            collected.sort((a, b) =>
                new Date(b.date || 0).getTime() -
                new Date(a.date || 0).getTime()
            );

            allResults = collected;
            setCachedSearch(cacheKey, allResults);
        }

        res.json({
            query,
            folder: requestedFolder,
            ...paginateMessages(allResults, page, limit)
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
    const folder = normalizeFolder(req.query.folder);

    if (!Number.isSafeInteger(uid) || uid < 1) {
        return res.status(400).json({
            error: 'Invalid message UID'
        });
    }

    const cacheKey = [
        config.username,
        config.host,
        folder,
        uid
    ].join(':');

    const cached = getCachedMessage(cacheKey);

    if (cached) {
        res.set('X-Danke-Cache', 'HIT');
        return res.json(cached);
    }

    try {
        const result = await withImap(config, async client => {
            const lock = await client.getMailboxLock(folder);

            try {
                const message = await client.fetchOne(
                    uid,
                    { source: true },
                    { uid: true }
                );

                if (!message || !message.source) {
                    throw new Error('Message not found');
                }

                const parsed = await simpleParser(message.source, {
                    skipHtmlToText: true,
                    skipTextToHtml: true,
                    skipImageLinks: true
                });

                const data = {
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

                setCachedMessage(cacheKey, data);

                return data;
            } finally {
                lock.release();
            }
        });

        res.set('X-Danke-Cache', 'MISS');
        res.json(result);
    } catch (err) {
        sendError(res, err, 'Message loading');
    }
});

// ========================================
// MARK READ / UNREAD / DELETE
// ========================================

app.post('/api/message/action', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const {
        folder = 'INBOX',
        uids = [],
        action
    } = req.body || {};

    if (!Array.isArray(uids) || !uids.length) {
        return res.status(400).json({
            error: 'Select at least one email.'
        });
    }

    if (!['read', 'unread', 'delete'].includes(action)) {
        return res.status(400).json({
            error: 'Invalid action.'
        });
    }

    const validUIDs = [...new Set(
        uids.map(Number).filter(
            uid => Number.isSafeInteger(uid) && uid > 0
        )
    )];

    if (!validUIDs.length) {
        return res.status(400).json({
            error: 'Invalid email UID.'
        });
    }

    try {
        await withImap(config, async client => {
            if (action === 'delete') {
                const mailboxes = await client.list();

                let trash = mailboxes.find(box =>
                    String(box.specialUse || '').toLowerCase() === '\\trash'
                );

                if (!trash) {
                    const names = [
                        'trash',
                        'deleted',
                        'deleted items',
                        'deleted messages',
                        'bin',
                        'ごみ箱',
                        'ゴミ箱'
                    ];

                    trash = mailboxes.find(box =>
                        names.includes(
                            String(box.path)
                                .split('/')
                                .pop()
                                .toLowerCase()
                        )
                    );
                }

                if (!trash) {
                    throw new Error(
                        'Folder Trash tidak ditemukan. Periksa nama folder Trash di akun email.'
                    );
                }

                const lock = await client.getMailboxLock(folder);

                try {
                    if (folder === trash.path) {
                        await client.messageDelete(
                            validUIDs,
                            { uid: true }
                        );
                    } else {
                        await client.messageMove(
                            validUIDs,
                            trash.path,
                            { uid: true }
                        );
                    }
                } finally {
                    lock.release();
                }

                return;
            }

            const lock = await client.getMailboxLock(folder);

            try {
                if (action === 'read') {
                    await client.messageFlagsAdd(
                        validUIDs,
                        ['\\Seen'],
                        { uid: true }
                    );
                } else if (action === 'unread') {
                    await client.messageFlagsRemove(
                        validUIDs,
                        ['\\Seen'],
                        { uid: true }
                    );
                }
            } finally {
                lock.release();
            }
        });

        clearMessageCache(config, folder, validUIDs);

        res.json({
            success: true,
            action,
            count: validUIDs.length,
            message:
                action === 'read'
                    ? 'Emails marked as read'
                    : action === 'unread'
                    ? 'Emails marked as unread'
                    : 'Emails moved to Trash'
        });

    } catch (err) {
        sendError(res, err, 'Message action');
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
        cc,
        bcc,
        subject,
        text,
        html,
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

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
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
        connectionTimeout: 30000,
        greetingTimeout: 20000,
        socketTimeout: 60000,
        tls: { ...tlsOptions }
    });

    try {
        const info = await transporter.sendMail({
            from: config.username,
            to,
            cc: cc || undefined,
            bcc: bcc || undefined,
            subject: subject || '',
            text: text || '',
            html: html || undefined
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
    res.json({ success: true });
});

// ========================================
// ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (res.headersSent) return next(err);

    res.status(500).json({
        error: 'Internal server error',
        details: { message: err.message }
    });
});

// ========================================
// START
// ========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Danke Mail running on port ${PORT}`);
});
