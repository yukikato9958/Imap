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
      'dti.ne.jp', 'dti2.ne.jp', 'fides.dti.ne.jp',
      'mars.dti.ne.jp', 'zephyr.dti.ne.jp',
      'river.dti.ne.jp', 'aurora.dti.ne.jp',
      'mica.dti.ne.jp', 'vesta.dti.ne.jp',
      'saturn.dti.ne.jp', 'sky.dti2.ne.jp',
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
    imapHost: 'imap.jcom.zaq.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtpa.jcom.zaq.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'dream',
    name: 'Dream.jp',
    domains: ['dream.jp'],
    imapHost: 'imap.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'mb-point',
    name: 'MB Point',
    domains: ['mb.point.ne.jp'],
    imapHost: 'imap2.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp2.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Server mapping needs confirmation with MB Point.'
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

  // PROVIDER TAMBAHAN

  {
    id: 'cty-net',
    name: 'CTY-NET',
    domains: ['m5.cty-net.ne.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'IMAP server needs confirmation from CTY.'
  },
  {
    id: 'nir',
    name: 'FamilyNet / NIR',
    domains: ['pwt.nir.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'sunbathe',
    name: 'Sunbathe',
    domains: ['sunbathe.co.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: '384',
    name: '384.jp',
    domains: ['384.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'MX is mx.mose-mail.jp; IMAP/SMTP not confirmed.'
  },
  {
    id: 'actinc',
    name: 'ACTINC',
    domains: ['actinc.co.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'bb4u',
    name: 'BB4U',
    domains: ['pycm.bb4u.ne.jp'],
    imapHost: 'mbox.mose-mail.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mbox.mose-mail.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'heavytees',
    name: 'Heavytees',
    domains: ['heavytees.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'mesh',
    name: 'BIGLOBE MESH',
    domains: ['mesh.ne.jp'],
    matchSubdomains: true,
    imapHost: 'mail.biglobe.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.biglobe.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Legacy MESH accounts may require completed BIGLOBE migration.'
  },
  {
    id: 'smilewedding',
    name: 'Smile Wedding',
    domains: ['smilewedding.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'soutbank',
    name: 'Soutbank',
    domains: ['soutbank.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'rakuten',
    name: 'Rakuten',
    domains: ['rakuten.co.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Mailbox service not confirmed for this domain.'
  },
  {
    id: 'speednet',
    name: 'Speednet',
    domains: ['spn1.speednet.ne.jp'],
    imapHost: 'imap2.cm.dream.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'vsmtp2.cm.dream.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'em-net',
    name: 'e-mansion / EM-NET',
    domains: ['ce.em-net.ne.jp'],
    imapHost: 'imap.em-net.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.ce.em-net.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Confirm the SMTP server name for your account.'
  },
  {
    id: 'kcn-m4',
    name: 'KCN m4',
    domains: ['m4.kcn.ne.jp'],
    imapHost: 'm4.kcn.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'm4.kcn.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Example server only. Confirm against your KCN registration details.'
  },
  {
    id: 'enjoy',
    name: 'ENJOY',
    domains: ['enjoy.ne.jp'],
    imapHost: 'imaps.enjoy.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtps.enjoy.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'stupid',
    name: 'Stupid.jp',
    domains: ['stupid.jp'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'myad',
    name: 'BIGLOBE Myad',
    domains: ['myad.jp'],
    imapHost: 'mail.biglobe.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.biglobe.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },

  // PROVIDER JEPANG TAMBAHAN (2026-11)
  // IMAP port 993 uses SSL/TLS.
  // SMTP port 587 uses STARTTLS if smtpSecure is false.

  {
    id: 'plala',
    name: 'Plala',
    domains: ['plala.or.jp'],
    matchSubdomains: true,
    imapHost: 'imap.plala.or.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'secure.plala.or.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'eonet',
    name: 'eo / eonet',
    domains: ['eonet.ne.jp'],
    matchSubdomains: true,
    imapHost: 'imaps.eonet.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtps.eonet.ne.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'bb-excite',
    name: 'BB.excite Mail',
    domains: [
      'sky.bbexcite.jp',
      'star.bbexcite.jp',
      'love.bbexcite.jp',
      'happy.bbexcite.jp',
      'dream.bbexcite.jp',
      'mail.bbexcite.jp'
    ],
    imapHost: 'mbox.mose-mail.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mbox.mose-mail.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Existing BB.excite Mail accounts; new applications suspended since August 2023. Does not apply to discontinued @excite.co.jp mail.'
  },
  {
    id: 't-com',
    name: '@T COM',
    domains: ['t-com.ne.jp'],
    matchSubdomains: true,
    imapHost: 'imaps.t-com.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtps.t-com.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'IMAP requires a prior mail specification change/activation.'
  },
  {
    id: 'iijmio',
    name: 'IIJmio Safety Mail',
    domains: [
      'iijmio-mail.jp', 'mio.jp',
      'miomio.jp', 'miobox.jp',
      'e23.jp', 'x-il.jp'
    ],
    imapHost: 'imap.iijmio-mail.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mbox.iijmio-mail.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Requires an active IIJmio Safety Mail account.'
  },
  {
    id: 'iij4u',
    name: 'IIJ4U',
    domains: ['iij4u.or.jp'],
    imapHost: 'imap.iij4u.or.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mbox.iij4u.or.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Legacy IIJ4U email service; confirm account eligibility.'
  },
  {
    id: 'asahi-net',
    name: 'ASAHI Net',
    domains: [
      'asahi-net.or.jp',
      'asahinet.jp',
      'asahi-net.co.jp'
    ],
    imapHost: 'imap.asahi-net.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.asahi-net.or.jp',
    smtpPort: 465,
    smtpSecure: true
  },
  {
    id: 'tikitiki',
    name: 'TikiTiki',
    domains: [
      'tiki.ne.jp',
      'et.tiki.ne.jp',
      'wt.tiki.ne.jp'
    ],
    matchSubdomains: true,
    imapHost: 'mail.tiki.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.tiki.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'For the standard renewed mail service; separate hosting products may use other servers.'
  },
  {
    id: 'interlink-mail',
    name: 'INTERLINK Mail',
    domains: ['imail.moe', 'imail.earth'],
    imapHost: 'imail.moe',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'imail.moe',
    smtpPort: 587,
    smtpSecure: false,
    notes: 'IMAP/SMTP may use imail.moe or imail.earth according to the account. SMTP uses STARTTLS on port 587.'
  },
  {
    id: 'kcn',
    name: 'KCN (account-specific)',
    domains: ['kcn.jp', 'kcn.ne.jp'],
    matchSubdomains: true,
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Server address varies by account. Check KCN registration documents. No universal host has been confirmed.'
  },
  {
    id: 'docomo',
    name: 'NTT Docomo Mail',
    domains: ['docomo.ne.jp'],
    imapHost: 'imap.spmode.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.spmode.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'For PC/Android; iPhone/iPad use imap2.spmode.ne.jp. Requires d account ID and IMAP-specific password.'
  },
  {
    id: 'softbank',
    name: 'SoftBank E-Mail(i)',
    domains: ['i.softbank.jp'],
    imapHost: 'imap.softbank.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.softbank.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'For E-Mail(i) accounts, not necessarily @softbank.ne.jp MMS.'
  },
  {
    id: 'ymobile',
    name: 'Y!mobile Mail',
    domains: ['yahoo.ne.jp'],
    imapHost: 'ymobileimap.mail.yahoo.ne.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'ymobilesmtp.mail.yahoo.ne.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'Y!mobile mail service; provider warns PC mail clients may be unsupported.'
  },
  {
    id: 'rakumail',
    name: 'Rakuten Mobile RakuMail Portability',
    domains: ['rakumail.jp'],
    imapHost: 'mail.rakumail.jp',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.rakumail.jp',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'External IMAP/SMTP is documented for RakuMail Portability; requires IMAP password and eligible subscription.'
  },
  {
    id: 'au-mail',
    name: 'au Mail / ezweb',
    domains: ['ezweb.ne.jp', 'au.com'],
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    notes: 'For au Mail Portability, obtain account-specific IMAP/SMTP host and credentials from au My Page. Do not assume a global hostname.'
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
        (provider.matchSubdomains &&
         domain.endsWith('.' + base));
    })
  ) || window.PROVIDERS.find(p => p.id === 'manual');
};
