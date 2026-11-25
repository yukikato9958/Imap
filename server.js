const express = require('express');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
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
// CACHE (INBOX + SEARCH + MESSAGE)
// ========================================

const INBOX_CACHE = new Map();
const INBOX_CACHE_TTL = 30 * 1000;
const INBOX_CACHE_MAX = 60;

const MESSAGE_CACHE = new Map();
const MESSAGE_CACHE_TTL = 300000;
const MESSAGE_CACHE_MAX = 100;

const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 90 * 1000;
const SEARCH_CACHE_MAX = 30;

function getCacheEntry(map, key) {
    const item = map.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        map.delete(key);
        return null;
    }
    map.delete(key);
    map.set(key, item);
    return item.data;
}

function setCacheEntry(map, maxSize, ttl, key, data) {
    map.delete(key);
    while (map.size >= maxSize) {
        map.delete(map.keys().next().value);
    }
    map.set(key, {
        data,
        expiresAt: Date.now() + ttl
    });
}

function getCachedInbox(key) {
    return getCacheEntry(INBOX_CACHE, key);
}

function setCachedInbox(key, data) {
    setCacheEntry(INBOX_CACHE, INBOX_CACHE_MAX, INBOX_CACHE_TTL, key, data);
}

function clearInboxCacheForAccount(config, folder) {
    const prefix = `${config.username}:${config.host}:`;
    for (const key of INBOX_CACHE.keys()) {
        if (key.startsWith(prefix) && (!folder || key.includes(`:${folder}:`))) {
            INBOX_CACHE.delete(key);
        }
    }
}

function getCachedSearch(key) {
    return getCacheEntry(SEARCH_CACHE, key);
}

function setCachedSearch(key, data) {
    setCacheEntry(SEARCH_CACHE, SEARCH_CACHE_MAX, SEARCH_CACHE_TTL, key, data);
}

function getCachedMessage(key) {
    return getCacheEntry(MESSAGE_CACHE, key);
}

function setCachedMessage(key, data) {
    setCacheEntry(MESSAGE_CACHE, MESSAGE_CACHE_MAX, MESSAGE_CACHE_TTL, key, data);
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
        inboxCache: INBOX_CACHE.size,
        searchCache: SEARCH_CACHE.size,
        imapConnections: IMAP_POOL.size
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Danke Mail',
        cache: MESSAGE_CACHE.size,
        inboxCache: INBOX_CACHE.size,
        searchCache: SEARCH_CACHE.size,
        imapConnections: IMAP_POOL.size
    });
});

// ========================================
// PROVIDERS & IMAP/SMTP AUTO-DISCOVERY
// ========================================

const AUTODISCOVER_CACHE = new Map();
const AUTODISCOVER_CACHE_TTL = 15 * 60 * 1000;
const AUTODISCOVER_CACHE_MAX = 200;

const AUTODISCOVER_RATE = new Map();
const AUTODISCOVER_RATE_WINDOW = 60 * 1000;
const AUTODISCOVER_RATE_MAX = 30;

const MULTI_PART_TLDS = new Set([
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'gr.jp', 'ed.jp', 'ad.jp',
    'co.uk', 'org.uk', 'ac.uk', 'me.uk',
    'com.au', 'net.au', 'org.au',
    'co.id', 'or.id', 'ac.id', 'go.id', 'web.id', 'my.id', 'sch.id',
    'com.br', 'com.cn', 'com.tw', 'com.hk', 'com.sg', 'com.my', 'com.mx', 'com.tr',
    'co.kr', 'co.nz', 'co.za', 'co.in', 'net.in', 'org.in'
]);

