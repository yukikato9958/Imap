const express=require('express'),{ImapFlow}=require('imapflow'),nodemailer=require('nodemailer');
const app=express();app.use(express.json({limit:'1mb'}));app.use(express.static('public'));
const sessions=new Map(); // prototype: in-memory credentials only
function auth(req,res,next){let s=sessions.get(req.headers.authorization||'');if(!s)return res.status(401).json({error:'Sesi tidak valid. Login ulang.'});req.mail=s;next()}
app.post('/api/login',async(req,res)=>{
 const {email,password,imapHost,imapPort=993,smtpHost,smtpPort=465}=req.body;
 if(!email||!password||!imapHost)return res.status(400).json({error:'Email, password, dan host IMAP wajib.'});
 const cfg={host:imapHost,port:Number(imapPort),secure:Number(imapPort)===993,auth:{user:email,pass:password},logger:false};
 let c=new ImapFlow(cfg);
 try{await c.connect();await c.logout();let token=require('crypto').randomBytes(32).toString('hex');
 sessions.set(token,{email,password,imapHost,imapPort:Number(imapPort),smtpHost,smtpPort:Number(smtpPort)});res.json({token,email})}
 catch(e){try{await c.logout()}catch{};res.status(400).json({error:'IMAP gagal: '+e.message})}
});
app.get('/api/inbox',auth,async(req,res)=>{
 let c=new ImapFlow({host:req.mail.imapHost,port:req.mail.imapPort,secure:req.mail.imapPort===993,auth:{user:req.mail.email,pass:req.mail.password},logger:false});
 try{await c.connect();let lock=await c.getMailboxLock('INBOX');try{let out=[];let total=c.mailbox.exists||0;let start=Math.max(1,total-29);
 for(let seq=start;seq<=total;seq++){try{for await(let m of c.fetch(seq,{envelope:true,flags:true,uid:true})){out.push({uid:m.uid,subject:m.envelope?.subject||'(Tanpa subjek)',from:m.envelope?.from?.map(x=>x.name||x.address).join(', ')||'',date:m.envelope?.date})}}catch{}}
 res.json({total,messages:out.reverse()})}finally{lock.release();await c.logout()}}
 catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/message/:uid',auth,async(req,res)=>{
 let c=new ImapFlow({host:req.mail.imapHost,port:req.mail.imapPort,secure:req.mail.imapPort===993,auth:{user:req.mail.email,pass:req.mail.password},logger:false});
 try{await c.connect();let lock=await c.getMailboxLock('INBOX');try{let m=await c.fetchOne(Number(req.params.uid),{source:true,envelope:true},{uid:true});if(!m)return res.status(404).json({error:'Email tidak ditemukan'});res.json({uid:m.uid,subject:m.envelope?.subject,from:m.envelope?.from?.map(x=>x.address).join(', '),raw:m.source.toString('utf8').slice(0,150000)})}finally{lock.release();await c.logout()}}
 catch(e){res.status(500).json({error:e.message})}
});
app.post('/api/send',auth,async(req,res)=>{
 const {to,subject,text}=req.body;if(!to||!subject||!text)return res.status(400).json({error:'To, subject, isi wajib'});
 if(!req.mail.smtpHost)return res.status(400).json({error:'Isi SMTP host saat login.'});
 try{let t=nodemailer.createTransport({host:req.mail.smtpHost,port:req.mail.smtpPort,secure:req.mail.smtpPort===465,auth:{user:req.mail.email,pass:req.mail.password}});
 let info=await t.sendMail({from:req.mail.email,to,subject,text});res.json({ok:true,messageId:info.messageId})}catch(e){res.status(500).json({error:'SMTP gagal: '+e.message})}
});
app.post('/api/logout',auth,(req,res)=>{sessions.delete(req.headers.authorization);res.json({ok:true})});
const port=process.env.PORT||3000;app.listen(port,()=>console.log('Japan Mail berjalan di port '+port));
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log('Japan Mail berjalan di port ' + port);
});
