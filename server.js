
function createImapClient(session) {
  return new ImapFlow({
    host: session.imapHost,
    port: Number(session.imapPort),
    secure: session.imapSecure,
    auth: {
      user: session.email,
      pass: session.password
    },
    logger: false,
    tls: {
      rejectUnauthorized: true,
      ciphers: 'DEFAULT@SECLEVEL=0',
      minDHSize: 512
    }
  });
}