const MX_PROVIDER_RULES = [
    {
        pattern: /(^|\.)(google\.com|googlemail\.com)$/i,
        name: 'Google Workspace / Gmail',
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(protection\.outlook\.com|eo\.outlook\.com|mail\.outlook\.com)$/i,
        name: 'Microsoft 365 / Outlook',
        imap: { host: 'outlook.office365.com', port: 993, secure: true },
        smtp: { host: 'smtp.office365.com', port: 587, secure: false }
    },
    {
        pattern: /(^|\.)zoho\.eu$/i,
        name: 'Zoho Mail EU',
        imap: { host: 'imap.zoho.eu', port: 993, secure: true },
        smtp: { host: 'smtp.zoho.eu', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)zoho\.in$/i,
        name: 'Zoho Mail IN',
        imap: { host: 'imap.zoho.in', port: 993, secure: true },
        smtp: { host: 'smtp.zoho.in', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)zoho\.jp$/i,
        name: 'Zoho Mail JP',
        imap: { host: 'imap.zoho.jp', port: 993, secure: true },
        smtp: { host: 'smtp.zoho.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)zoho\.com\.au$/i,
        name: 'Zoho Mail AU',
        imap: { host: 'imap.zoho.com.au', port: 993, secure: true },
        smtp: { host: 'smtp.zoho.com.au', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(zoho\.com|zohomail\.com)$/i,
        name: 'Zoho Mail',
        imap: { host: 'imap.zoho.com', port: 993, secure: true },
        smtp: { host: 'smtp.zoho.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)icloud\.com$/i,
        name: 'iCloud Mail',
        imap: { host: 'imap.mail.me.com', port: 993, secure: true },
        smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }
    },
    {
        pattern: /(^|\.)yahoodns\.net$/i,
        name: 'Yahoo Mail',
        imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
        smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)messagingengine\.com$/i,
        name: 'Fastmail',
        imap: { host: 'imap.fastmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.fastmail.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(yandex\.net|yandex\.ru)$/i,
        name: 'Yandex Mail',
        imap: { host: 'imap.yandex.com', port: 993, secure: true },
        smtp: { host: 'smtp.yandex.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)mail\.ru$/i,
        name: 'Mail.ru',
        imap: { host: 'imap.mail.ru', port: 993, secure: true },
        smtp: { host: 'smtp.mail.ru', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)migadu\.com$/i,
        name: 'Migadu',
        imap: { host: 'imap.migadu.com', port: 993, secure: true },
        smtp: { host: 'smtp.migadu.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)mose-mail\.jp$/i,
        name: 'Mose-Mail',
        imap: { host: 'mbox.mose-mail.jp', port: 993, secure: true },
        smtp: { host: 'mbox.mose-mail.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(cm\.dream\.jp|dream\.jp)$/i,
        name: 'Dream.jp / DTI',
        imap: { host: 'imap2.cm.dream.jp', port: 993, secure: true },
        smtp: { host: 'vsmtp2.cm.dream.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)lolipop\.jp$/i,
        name: 'Lolipop Mail',
        imap: { host: 'imap.lolipop.jp', port: 993, secure: true },
        smtp: { host: 'smtp.lolipop.jp', port: 465, secure: true }
    },
    {
        pattern: /^[a-z0-9-]+\.sakura\.ne\.jp$/i,
        name: 'Sakura Internet',
        resolve: exchange => ({
            imap: { host: exchange, port: 993, secure: true },
            smtp: { host: exchange, port: 587, secure: false }
        })
    },
    {
        pattern: /^sv\d+\.xserver\.jp$/i,
        name: 'Xserver',
        resolve: exchange => ({
            imap: { host: exchange, port: 993, secure: true },
            smtp: { host: exchange, port: 465, secure: true }
        })
    },
    {
        pattern: /^[a-z0-9.-]+\.shared-server\.net$/i,
        name: 'CPI Shared Server',
        resolve: exchange => ({
            imap: { host: exchange, port: 993, secure: true },
            smtp: { host: exchange, port: 465, secure: true }
        })
    },
    {
        pattern: /(^|\.)biglobe\.ne\.jp$/i,
        name: 'BIGLOBE',
        imap: { host: 'mail.biglobe.ne.jp', port: 993, secure: true },
        smtp: { host: 'mail.biglobe.ne.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)ocn\.ne\.jp$/i,
        name: 'OCN',
        imap: { host: 'imap.ocn.ne.jp', port: 993, secure: true },
        smtp: { host: 'smtp.ocn.ne.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)so-net\.ne\.jp$/i,
        name: 'So-net',
        imap: { host: 'imap.so-net.ne.jp', port: 993, secure: true },
        smtp: { host: 'mail.so-net.ne.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)nifty\.com$/i,
        name: '@nifty',
        imap: { host: 'imap.nifty.com', port: 993, secure: true },
        smtp: { host: 'smtp.nifty.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)plala\.or\.jp$/i,
        name: 'Plala',
        imap: { host: 'imap.plala.or.jp', port: 993, secure: true },
        smtp: { host: 'secure.plala.or.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)eonet\.ne\.jp$/i,
        name: 'eo / eonet',
        imap: { host: 'imaps.eonet.ne.jp', port: 993, secure: true },
        smtp: { host: 'smtps.eonet.ne.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)iijmio-mail\.jp$/i,
        name: 'IIJmio Safety Mail',
        imap: { host: 'imap.iijmio-mail.jp', port: 993, secure: true },
        smtp: { host: 'mbox.iijmio-mail.jp', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(kundenserver\.de|ionos\.de)$/i,
        name: 'IONOS / 1&1 DE',
        imap: { host: 'imap.ionos.de', port: 993, secure: true },
        smtp: { host: 'smtp.ionos.de', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(ionos\.com|perfora\.net)$/i,
        name: 'IONOS',
        imap: { host: 'imap.ionos.com', port: 993, secure: true },
        smtp: { host: 'smtp.ionos.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(strato\.de|rzone\.de)$/i,
        name: 'STRATO',
        imap: { host: 'imap.strato.de', port: 993, secure: true },
        smtp: { host: 'smtp.strato.de', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(t-online\.de)$/i,
        name: 'T-Online / Telekom',
        imap: { host: 'secureimap.t-online.de', port: 993, secure: true },
        smtp: { host: 'securesmtp.t-online.de', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)hostinger\.com$/i,
        name: 'Hostinger Mail',
        imap: { host: 'imap.hostinger.com', port: 993, secure: true },
        smtp: { host: 'smtp.hostinger.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)titan\.email$/i,
        name: 'Titan Email',
        imap: { host: 'imap.titan.email', port: 993, secure: true },
        smtp: { host: 'smtp.titan.email', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)privateemail\.com$/i,
        name: 'Namecheap Private Email',
        imap: { host: 'mail.privateemail.com', port: 993, secure: true },
        smtp: { host: 'mail.privateemail.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)secureserver\.net$/i,
        name: 'GoDaddy Workspace',
        imap: { host: 'imap.secureserver.net', port: 993, secure: true },
        smtp: { host: 'smtpout.secureserver.net', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(ovh\.net|ovh\.ca)$/i,
        name: 'OVH Mail',
        imap: { host: 'ssl0.ovh.net', port: 993, secure: true },
        smtp: { host: 'ssl0.ovh.net', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)emailsrvr\.com$/i,
        name: 'Rackspace Email',
        imap: { host: 'secure.emailsrvr.com', port: 993, secure: true },
        smtp: { host: 'secure.emailsrvr.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)infomaniak\.ch$/i,
        name: 'Infomaniak',
        imap: { host: 'mail.infomaniak.com', port: 993, secure: true },
        smtp: { host: 'mail.infomaniak.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)posteo\.de$/i,
        name: 'Posteo',
        imap: { host: 'posteo.de', port: 993, secure: true },
        smtp: { host: 'posteo.de', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)mailbox\.org$/i,
        name: 'mailbox.org',
        imap: { host: 'imap.mailbox.org', port: 993, secure: true },
        smtp: { host: 'smtp.mailbox.org', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)gandi\.net$/i,
        name: 'Gandi Mail',
        imap: { host: 'mail.gandi.net', port: 993, secure: true },
        smtp: { host: 'mail.gandi.net', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(mxhichina\.com|alibaba-inc\.com)$/i,
        name: 'Alibaba / Aliyun Mail',
        imap: { host: 'imap.qiye.aliyun.com', port: 993, secure: true },
        smtp: { host: 'smtp.qiye.aliyun.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)qq\.com$/i,
        name: 'Tencent Exmail / QQ',
        imap: { host: 'imap.exmail.qq.com', port: 993, secure: true },
        smtp: { host: 'smtp.exmail.qq.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(163\.com|netease\.com)$/i,
        name: 'NetEase Mail',
        imap: { host: 'imap.qiye.163.com', port: 993, secure: true },
        smtp: { host: 'smtp.qiye.163.com', port: 465, secure: true }
    },
    {
        pattern: /(^|\.)(naver\.com|worksmobile\.com)$/i,
        name: 'Naver Mail',
        imap: { host: 'imap.naver.com', port: 993, secure: true },
        smtp: { host: 'smtp.naver.com', port: 465, secure: true }
    }
];

function isValidHostname(host) {
    if (!host || typeof host !== 'string') return false;
    const clean = host.trim().toLowerCase().replace(/\.$/, '');
    if (!clean || clean.length > 253) return false;
    if (net.isIP(clean) !== 0) return false;
    if (
        clean === 'localhost' ||
        clean.endsWith('.localhost') ||
        clean.endsWith('.local') ||
        clean.endsWith('.internal') ||
        clean.endsWith('.lan') ||
        clean.endsWith('.home.arpa')
    ) {
        return false;
    }
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(clean);
}

function getBaseDomain(domain) {
    const parts = domain.toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return domain.toLowerCase();
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(lastTwo)) {
        return parts.length >= 3 ? parts.slice(-3).join('.') : domain.toLowerCase();
    }
    return lastTwo;
}

function isPrivateIp(ip) {
    if (!ip || typeof ip !== 'string') return true;
    const normalized = ip.toLowerCase().trim();

    if (normalized.startsWith('::ffff:')) {
        return isPrivateIp(normalized.slice(7));
    }

    if (net.isIPv4(normalized)) {
        const parts = normalized.split('.').map(Number);
        if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a >= 224) return true;
        return false;
    }

    if (net.isIPv6(normalized)) {
        if (normalized === '::' || normalized === '::1') return true;
        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
        if (/^fe[89ab]/i.test(normalized)) return true;
        if (normalized.startsWith('ff')) return true;
        return false;
    }

    return true;
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), ms);
        promise.then(
            val => {
                clearTimeout(timer);
                resolve(val);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

async function resolvePublicHost(host) {
    const clean = String(host || '').trim().toLowerCase().replace(/\.$/, '');
    if (!isValidHostname(clean)) return false;

    try {
        const records = await withTimeout(dns.lookup(clean, { all: true }), 2500);
        if (!Array.isArray(records) || !records.length) return false;
        return records.every(r => !isPrivateIp(r.address));
    } catch {
        return false;
    }
}

async function lookupSrvForDomain(domain) {
    const queries = [
        { name: `_imaps._tcp.${domain}`, type: 'imap', secure: true, defaultPort: 993 },
        { name: `_imap._tcp.${domain}`, type: 'imap', secure: false, defaultPort: 143 },
        { name: `_submissions._tcp.${domain}`, type: 'smtp', secure: true, defaultPort: 465 },
        { name: `_submission._tcp.${domain}`, type: 'smtp', secure: false, defaultPort: 587 }
    ];

    const settled = await Promise.all(
        queries.map(async q => {
            try {
                const records = await withTimeout(dns.resolveSrv(q.name), 3000);
                const valid = (records || [])
                    .filter(r => r && r.name && r.name !== '.' && isValidHostname(r.name))
                    .sort((a, b) => (a.priority - b.priority) || (b.weight - a.weight));
                if (!valid.length) return null;
                const best = valid[0];
                const port = Number(best.port) || q.defaultPort;
                return {
                    type: q.type,
                    host: best.name.toLowerCase().replace(/\.$/, ''),
                    port,
                    secure: q.secure
                };
            } catch {
                return null;
            }
        })
    );

    const imap = settled.find(x => x && x.type === 'imap' && x.secure) ||
        settled.find(x => x && x.type === 'imap') ||
        null;
    const smtp = settled.find(x => x && x.type === 'smtp' && x.secure) ||
        settled.find(x => x && x.type === 'smtp') ||
        null;

    if (!imap && !smtp) return null;
    return {
        imap: imap ? { host: imap.host, port: imap.port, secure: imap.secure } : null,
        smtp: smtp ? { host: smtp.host, port: smtp.port, secure: smtp.secure } : null
    };
}

function parseAutoconfigXml(xml, domain) {
    if (!xml || typeof xml !== 'string' || !xml.includes('<clientConfig')) {
        return null;
    }

    const extractTag = (block, tag) => {
        const match = block.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, 'i'));
        return match ? match[1].trim() : '';
    };

    const parseServers = (tagName, serverType, defaultSecurePort, defaultPlainPort) => {
        const regex = new RegExp(
            `<${tagName}[^>]*type=["']${serverType}["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`,
            'gi'
        );
        const list = [];
        let match;
        while ((match = regex.exec(xml)) !== null) {
            const block = match[1];
            const rawHost = extractTag(block, 'hostname')
                .replace(/%EMAILDOMAIN%/gi, domain)
                .toLowerCase()
                .replace(/\.$/, '');
            if (!isValidHostname(rawHost)) continue;

            const socketType = extractTag(block, 'socketType').toUpperCase();
            const secure = socketType === 'SSL';
            const rawPort = Number(extractTag(block, 'port'));
            const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
                ? rawPort
                : (secure ? defaultSecurePort : defaultPlainPort);

            list.push({
                host: rawHost,
                port,
                secure,
                socketType: socketType || (secure ? 'SSL' : 'STARTTLS')
            });
        }

        list.sort((a, b) => {
            if (a.secure !== b.secure) return a.secure ? -1 : 1;
            const aStarttls = a.socketType === 'STARTTLS' ? 0 : 1;
            const bStarttls = b.socketType === 'STARTTLS' ? 0 : 1;
            return aStarttls - bStarttls;
        });

        return list;
    };

    const imaps = parseServers('incomingServer', 'imap', 993, 143);
    const smtps = parseServers('outgoingServer', 'smtp', 465, 587);

    if (!imaps.length && !smtps.length) return null;

    const providerName =
        extractTag(xml, 'displayShortName') ||
        extractTag(xml, 'displayName') ||
        '';

    return {
        providerName,
        imap: imaps[0] ? { host: imaps[0].host, port: imaps[0].port, secure: imaps[0].secure } : null,
        smtp: smtps[0] ? { host: smtps[0].host, port: smtps[0].port, secure: smtps[0].secure } : null,
        candidates: imaps.map(x => ({ host: x.host, port: x.port, secure: x.secure }))
    };
}

async function fetchAutoconfigXml(url, domain, checkPublicHost = false) {
    try {
        if (checkPublicHost) {
            const parsedUrl = new URL(url);
            const ok = await resolvePublicHost(parsedUrl.hostname);
            if (!ok) return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3800);

        try {
            const response = await fetch(url, {
                method: 'GET',
                redirect: checkPublicHost ? 'manual' : 'follow',
                signal: controller.signal,
                headers: { 'User-Agent': 'DankeMail-Autodiscover/1.0' }
            });
            if (!response.ok) return null;
            const text = await response.text();
            return parseAutoconfigXml(text, domain);
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return null;
    }
}

async function lookupAutoconfig(domain, baseDomain, email) {
    const encodedEmail = encodeURIComponent(email || `user@${domain}`);
    const domainUrls = [
        `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodedEmail}`,
        `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`
    ];
    const ispdbUrls = [
        `https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`
    ];
    if (baseDomain && baseDomain !== domain) {
        ispdbUrls.push(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(baseDomain)}`);
    }

    const [domainResults, ispdbResults] = await Promise.all([
        Promise.all(domainUrls.map(url => fetchAutoconfigXml(url, domain, true))),
        Promise.all(ispdbUrls.map(url => fetchAutoconfigXml(url, domain, false)))
    ]);

    const domainMatch = domainResults.find(r => r && r.imap);
    const ispdbMatch = ispdbResults.find(r => r && r.imap);
    const anySmtp =
        domainResults.find(r => r && r.smtp)?.smtp ||
        ispdbResults.find(r => r && r.smtp)?.smtp ||
        null;

    if (domainMatch) {
        return {
            ...domainMatch,
            smtp: domainMatch.smtp || anySmtp,
            source: 'autoconfig',
            sourceLabel: 'Domain Autoconfig'
        };
    }

    if (ispdbMatch) {
        return {
            ...ispdbMatch,
            smtp: ispdbMatch.smtp || anySmtp,
            source: 'ispdb',
            sourceLabel: 'Mozilla ISPDB'
        };
    }

    if (anySmtp) {
        return {
            providerName: '',
            imap: null,
            smtp: anySmtp,
            candidates: [],
            source: 'autoconfig',
            sourceLabel: 'Autoconfig'
        };
    }

    return null;
}

async function lookupMx(domain, baseDomain) {
    const tryMx = async d => {
        try {
            const records = await withTimeout(dns.resolveMx(d), 3000);
            return (records || [])
                .filter(r => r && r.exchange && isValidHostname(r.exchange))
                .sort((a, b) => a.priority - b.priority)
                .map(r => r.exchange.toLowerCase().replace(/\.$/, ''));
        } catch {
            return [];
        }
    };

    const primary = await tryMx(domain);
    if (primary.length) return primary;
    if (baseDomain && baseDomain !== domain) {
        return await tryMx(baseDomain);
    }
    return [];
}

function matchMxProvider(mxHosts) {
    for (const exchange of mxHosts) {
        for (const rule of MX_PROVIDER_RULES) {
            if (rule.pattern.test(exchange)) {
                const resolved = rule.resolve ? rule.resolve(exchange) : rule;
                return {
                    providerName: rule.name,
                    imap: resolved.imap ? { ...resolved.imap } : null,
                    smtp: resolved.smtp ? { ...resolved.smtp } : null,
                    mxHost: exchange
                };
            }
        }
    }
    return null;
}

function extractCertHostnames(cert, originalHost) {
    if (!cert || typeof cert !== 'object') return [];
    const orig = String(originalHost || '').trim().toLowerCase().replace(/\.$/, '');
    const exact = [];
    const wildcardDerived = [];

    const pushEntry = rawName => {
        const clean = String(rawName || '').trim().toLowerCase().replace(/\.$/, '');
        if (!clean) return;
        if (clean.startsWith('*.')) {
            const base = clean.slice(2);
            if (isValidHostname(base)) {
                wildcardDerived.push(base);
                wildcardDerived.push(`mail.${base}`);
            }
        } else if (isValidHostname(clean)) {
            exact.push(clean);
        }
    };

    if (typeof cert.subjectaltname === 'string') {
        for (const part of cert.subjectaltname.split(',')) {
            const trimmed = part.trim();
            if (/^DNS:/i.test(trimmed)) {
                pushEntry(trimmed.slice(4));
            }
        }
    }

    if (cert.subject && typeof cert.subject.CN === 'string') {
        pushEntry(cert.subject.CN);
    }

    const seen = new Set([orig]);
    const result = [];
    for (const h of [...exact, ...wildcardDerived]) {
        if (!h || seen.has(h)) continue;
        seen.add(h);
        result.push(h);
        if (result.length >= 4) break;
    }
    return result;
}

function probeBanner(host, port, secure, bannerRegex, timeoutMs, strictTls = false) {
    return new Promise(resolve => {
        let settled = false;
        let buffer = '';
        let socket;

        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (socket) {
                try {
                    socket.removeAllListeners();
                    socket.on('error', () => {});
                    socket.destroy();
                } catch {}
            }
            resolve(value);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        try {
            socket = secure
                ? tls.connect({
                    host,
                    port,
                    servername: host,
                    rejectUnauthorized: Boolean(strictTls),
                    minDHSize: 512,
                    ciphers: 'DEFAULT@SECLEVEL=0'
                })
                : net.createConnection({ host, port });

            socket.setEncoding('utf8');

            socket.on('data', chunk => {
                buffer += chunk;
                const lineBreak = buffer.indexOf('\n');
                const line = (lineBreak >= 0 ? buffer.slice(0, lineBreak) : buffer).trim();
                if (bannerRegex.test(line)) {
                    let certHosts = [];
                    if (secure && !socket.authorized) {
                        try {
                            certHosts = extractCertHostnames(socket.getPeerCertificate(false), host);
                        } catch {}
                    }
                    finish({
                        host,
                        port,
                        secure,
                        tlsAuthorized: secure ? Boolean(socket.authorized) : null,
                        certHosts
                    });
                } else if (lineBreak >= 0 || buffer.length > 512) {
                    finish(null);
                }
            });

            socket.on('error', () => finish(null));
            socket.on('timeout', () => finish(null));
            socket.on('end', () => finish(null));
            socket.on('close', () => finish(null));
        } catch {
            finish(null);
        }
    });
}

async function resolveCertHostOverrides(probedItems, port, bannerRegex, timeoutMs = 4000) {
    const certMap = new Map();
    for (const item of probedItems || []) {
        if (!item || !item.secure || item.tlsAuthorized || !Array.isArray(item.certHosts)) continue;
        for (const certHost of item.certHosts) {
            if (!certMap.has(certHost)) {
                certMap.set(certHost, {
                    certHost,
                    idx: item.idx,
                    resolvedFrom: item.host,
                    kind: item.kind || 'dedicated'
                });
            }
        }
    }

    if (!certMap.size) return [];

    const entries = [...certMap.values()].slice(0, 6);
    const verified = await Promise.all(
        entries.map(async entry => {
            const ok = await resolvePublicHost(entry.certHost);
            if (!ok) return null;
            const res = await probeBanner(entry.certHost, port, true, bannerRegex, timeoutMs, true);
            if (!res || !res.tlsAuthorized) return null;
            return {
                host: res.host,
                port: res.port,
                secure: true,
                tlsAuthorized: true,
                resolvedFrom: entry.resolvedFrom,
                idx: entry.idx,
                kind: 'dedicated'
            };
        })
    );

    return verified.filter(Boolean);
}

function buildImapCandidates(domain, baseDomain, mxHosts) {
    const raw = [
        `imap.${domain}`,
        `imaps.${domain}`,
        `mail.${domain}`,
        `imap.mail.${domain}`,
        `secureimap.${domain}`,
        `mbox.${domain}`,
        domain
    ];

    if (baseDomain && baseDomain !== domain) {
        raw.push(
            `imap.${baseDomain}`,
            `imaps.${baseDomain}`,
            `mail.${baseDomain}`,
            `imap.mail.${baseDomain}`,
            baseDomain
        );
    }

    for (const mx of (mxHosts || []).slice(0, 2)) {
        raw.push(mx);
        const mxBase = getBaseDomain(mx);
        if (mxBase && mxBase !== domain && mxBase !== baseDomain) {
            raw.push(`imap.${mxBase}`, `imaps.${mxBase}`, `mail.${mxBase}`);
        }
    }

    const seen = new Set();
    const result = [];
    for (const host of raw) {
        const clean = String(host || '').trim().toLowerCase().replace(/\.$/, '');
        if (!clean || seen.has(clean) || !isValidHostname(clean)) continue;
        seen.add(clean);
        result.push(clean);
        if (result.length >= 14) break;
    }
    return result;
}

function buildSmtpCandidates(domain, baseDomain, detectedImapHost, mxHosts, preferImapHost = false) {
    const dedicated = [];
    const shared = [];

    if (detectedImapHost) {
        const cleanImap = detectedImapHost.toLowerCase().replace(/\.$/, '');
        if (preferImapHost) {
            dedicated.push(cleanImap);
        }
        if (/^secureimap\./i.test(cleanImap)) {
            dedicated.push(cleanImap.replace(/^secureimap\./i, 'securesmtp.'));
        } else if (/^imaps([0-9-]*)\./i.test(cleanImap)) {
            dedicated.push(cleanImap.replace(/^imaps([0-9-]*)\./i, 'smtps$1.'));
            dedicated.push(cleanImap.replace(/^imaps([0-9-]*)\./i, 'smtp$1.'));
            dedicated.push(cleanImap.replace(/^imaps([0-9-]*)\./i, 'smtpa.'));
            dedicated.push(cleanImap.replace(/^imaps([0-9-]*)\./i, 'vsmtp$1.'));
            shared.push(cleanImap.replace(/^imaps([0-9-]*)\./i, 'mail.'));
        } else if (/^imap([0-9-]*)\./i.test(cleanImap)) {
            dedicated.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'smtp$1.'));
            dedicated.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'smtps$1.'));
            dedicated.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'smtpa.'));
            dedicated.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'vsmtp$1.'));
            dedicated.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'smtpout.'));
            shared.push(cleanImap.replace(/^imap([0-9-]*)\./i, 'mail.'));
        }
    }

    dedicated.push(
        `smtp.${domain}`,
        `smtps.${domain}`,
        `smtpa.${domain}`,
        `vsmtp.${domain}`,
        `smtp.mail.${domain}`,
        `securesmtp.${domain}`,
        `smtpout.${domain}`
    );

    shared.push(`mail.${domain}`, `mbox.${domain}`);

    if (baseDomain && baseDomain !== domain) {
        dedicated.push(
            `smtp.${baseDomain}`,
            `smtps.${baseDomain}`,
            `smtpa.${baseDomain}`,
            `vsmtp.${baseDomain}`,
            `smtp.mail.${baseDomain}`,
            `securesmtp.${baseDomain}`
        );
        shared.push(`mail.${baseDomain}`, `mbox.${baseDomain}`);
    }

    for (const mx of (mxHosts || []).slice(0, 2)) {
        const mxBase = getBaseDomain(mx);
        if (mxBase && mxBase !== domain && mxBase !== baseDomain) {
            dedicated.push(`smtp.${mxBase}`, `smtps.${mxBase}`, `vsmtp.${mxBase}`);
            shared.push(`mail.${mxBase}`);
        }
    }

    if (detectedImapHost) {
        shared.push(detectedImapHost);
    }
    shared.push(domain);
    if (baseDomain && baseDomain !== domain) {
        shared.push(baseDomain);
    }

    const seen = new Set();
    const result = [];
    const addList = (arr, kind) => {
        for (const host of arr) {
            const clean = String(host || '').trim().toLowerCase().replace(/\.$/, '');
            if (!clean || seen.has(clean) || !isValidHostname(clean)) continue;
            seen.add(clean);
            result.push({ host: clean, kind });
            if (result.length >= 16) break;
        }
    };

    addList(dedicated, 'dedicated');
    if (result.length < 16) addList(shared, 'shared');
    return result;
}

async function probeImapCandidates(domain, baseDomain, mxHosts) {
    const candidates = buildImapCandidates(domain, baseDomain, mxHosts);
    const dnsChecks = await Promise.all(
        candidates.map(async (host, idx) => ({
            host,
            idx,
            ok: await resolvePublicHost(host)
        }))
    );
    const validHosts = dnsChecks.filter(x => x.ok);
    if (!validHosts.length) return [];

    const imapBannerRegex = /^\*\s+(OK|PREAUTH)\b/i;

    const tlsResults = await Promise.all(
        validHosts.map(async item => {
            const res = await probeBanner(item.host, 993, true, imapBannerRegex, 4000);
            return res ? { ...res, idx: item.idx } : null;
        })
    );

    const validTls = tlsResults.filter(Boolean);
    if (validTls.length) {
        const certOverrides = await resolveCertHostOverrides(validTls, 993, imapBannerRegex, 4000);
        const combined = [...certOverrides, ...validTls];
        combined.sort((a, b) => {
            if (a.tlsAuthorized !== b.tlsAuthorized) return a.tlsAuthorized ? -1 : 1;
            return a.idx - b.idx;
        });

        const seen = new Set();
        const deduped = [];
        for (const item of combined) {
            const key = `${item.host}:${item.port}:${item.secure}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push({
                host: item.host,
                port: item.port,
                secure: item.secure,
                tlsAuthorized: item.tlsAuthorized,
                resolvedFrom: item.resolvedFrom || ''
            });
        }
        return deduped;
    }

    const plainResults = await Promise.all(
        validHosts.map(async item => {
            const res = await probeBanner(item.host, 143, false, imapBannerRegex, 3500);
            return res ? { ...res, idx: item.idx } : null;
        })
    );

    return plainResults
        .filter(Boolean)
        .sort((a, b) => a.idx - b.idx)
        .map(({ host, port, secure }) => ({ host, port, secure }));
}

async function probeSmtpCandidates(domain, baseDomain, detectedImapHost, mxHosts, preferImapHost = false) {
    const candidates = buildSmtpCandidates(domain, baseDomain, detectedImapHost, mxHosts, preferImapHost);
    const dnsChecks = await Promise.all(
        candidates.map(async (item, idx) => ({
            host: item.host,
            kind: item.kind,
            idx,
            ok: await resolvePublicHost(item.host)
        }))
    );
    const validHosts = dnsChecks.filter(x => x.ok);
    if (!validHosts.length) {
        return { smtp: null, smtpCandidates: [], smtpSource: '' };
    }

    const smtpBannerRegex = /^220[\s-]/;

    // Probe 465 (SSL/TLS) and 587 (STARTTLS) in parallel for speed
    const [tlsResults, starttlsResults] = await Promise.all([
        Promise.all(
            validHosts.map(async item => {
                const res = await probeBanner(item.host, 465, true, smtpBannerRegex, 4500);
                return res ? { ...res, idx: item.idx, kind: item.kind } : null;
            })
        ),
        Promise.all(
            validHosts.map(async item => {
                const res = await probeBanner(item.host, 587, false, smtpBannerRegex, 4500);
                return res ? { ...res, idx: item.idx, kind: item.kind } : null;
            })
        )
    ]);

    const tlsValid = tlsResults.filter(Boolean);
    const smtpCertOverrides = await resolveCertHostOverrides(tlsValid, 465, smtpBannerRegex, 4000);
    const verified = [...smtpCertOverrides, ...tlsValid, ...starttlsResults.filter(Boolean)];
    if (verified.length) {
        verified.sort((a, b) => {
            // Prefer SSL/TLS 465 with valid cert first, then STARTTLS 587, then unverified 465
            const rank = x => (x.secure && x.tlsAuthorized ? 0 : !x.secure ? 1 : 2);
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            // Then prefer dedicated smtp.* / cert host over generic shared hosts
            const aDed = a.kind === 'dedicated' ? 0 : 1;
            const bDed = b.kind === 'dedicated' ? 0 : 1;
            if (aDed !== bDed) return aDed - bDed;
            return a.idx - b.idx;
        });

        const seen = new Set();
        const list = [];
        for (const item of verified) {
            const k = `${item.host}:${item.port}:${item.secure}`;
            if (seen.has(k)) continue;
            seen.add(k);
            list.push({ host: item.host, port: item.port, secure: item.secure });
            if (list.length >= 5) break;
        }
        return {
            smtp: list[0],
            smtpCandidates: list,
            smtpSource: smtpCertOverrides.length ? 'Live SMTP Probe (SSL Cert Host)' : 'Live SMTP Probe'
        };
    }

    // DNS-verified fallback (handles cloud hosts like Railway that block outbound 465/587
    // or ISP SMTP servers with slow greetpause delays)
    const fallbackList = [];
    for (const item of validHosts.slice(0, 3)) {
        fallbackList.push({ host: item.host, port: 465, secure: true, inferred: true });
        if (fallbackList.length < 4) {
            fallbackList.push({ host: item.host, port: 587, secure: false, inferred: true });
        }
        if (fallbackList.length >= 4) break;
    }

    return {
        smtp: fallbackList[0] || null,
        smtpCandidates: fallbackList,
        smtpSource: 'DNS Fallback'
    };
}

async function autodiscoverMailConfig(emailInput, force = false) {
    const raw = String(emailInput || '').trim().toLowerCase();
    const at = raw.lastIndexOf('@');
    const domain = at >= 0 ? raw.slice(at + 1) : raw;

    if (!isValidHostname(domain)) {
        return {
            found: false,
            domain: domain || '',
            error: 'Domain email tidak valid.',
            imap: null,
            smtp: null,
            candidates: []
        };
    }

    if (!force) {
        const cached = getCacheEntry(AUTODISCOVER_CACHE, domain);
        if (cached) {
            return { ...cached, cached: true };
        }
    }

    const baseDomain = getBaseDomain(domain);

    const [srvPrimary, srvBase, autoconfig, mxHosts] = await Promise.all([
        lookupSrvForDomain(domain),
        baseDomain !== domain ? lookupSrvForDomain(baseDomain) : Promise.resolve(null),
        lookupAutoconfig(domain, baseDomain, at > 0 ? raw : `user@${domain}`),
        lookupMx(domain, baseDomain)
    ]);

    const srv = (srvPrimary && srvPrimary.imap) ? srvPrimary : (srvBase && srvBase.imap ? srvBase : (srvPrimary || srvBase));
    const mxMatch = matchMxProvider(mxHosts);

    let imap = null;
    let smtp = null;
    let source = null;
    let sourceLabel = '';
    let providerName = '';
    let candidates = [];

    let imapResolvedFrom = '';

    if (autoconfig && autoconfig.source === 'autoconfig' && autoconfig.imap) {
        imap = autoconfig.imap;
        smtp = autoconfig.smtp || srv?.smtp || mxMatch?.smtp || null;
        source = 'autoconfig';
        sourceLabel = autoconfig.sourceLabel;
        providerName = autoconfig.providerName || '';
        candidates = autoconfig.candidates || [imap];
    } else if (srv && srv.imap) {
        imap = srv.imap;
        smtp = srv.smtp || autoconfig?.smtp || mxMatch?.smtp || null;
        source = 'srv';
        sourceLabel = 'DNS SRV (RFC 6186)';
        candidates = [imap];
    } else if (autoconfig && autoconfig.imap) {
        imap = autoconfig.imap;
        smtp = autoconfig.smtp || srv?.smtp || mxMatch?.smtp || null;
        source = autoconfig.source;
        sourceLabel = autoconfig.sourceLabel;
        providerName = autoconfig.providerName || '';
        candidates = autoconfig.candidates || [imap];
    } else if (mxMatch && mxMatch.imap) {
        imap = mxMatch.imap;
        smtp = mxMatch.smtp || srv?.smtp || null;
        source = 'mx';
        sourceLabel = `MX Record (${mxMatch.mxHost})`;
        providerName = mxMatch.providerName || '';
        candidates = [imap];
    } else {
        const probedImaps = await probeImapCandidates(domain, baseDomain, mxHosts);
        if (probedImaps.length) {
            imap = {
                host: probedImaps[0].host,
                port: probedImaps[0].port,
                secure: probedImaps[0].secure
            };
            imapResolvedFrom = probedImaps[0].resolvedFrom || '';
            source = 'probe';
            sourceLabel = imapResolvedFrom
                ? `SSL Cert Host (dari ${imapResolvedFrom})`
                : 'Live IMAP Probe';
            candidates = probedImaps.slice(0, 5).map(c => ({
                host: c.host,
                port: c.port,
                secure: c.secure
            }));
            smtp = srv?.smtp || autoconfig?.smtp || mxMatch?.smtp || null;
        }
    }

    let smtpCandidates = [];
    let smtpSource = '';

    if (smtp && smtp.host) {
        smtpCandidates = [smtp];
        smtpSource = sourceLabel || 'Autoconfig';
    } else {
        const probedSmtp = await probeSmtpCandidates(
            domain,
            baseDomain,
            imap?.host || '',
            mxHosts,
            Boolean(imapResolvedFrom)
        );
        if (probedSmtp && probedSmtp.smtp) {
            smtp = probedSmtp.smtp;
            smtpCandidates = probedSmtp.smtpCandidates || [smtp];
            smtpSource = probedSmtp.smtpSource || '';
        }
    }

    const dedupeList = list => {
        const out = [];
        const seen = new Set();
        for (const c of list || []) {
            if (!c || !c.host) continue;
            const k = `${c.host}:${c.port}:${c.secure}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(c);
        }
        return out;
    };

    const uniqueCandidates = dedupeList(candidates);
    const uniqueSmtpCandidates = dedupeList(smtpCandidates);

    const result = {
        found: Boolean(imap || smtp),
        domain,
        providerName: providerName || '',
        source: source || (smtp ? 'smtp-fallback' : 'none'),
        sourceLabel: sourceLabel || smtpSource,
        smtpSource,
        imap,
        smtp,
        candidates: uniqueCandidates,
        smtpCandidates: uniqueSmtpCandidates
    };

    setCacheEntry(AUTODISCOVER_CACHE, AUTODISCOVER_CACHE_MAX, AUTODISCOVER_CACHE_TTL, domain, result);
    return result;
}

function checkAutodiscoverRateLimit(ip) {
    const now = Date.now();
    const key = ip || 'unknown';
    let entry = AUTODISCOVER_RATE.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + AUTODISCOVER_RATE_WINDOW };
        AUTODISCOVER_RATE.set(key, entry);
    }
    entry.count++;
    if (AUTODISCOVER_RATE.size > 500) {
        for (const [k, v] of AUTODISCOVER_RATE) {
            if (now > v.resetAt) AUTODISCOVER_RATE.delete(k);
        }
    }
    return entry.count <= AUTODISCOVER_RATE_MAX;
}

app.get('/api/providers', (req, res) => {
    res.json({ providers: [] });
});

app.post('/api/autodiscover', async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (!checkAutodiscoverRateLimit(ip)) {
        return res.status(429).json({
            error: 'Terlalu banyak permintaan deteksi otomatis. Coba lagi sebentar.'
        });
    }

    const { email, domain, force } = req.body || {};
    const target = String(email || domain || '').trim();

    if (!target) {
        return res.status(400).json({
            error: 'Email atau domain diperlukan untuk deteksi otomatis.'
        });
    }

    try {
        const result = await autodiscoverMailConfig(target, Boolean(force));
        res.json(result);
    } catch (err) {
        sendError(res, err, 'IMAP auto-discovery');
    }
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
        let friendlyMessage = err.message;

        if (/does not match certificate's altnames/i.test(err.message)) {
            const dnsMatches = [...err.message.matchAll(/DNS:([a-z0-9.-]+)/gi)]
                .map(m => m[1])
                .filter(h => !h.startsWith('*.') && isValidHostname(h));
            if (dnsMatches.length) {
                friendlyMessage = `Sertifikat SSL server terdaftar untuk "${dnsMatches[0]}", bukan "${config.host}". Ganti IMAP Host ke "${dnsMatches[0]}" atau klik Auto Detect.`;
            }
        }

        res.status(timeout ? 504 : 401).json({
            error: timeout ? 'IMAP connection timed out' : 'IMAP login failed',
            details: { message: friendlyMessage }
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
// PAGINATION (WITH CACHE)
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
    const bypassCache = req.query.refresh === '1';
    const cacheKey = `${config.username}:${config.host}:${folder}:${page}:${limit}`;

    if (!bypassCache) {
        const cached = getCachedInbox(cacheKey);
        if (cached) {
            res.set('X-Danke-Inbox-Cache', 'HIT');
            return res.json(cached);
        }
    }

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

        setCachedInbox(cacheKey, result);
        res.set('X-Danke-Inbox-Cache', 'MISS');
        res.json(result);
    } catch (err) {
        sendError(res, err, 'Folder message loading');
    }
});

// ========================================
// SEARCH - FULL TEXT (BODY + HEADERS) & BROAD FOLDERS
// ========================================

const MAX_SEARCH_UIDS_PER_FOLDER = 300;
const MAX_SEARCH_FOLDERS = 12;
const MAX_TOTAL_SEARCH_RESULTS = 500;

function folderSearchPriority(mailbox) {
    const pathUpper = String(mailbox.path || '').toUpperCase();
    const special = String(mailbox.specialUse || '').toLowerCase();
    if (pathUpper === 'INBOX' || special === '\\inbox') return 0;
    if (special === '\\sent' || pathUpper.includes('SENT')) return 1;
    if (special === '\\archive' || pathUpper.includes('ARCHIVE')) return 2;
    if (special === '\\trash' || special === '\\junk') return 9;
    return 3;
}

app.get('/api/search', async (req, res) => {
    const config = getSession(req);

    if (!config) {
        return res.status(401).json({
            error: 'Session expired. Please sign in again.'
        });
    }

    const query = String(req.query.q || '').trim();
    const requestedFolder = String(req.query.folder || 'ALL').trim();
    const { page, limit } = getPagination(req.query);
    const bypassCache = req.query.refresh === '1';

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
            folder: requestedFolder.toUpperCase()
        }))
        .digest('hex');

    try {
        let allResults = bypassCache ? null : getCachedSearch(cacheKey);

        if (!allResults) {
            allResults = await withImap(config, async client => {
                let folderPaths;

                if (requestedFolder.toUpperCase() === 'ALL') {
                    const mailboxes = await client.list();
                    const selectable = mailboxes.filter(isSelectable);

                    selectable.sort((a, b) =>
                        folderSearchPriority(a) - folderSearchPriority(b)
                    );

                    folderPaths = selectable
                        .slice(0, MAX_SEARCH_FOLDERS)
                        .map(mailbox => mailbox.path);
                } else {
                    folderPaths = [requestedFolder];
                }

                const collected = [];

                for (const folder of folderPaths) {
                    if (collected.length >= MAX_TOTAL_SEARCH_RESULTS) break;

                    let lock;
                    try {
                        lock = await client.getMailboxLock(folder);

                        const uids = await client.search(
                            { text: query },
                            { uid: true }
                        );

                        if (!uids || !uids.length) continue;

                        const remainingQuota = MAX_TOTAL_SEARCH_RESULTS - collected.length;
                        const takeCount = Math.min(MAX_SEARCH_UIDS_PER_FOLDER, remainingQuota);
                        const recentUids = uids.slice(-takeCount);

                        const messages = await client.fetchAll(
                            recentUids,
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

                collected.sort((a, b) =>
                    new Date(b.date || 0).getTime() -
                    new Date(a.date || 0).getTime()
                );

                return collected;
            });

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
        clearInboxCacheForAccount(config, folder);

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
