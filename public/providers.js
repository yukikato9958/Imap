
window.PROVIDERS = [
 {id:'dti',name:'DTI',domains:['dti.ne.jp'],imapHost:'imap.cm.dream.jp',imapPort:993,imapSecure:true,smtpHost:'vsmtp.cm.dream.jp',smtpPort:465,smtpSecure:true,notes:'DTI: hostname dapat berbeda tergantung layanan/domain. Jika gagal, cek panduan DTI.'},
 {id:'biglobe',name:'BIGLOBE',domains:['biglobe.ne.jp'],imapHost:'imap.biglobe.ne.jp',imapPort:993,imapSecure:true,smtpHost:'mail.biglobe.ne.jp',smtpPort:465,smtpSecure:true},
 {id:'ocn',name:'OCN',domains:['ocn.ne.jp'],imapHost:'imap.ocn.ne.jp',imapPort:993,imapSecure:true,smtpHost:'smtp.ocn.ne.jp',smtpPort:465,smtpSecure:true},
 {id:'so-net',name:'So-net',domains:['so-net.ne.jp'],imapHost:'imap.so-net.ne.jp',imapPort:993,imapSecure:true,smtpHost:'mail.so-net.ne.jp',smtpPort:465,smtpSecure:true},
 {id:'nifty',name:'@nifty',domains:['nifty.com'],imapHost:'imap.nifty.com',imapPort:993,imapSecure:true,smtpHost:'smtp.nifty.com',smtpPort:465,smtpSecure:true},
 {id:'yahoo-jp',name:'Yahoo! JAPAN',domains:['yahoo.co.jp'],imapHost:'imap.mail.yahoo.co.jp',imapPort:993,imapSecure:true,smtpHost:'smtp.mail.yahoo.co.jp',smtpPort:465,smtpSecure:true,notes:'Mungkin memerlukan pengaturan IMAP khusus.'},
 {id:'yahoo-com',name:'Yahoo Mail',domains:['yahoo.com'],imapHost:'imap.mail.yahoo.com',imapPort:993,imapSecure:true,smtpHost:'smtp.mail.yahoo.com',smtpPort:465,smtpSecure:true},
 {id:'gmail',name:'Gmail',domains:['gmail.com','googlemail.com'],imapHost:'imap.gmail.com',imapPort:993,imapSecure:true,smtpHost:'smtp.gmail.com',smtpPort:465,smtpSecure:true,notes:'Gunakan App Password jika diperlukan.'},
 {id:'icloud',name:'iCloud',domains:['icloud.com','me.com','mac.com'],imapHost:'imap.mail.me.com',imapPort:993,imapSecure:true,smtpHost:'smtp.mail.me.com',smtpPort:587,smtpSecure:false,notes:'Gunakan app-specific password Apple.'},
 {id:'outlook',name:'Outlook/Hotmail',domains:['outlook.com','hotmail.com','live.com'],imapHost:'outlook.office365.com',imapPort:993,imapSecure:true,smtpHost:'smtp.office365.com',smtpPort:587,smtpSecure:false},
 {id:'toukai',name:'Toukai / ISP regional',domains:['toukai.me'],imapHost:'imap.toukai.me',imapPort:993,imapSecure:true,smtpHost:'smtp.toukai.me',smtpPort:465,smtpSecure:true,notes:'Hostname perlu dikonfirmasi ke provider.'},
 {id:'kanto',name:'Kanto / ISP regional',domains:['kanto.me'],imapHost:'imap.kanto.me',imapPort:993,imapSecure:true,smtpHost:'smtp.kanto.me',smtpPort:465,smtpSecure:true,notes:'Hostname perlu dikonfirmasi ke provider.'},
 {id:'manual',name:'Lainnya / isi manual',domains:[],imapHost:'',imapPort:993,imapSecure:true,smtpHost:'',smtpPort:465,smtpSecure:true}
];

window.detectProvider = function(email) {
 const d = (email.split('@')[1] || '').trim().toLowerCase();
 return window.PROVIDERS.find(p => p.domains.includes(d))
   || window.PROVIDERS.find(p => p.id === 'manual');
};
