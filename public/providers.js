
window.PROVIDERS = [
  {
    id: 'dti',
    name: 'DTI',
    domains: ['dti.ne.jp'],
    imapHost: 'imap.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true
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
    smtpSecure: true,
    notes: 'Please confirm server settings with the provider.'
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
    smtpSecure: true,
    notes: 'Please confirm server settings with the provider.'
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

window.detectProvider = function(email) {
  const d = (email || '').trim().toLowerCase().split('@').pop();

  if (!d || !d.includes('.')) {
    return window.PROVIDERS.find(p => p.id === 'manual');
  }

  return window.PROVIDERS.find(p =>
    p.id !== 'manual' &&
    p.domains.some(domain =>
      d === domain ||
      (p.matchSubdomains && d.endsWith('.' + domain))
    )
  ) || window.PROVIDERS.find(p => p.id === 'manual');
};
