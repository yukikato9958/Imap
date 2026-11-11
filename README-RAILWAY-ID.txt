JAPAN MAIL - PAKET SIAP DEPLOY RAILWAY (PROTOTIPE)

PENTING:
- Paket ini sudah disiapkan untuk Railway, tetapi BELUM online/ter-deploy.
- Ini prototipe. Jangan gunakan password email utama/akun penting.
- Railway akan membuat URL publik; URL itu belum ada sebelum deployment berhasil.

CARA DEPLOY PALING MUDAH (GitHub + Railway):
1. Buat akun GitHub: https://github.com
2. Buat repository baru, misalnya japan-mail (Public atau Private).
3. Upload SEMUA isi folder ZIP ini ke repository (file server.js, package.json,
   folder public, dan railway.json harus berada di root repository).
4. Buka https://railway.com lalu login dengan GitHub.
5. Pilih New Project -> Deploy from GitHub Repo -> pilih repository japan-mail.
6. Tunggu build/deploy selesai. Railway menjalankan `npm start` otomatis.
7. Di service Railway buka Settings -> Networking -> Generate Domain.
8. Buka domain .up.railway.app tersebut di Chrome Android.

CARA LOGIN DI JAPAN MAIL:
- Email: alamat email lengkap
- Password: password email (atau app password jika provider mewajibkan)
- IMAP Host/Port: sesuai provider (umumnya port 993 SSL)
- SMTP Host/Port: isi jika ingin mengirim email (umumnya port 465 SSL)

CATATAN PROVIDER:
Host IMAP/SMTP berbeda-beda untuk BIGLOBE, OCN, So-net, Yahoo! JAPAN, Nifty,
Toukai, Kanto, TTCN, dan provider lain. Aplikasi ini belum otomatis mengetahui
setting semua provider; masukkan host yang benar dari provider email.

BATASAN & KEAMANAN:
- Prototipe ini menyimpan sesi/password email sementara di RAM server.
- Belum ada audit keamanan, enkripsi penyimpanan, rate limiting, atau proteksi
  lengkap terhadap abuse. Jangan dipakai untuk akun sensitif/utama.
- Email dapat gagal tampil sempurna jika MIME/encoding provider berbeda.
- Railway bisa meminta pembayaran/credit bergantung kebijakan akun dan pemakaian.
