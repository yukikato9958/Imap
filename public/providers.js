
window.PROVIDERS = [
  {
    id: 'ttcn',
    name: 'TTCN',
    domains: ['mx3.ttcn.ne.jp'],
    imapHost: 'imap2.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp2.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'dti',
    name: 'DTI',
    domains: [
      'dti.ne.jp',
      'dti2.ne.jp',
      'fides.dti.ne.jp',
      'mars.dti.ne.jp',
      'zephyr.dti.ne.jp',
      'river.dti.ne.jp',
      'aurora.dti.ne.jp',
      'mica.dti.ne.jp',
      'vesta.dti.ne.jp',
      'saturn.dti.ne.jp',
      'sky.dti2.ne.jp',
      'snow.dti2.ne.jp'
    ],
    matchSubdomains: true,
    imapHost: 'imap.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'jcom',
    name: 'J:COM / ZAQ',
    domains: ['jcom.zaq.ne.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'IMAP and SMTP server settings need verification.'
  },
  {
    id: 'dream',
    name: 'Dream.jp',
    domains: ['dream.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'IMAP and SMTP server settings need verification.'
  },
  {
    id: 'mb-point',
    name: 'MB Point',
    domains: ['mb.point.ne.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'IMAP and SMTP server settings need verification.'
  },
  {
    id: 'biglobe',
    name: 'BIGLOBE',
    domains: ['biglobe.ne.jp'],
    imapHost: 'mail.biglobe.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.biglobe.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'ocn',
    name: 'OCN',
    domains: ['ocn.ne.jp'],
    imapHost: 'imap.ocn.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.ocn.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'so-net',
    name: 'So-net',
    domains: ['so-net.ne.jp'],
    imapHost: 'imap.so-net.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.so-net.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'nifty',
    name: '@nifty',
    domains: ['nifty.com'],
    imapHost: 'imap.nifty.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.nifty.com',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'hi-ho',
    name: 'hi-ho',
    domains: ['hi-ho.ne.jp'],
    matchSubdomains: true,
    imapHost: 'hi-ho.mose-mail.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'hi-ho.mose-mail.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'katch',
    name: 'KATCH',
    domains: ['katch.ne.jp'],
    imapHost: 'imap.katch.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'imap.katch.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'btv',
    name: 'BTV',
    domains: ['btvm.ne.jp'],
    imapHost: 'imap.btvm.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.btvm.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'mineo',
    name: 'mineo',
    domains: ['mineo.jp'],
    imapHost: 'imaps.mineo.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtps.mineo.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 't-online',
    name: 'T-Online / Telekom',
    domains: ['t-online.de', 'magenta.de'],
    imapHost: 'secureimap.t-online.de',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'securesmtp.t-online.de',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Use your email program password, not your normal Telekom login password.'
  },
  {
    id: 'web-de',
    name: 'WEB.DE',
    domains: ['web.de'],
    imapHost: 'imap.web.de',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.web.de',
    smtpPort: 587,
    smtpSecure: false,
    notes: 'Enable IMAP access in WEB.DE account settings.'
  },
  {
    id: 'web-de-com',
    name: 'WEB.DE (web.de.com)',
    domains: ['web.de.com'],
    imapHost: 'imap.web.de',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.web.de',
    smtpPort: 587,
    smtpSecure: false,
    notes: 'Server mapping is unverified. Confirm that this domain is hosted by WEB.DE.'
  },
  {
    id: 'gmx-de',
    name: 'GMX Germany',
    domains: ['gmx.de', 'gmx.net'],
    imapHost: 'imap.gmx.net',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.gmx.net',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Enable IMAP access in GMX account settings.'
  },
  {
    id: 'gmx-com',
    name: 'GMX International',
    domains: ['gmx.com'],
    imapHost: 'imap.gmx.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.gmx.com',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Enable IMAP access in GMX account settings.'
  },
  {
    id: 'online-de',
    name: 'online.de',
    domains: ['online.de'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Server settings need confirmation from the email provider.'
  },
  {
    id: 'yahoo-jp',
    name: 'Yahoo! JAPAN',
    domains: ['yahoo.co.jp'],
    imapHost: 'imap.mail.yahoo.co.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.co.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'yahoo-com',
    name: 'Yahoo Mail',
    domains: ['yahoo.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'App Password may be required.'
  },
  {
    id: 'icloud',
    name: 'iCloud',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    notes: 'Apple app-specific password required.'
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail',
    domains: ['outlook.com', 'hotmail.com', 'live.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false
  },
  {
    id: 'toukai',
    name: 'Toukai',
    domains: ['toukai.me'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'kanto',
    name: 'Kanto',
    domains: ['kanto.me'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'manual',
    name: 'Other / Manual',
    domains: [],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  }
];

// AUTOMATIC PROVIDER DETECTION
window.detectProvider = function(email) {
  const value = (email || '').trim().toLowerCase();
  const atIndex = value.lastIndexOf('@');

  if (atIndex < 1 || atIndex === value.length - 1) {
    return window.PROVIDERS.find(p => p.id === 'manual');
  }

  const domain = value.substring(atIndex + 1);

  return window.PROVIDERS.find(provider =>
    provider.id !== 'manual' &&
    provider.domains.some(item => {
      const base = item.toLowerCase();

      return domain === base ||
        (provider.matchSubdomains && domain.endsWith('.' + base));
    })
  ) || window.PROVIDERS.find(p => p.id === 'manual');
};
