Japan Mail Web - Full Stack Prototype
Requirements: Node.js 18+
Run:
  npm install
  npm start
Then visit http://localhost:3000
For internet use deploy behind HTTPS (reverse proxy / managed platform). Do not expose plain HTTP publicly.
Security notes:
- Prototype stores authenticated mail credentials in RAM in server process until logout/restart; use a private server, HTTPS, rate limiting, CSRF protection, secure session architecture and audit before public production use.
- IMAP UID handling is simplified; provider host/port/security varies. IMAP fetch currently shows raw MIME, not parsed body/attachments.
- Do not use credentials for providers where IMAP/app passwords are not enabled.
