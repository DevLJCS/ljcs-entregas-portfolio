import {AccountEmails,ADMIN_EMAIL_ACCOUNT} from './account-emails';
import { DurableObject } from 'cloudflare:workers';
import {address,classify,distance,rate,text,formatAddress,type Address} from './central-rules';
import {PLANS,access,planId,renewedUntil,accessDate,reportRange,type Subscription} from './subscription-rules';
import {TERMS_VERSION} from '../shared/terms';
import {CentralKeys} from './central-passkeys';
import type {AuthenticationResponseJSON,RegistrationResponseJSON} from '@simplewebauthn/server';
import {Operation,region} from './operation';
import {DriverTools} from './driver-tools';

type SQLValue=string|number|null;
interface Account {id:string;email:string;role:string;name:string;responsible:string;phone:string;address:string|null;approved:number;online:number;lat:number|null;lng:number|null;geo_at:number;seen_at:number;salt:string;password:string}
interface Order {id:string;store_id:string;store_name:string;responsible:string;pickup:string;destination:string;amount:number;details:string;status:string;driver_id:string|null;offered_to:string|null;expires_at:number;created_at:number;client_id:string}
interface Quote {id:string;store_id:string;data:string;amount:number|null;reason:string;approved:number;expires_at:number;order_id:string|null}
interface OrderData {pickup:Address;destination:Address;responsible:string;sacks:number;heavy:boolean;exchange:boolean;retry:boolean;peixinho:boolean;rain:boolean|null;weatherTime:string|null;weatherSource:string;zone:string;unit:number;trips:number}
const COOKIE='__Host-central_session';
const json=(value:unknown,status=200,headers:HeadersInit={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const enc=new TextEncoder();
async function sha(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function digest(password:string,salt:string){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return [...new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function same(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function cookie(req:Request){return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
function safeUser(u:Account){return {id:u.id,role:u.role,name:u.name,responsible:u.responsible,phone:u.phone,email:u.email,address:u.address?JSON.parse(u.address):null,approved:!!u.approved,online:!!u.online};}

// One coordination actor per operating city. All assignment decisions are synchronous SQLite transactions.
export class DispatchCity extends DurableObject<Record<string,never>> {
  private sql:SqlStorage;
  private keys:CentralKeys;
  private emails:AccountEmails;
  private operation:Operation;
  private tools:DriverTools;
  constructor(ctx:DurableObjectState,env:Record<string,never>){super(ctx,env);this.sql=ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,name TEXT NOT NULL,responsible TEXT NOT NULL,phone TEXT NOT NULL,address TEXT,approved INTEGER NOT NULL DEFAULT 0,online INTEGER NOT NULL DEFAULT 0,lat REAL,lng REAL,geo_at INTEGER NOT NULL DEFAULT 0,seen_at INTEGER NOT NULL DEFAULT 0,salt TEXT NOT NULL,password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,store_id TEXT NOT NULL,store_name TEXT NOT NULL,responsible TEXT NOT NULL,pickup TEXT NOT NULL,destination TEXT NOT NULL,amount INTEGER NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL,driver_id TEXT,offered_to TEXT,expires_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,client_id TEXT NOT NULL,UNIQUE(store_id,client_id));
      CREATE TABLE IF NOT EXISTS offers(order_id TEXT NOT NULL,driver_id TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(order_id,driver_id));
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,store_id TEXT NOT NULL,data TEXT NOT NULL,amount INTEGER,reason TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL,order_id TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_ratings(order_id TEXT PRIMARY KEY,from_user TEXT NOT NULL,to_user TEXT NOT NULL,score INTEGER NOT NULL CHECK(score>=1 AND score<=5),comment TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_incidents(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,actor_id TEXT NOT NULL,type TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_messages(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,sender_id TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_route_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,actor_id TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,event TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT PRIMARY KEY,plan TEXT NOT NULL,valid_until INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS subscription_payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,plan TEXT NOT NULL,weeks INTEGER NOT NULL,amount INTEGER NOT NULL,paid_at INTEGER NOT NULL,valid_until INTEGER NOT NULL,note TEXT NOT NULL,created_at INTEGER NOT NULL,client_id TEXT NOT NULL,UNIQUE(user_id,client_id));
      CREATE TABLE IF NOT EXISTS subscription_events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,event TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS subscription_history ON subscription_payments(user_id,created_at);
      CREATE INDEX IF NOT EXISTS order_status ON orders(status,expires_at);
      CREATE INDEX IF NOT EXISTS order_store ON orders(store_id,created_at);
      CREATE INDEX IF NOT EXISTS order_driver ON orders(driver_id,status);`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS event_order_type ON events(order_id,event,created_at)");
    this.sql.exec('CREATE TABLE IF NOT EXISTS terms_acceptances(user_id TEXT NOT NULL,version TEXT NOT NULL,role TEXT NOT NULL,accepted_at INTEGER NOT NULL,PRIMARY KEY(user_id,version))');
    this.keys=new CentralKeys(this.sql);
    this.emails=new AccountEmails(this.sql);
    this.operation=new Operation(this.sql);
    this.tools=new DriverTools(this.sql);
  }
  private rows<T extends Record<string,SqlStorageValue>>(q:string,...args:SQLValue[]):T[]{return this.sql.exec<T>(q,...args).toArray();}
  private one<T>(q:string,...args:SQLValue[]):T|undefined{return this.sql.exec(q,...args).toArray()[0] as T|undefined;}
  private limit(key:string,max:number,ms:number){const now=Date.now();const row=this.one<{count:number;expires_at:number}>('SELECT * FROM limits WHERE key=?',key);if(row&&row.expires_at>now&&row.count>=max)throw new Error('Muitas tentativas. Aguarde alguns minutos.');this.sql.exec('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END',key,now+ms,now,now);}
  private async user(req:Request){const token=cookie(req);if(!token)return null;return this.one<Account>('SELECT a.* FROM accounts a JOIN sessions s ON s.user_id=a.id WHERE s.token=? AND s.expires_at>?',await sha(token),Date.now())||null;}
  private event(id:string,actor:string,event:string){this.sql.exec('INSERT INTO events(order_id,actor,event,created_at) VALUES(?,?,?,?)',id,actor,event,Date.now());}
  private subscription(id:string){return this.one<Subscription>('SELECT * FROM subscriptions WHERE user_id=?',id);}
  checkPasskeyRate(ip:string){this.limit('passkey:'+text(ip,100),100,900000);}
  private viewUser(u:Account){return {...safeUser(u),region:this.operation.accountRegion(u.id),terms:this.one('SELECT version,accepted_at FROM terms_acceptances WHERE user_id=? AND version=?',u.id,TERMS_VERSION)||null,termsRequired:!this.one('SELECT user_id FROM terms_acceptances WHERE user_id=? AND version=?',u.id,TERMS_VERSION),passkeyCount:this.keys.list(u.id).length,subscription:u.role==='driver'?access(this.subscription(u.id),!!u.approved):null};}
  private async issueUserSession(u:Account,extra:Record<string,unknown>={}){const token=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();this.sql.exec('DELETE FROM sessions WHERE expires_at<?',now);this.sql.exec('INSERT INTO sessions VALUES(?,?,?)',await sha(token),u.id,now+14*86400000);return json({user:this.viewUser(u),role:u.role,...extra},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1209600`});}
  emailAccount(email:string){return this.emails.owner(email);}
  syncAdminEmail(email:string){return email?this.emails.initializeAdmin(email):'';}
  adminEmails(primary:string){return this.emails.list(ADMIN_EMAIL_ACCOUNT,this.emails.primary(ADMIN_EMAIL_ACCOUNT,primary));}
  manageAdminEmails(primary:string,b:{action:string;email:string}){return this.emails.manage(ADMIN_EMAIL_ACCOUNT,this.emails.primary(ADMIN_EMAIL_ACCOUNT,primary),b);}
  async authenticatePasskey(response:AuthenticationResponseJSON,challenge:string,origin:string,rpID:string){try{const id=await this.keys.authenticate(response,challenge,origin,rpID),u=this.one<Account>('SELECT * FROM accounts WHERE id=?',id);if(!u)throw new Error('Conta não encontrada.');return this.issueUserSession(u);}catch{return json({error:'Não foi possível validar sua passkey.'},401);}}
  private withdrawOffers(id:string,reason:string){
    this.sql.exec('UPDATE accounts SET online=0 WHERE id=?',id);
    const active=this.sql.exec("SELECT id FROM orders WHERE offered_to=? AND status='offered'",id).toArray();
    for(const o of active){this.sql.exec("UPDATE orders SET status='waiting',offered_to=NULL,expires_at=0 WHERE id=?",o.id);this.sql.exec('UPDATE offers SET result=? WHERE order_id=? AND driver_id=?',reason,o.id,id);this.event(String(o.id),'system',reason);}
  }
  private tick(){const now=Date.now();this.ctx.storage.transactionSync(()=>{
    if(!this.operation.snapshot().active){
      for(const o of this.sql.exec("SELECT id,offered_to FROM orders WHERE status='offered'").toArray())this.withdrawOffers(String(o.offered_to),'operation_paused');
      this.sql.exec("UPDATE accounts SET online=0 WHERE role='driver' AND online=1");
      this.sql.exec("UPDATE orders SET status='unavailable' WHERE status='waiting' AND created_at<=?",now-600000);return;
    }
    const blocked=this.sql.exec("SELECT a.id FROM accounts a LEFT JOIN subscriptions s ON s.user_id=a.id WHERE a.role='driver' AND (a.online=1 OR EXISTS(SELECT 1 FROM orders o WHERE o.status='offered' AND o.offered_to=a.id)) AND (a.approved=0 OR s.user_id IS NULL OR s.revoked=1 OR s.valid_until<=? OR NOT EXISTS(SELECT 1 FROM terms_acceptances t WHERE t.user_id=a.id AND t.version=?))",now,TERMS_VERSION).toArray();
    for(const d of blocked)this.withdrawOffers(String(d.id),'access_blocked');
    const expired=this.sql.exec('SELECT * FROM orders WHERE status=? AND expires_at<=?','offered',now).toArray() as unknown as Order[];
    for(const o of expired){this.sql.exec('UPDATE offers SET result=? WHERE order_id=? AND driver_id=?','expired',o.id,o.offered_to);this.sql.exec('UPDATE orders SET status=?,offered_to=NULL,expires_at=0 WHERE id=?','waiting',o.id);this.event(o.id,'system','offer_expired');}
    const waiting=this.sql.exec("SELECT * FROM orders WHERE status='waiting' ORDER BY created_at,id").toArray() as unknown as Order[];
    for(const o of waiting){
      if(now-o.created_at>10*60*1000){this.sql.exec("UPDATE orders SET status='unavailable' WHERE id=?",o.id);this.event(o.id,'system','no_driver');continue;}
      const p=JSON.parse(o.pickup) as Address;
      const candidates=this.sql.exec(`SELECT a.id,a.lat,a.lng FROM accounts a JOIN subscriptions s ON s.user_id=a.id JOIN account_regions r ON r.user_id=a.id WHERE r.city_key='JAU' AND r.state='SP' AND s.revoked=0 AND s.valid_until>? AND EXISTS(SELECT 1 FROM terms_acceptances t WHERE t.user_id=a.id AND t.version=?) AND a.role='driver' AND a.approved=1 AND a.online=1 AND a.seen_at>? AND a.geo_at>? AND a.lat IS NOT NULL AND a.lng IS NOT NULL AND NOT EXISTS(SELECT 1 FROM offers f WHERE f.order_id=? AND f.driver_id=a.id) AND NOT EXISTS(SELECT 1 FROM orders busy WHERE (busy.status='accepted' AND busy.driver_id=a.id) OR (busy.status='offered' AND busy.offered_to=a.id))`,now,TERMS_VERSION,now-15000,now-45000,o.id).toArray() as {id:string;lat:number;lng:number}[];
      candidates.sort((a,b)=>distance(p.lat,p.lng,a.lat,a.lng)-distance(p.lat,p.lng,b.lat,b.lng)||a.id.localeCompare(b.id));
      const d=candidates[0];if(!d)continue;
      this.sql.exec("UPDATE orders SET status='offered',offered_to=?,expires_at=? WHERE id=?",d.id,now+5000,o.id);
      this.sql.exec("INSERT INTO offers VALUES(?,?,'pending',?)",o.id,d.id,now);this.event(o.id,'system','offered');
    }
  });}
  private async schedule(){const now=Date.now(),row=this.one<{next:number|null}>("SELECT MIN(t) AS next FROM (SELECT CASE WHEN status='offered' THEN expires_at ELSE created_at+600000 END AS t FROM orders WHERE status IN ('offered','waiting') UNION ALL SELECT s.valid_until AS t FROM subscriptions s JOIN accounts a ON a.id=s.user_id WHERE s.revoked=0 AND s.valid_until>? AND a.online=1)",now);if(row?.next)await this.ctx.storage.setAlarm(Math.max(now+50,row.next));else await this.ctx.storage.deleteAlarm();}
  async alarm(){this.tick();await this.schedule();}
  private async weather(){
    const now=Date.now(),cached=this.one<{value:string;expires_at:number}>("SELECT * FROM cache WHERE key='weather'");
    let data: {properties:{timeseries:{time:string;data:{next_1_hours?:{details:{precipitation_amount:number}}}}[]}};
    if(cached&&cached.expires_at>now)data=JSON.parse(cached.value);
    else {
      const failed=this.one<{expires_at:number}>("SELECT expires_at FROM cache WHERE key='weather-error'");
      if(failed&&failed.expires_at>now)return {rain:null,time:null,source:'Clima indisponível — revisão do administrador'};
      try{const res=await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-22.2965&lon=-48.5570',{headers:{'User-Agent':'LJCS-Entregas/1.10 (portfolio application)'},signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error('Weather');data=await res.json();this.sql.exec("INSERT OR REPLACE INTO cache VALUES('weather',?,?)",JSON.stringify(data),now+3*60*60*1000);}
      catch{this.sql.exec("INSERT OR REPLACE INTO cache VALUES('weather-error','{}',?)",now+60000);return {rain:null,time:null,source:'Clima indisponível — revisão do administrador'};}
    }
    const point=data.properties.timeseries.find(p=>new Date(p.time).getTime()<=now&&new Date(p.time).getTime()+3600000>now);
    if(!point?.data.next_1_hours)return {rain:null,time:null,source:'Clima indisponível — revisão do administrador'};
    return {rain:point.data.next_1_hours.details.precipitation_amount>0,time:point.time,source:'MET Norway · previsão de precipitação para esta hora em Jaú'};
  }
  private async handle(req:Request,owner:boolean):Promise<Response>{
    const url=new URL(req.url),path=url.pathname.replace('/api/central',''),method=req.method,now=Date.now();
    if(method!=='GET'&&req.headers.get('Origin')!==url.origin)return json({error:'Origem inválida.'},403);
    if(Number(req.headers.get('Content-Length')||0)>16000)return json({error:'Solicitação muito grande.'},413);
    const ip=req.headers.get('CF-Connecting-IP')||'local';
    if(path==='/operation'&&method==='GET')return json(this.operation.publicStatus());
    if(path==='/operation/invite-check'&&(method==='GET'||method==='POST')){this.limit('invite-check:'+ip,30,60000);const token=method==='POST'?String((await req.json() as {token?:string}).token||''):url.searchParams.get('token')||'';return json({valid:!!await this.operation.validateInvite(token)});}
    if(path==='/interest'&&method==='POST'){this.limit('interest:'+ip,12,3600000);this.operation.interest(await req.json() as Record<string,unknown>);return json({received:true});}
    if(path==='/register'&&method==='POST'){
      this.limit('register:'+ip,8,3600000);const b=await req.json() as Record<string,unknown>;
      const email=text(b.email,200).toLowerCase(),password=text(b.password,200),role=b.role;
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||!['store','driver'].includes(String(role))||!text(b.name)||!text(b.responsible)||String(b.phone||'').replace(/\D/g,'').length<10)throw new Error('Informe nome, responsável, telefone, e-mail e senha com pelo menos 10 caracteres.');
      const a=role==='store'?address(b.address):null,id=crypto.randomUUID(),salt=crypto.randomUUID();
      const selectedPlan=role==='driver'?planId(b.plan||'basic'):null;
      if(b.acceptTerms!==true||b.termsVersion!==TERMS_VERSION)throw new Error('Leia e aceite os termos atuais para criar sua conta.');
      const declared=role==='driver'?region(b.city,b.state):region(a!.city,a!.state);
      const invitation=role==='store'&&b.inviteToken?await this.operation.validateInvite(String(b.inviteToken),email):null;
      if(role==='store'&&!invitation&&!this.operation.publicStatus().publicStores)return json({error:'Cadastro de lojas por convite durante a preparação. Solicite análise do administrador.',inviteRequired:true},403);
      const hashed=await digest(password,salt);
      if(this.emails.owner(email))throw new Error('E-mail já cadastrado. Entre com sua senha.');
      this.ctx.storage.transactionSync(()=>{if(role==='store'){if(invitation)this.operation.consumeInvite(invitation,email);else if(!this.operation.publicStatus().publicStores)throw new Error('Cadastro público de lojas está fechado.');}this.emails.reserve(id,email);this.sql.exec('INSERT INTO accounts(id,email,role,name,responsible,phone,address,salt,password) VALUES(?,?,?,?,?,?,?,?,?)',id,email,String(role),text(b.name),text(b.responsible),text(b.phone,30),a?JSON.stringify(a):null,salt,hashed);
      this.operation.assign(id,declared.city,declared.state);
      if(selectedPlan)this.sql.exec('INSERT INTO subscriptions(user_id,plan) VALUES(?,?)',id,selectedPlan);
      this.sql.exec('INSERT INTO terms_acceptances VALUES(?,?,?,?)',id,TERMS_VERSION,String(role),Date.now());});
      return this.issueUserSession(this.one<Account>('SELECT * FROM accounts WHERE id=?',id)!,{registered:true});
    }
    if(path==='/login'&&method==='POST'){
      this.limit('login:'+ip,20,900000);const b=await req.json() as Record<string,unknown>;
      const u=this.one<Account>('SELECT a.* FROM accounts a JOIN account_emails e ON e.user_id=a.id WHERE e.email=?',text(b.email,254).toLowerCase());
      const result=await digest(text(b.password,200),u?.salt||'invalid-salt');
      if(!u||!same(result,u.password))return json({error:'E-mail ou senha inválidos.'},401);
      return this.issueUserSession(u);
    }
    const user=await this.user(req);
    if(path==='/me'&&method==='GET')return json({user:user?this.viewUser(user):null,owner,serverTime:now});
    if(path==='/logout'&&method==='POST'){if(user){this.sql.exec('DELETE FROM sessions WHERE token=?',await sha(cookie(req)));this.sql.exec('UPDATE accounts SET online=0 WHERE id=?',user.id);}return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`});}
    if(path==='/cep'&&method==='GET'){
      this.limit('cep:'+ (user?.id||ip),20,60000);const cep=(url.searchParams.get('cep')||'').replace(/\D/g,'');if(cep.length!==8)throw new Error('Digite um CEP com 8 números.');
      const cached=this.one<{value:string;expires_at:number}>('SELECT * FROM cache WHERE key=?','cep:'+cep);if(cached&&cached.expires_at>now)return json(JSON.parse(cached.value));
      const res=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:AbortSignal.timeout(7000)});if(!res.ok)throw new Error('Busca de CEP indisponível. Preencha o endereço manualmente.');const data=await res.json() as {erro?:boolean};if(data.erro)throw new Error('CEP não encontrado.');this.sql.exec('INSERT OR REPLACE INTO cache VALUES(?,?,?)','cep:'+cep,JSON.stringify(data),now+86400000);return json(data);
    }
    if(!user&&!owner)return json({error:'Entre para continuar.'},401);
    if(path==='/operation'&&method==='PUT'&&owner){const result=this.operation.save(await req.json() as {technical:boolean;enabled:boolean;publicStores:boolean;revision:number});this.tick();await this.schedule();return json(result);}
    if(path==='/operation/invite'&&method==='POST'&&owner){const b=await req.json() as {email:string;days:number};return json(await this.operation.invite(text(b.email,200).toLowerCase(),Number(b.days||7)));}
    if(path==='/terms/accept'&&method==='POST'&&user){const b=await req.json() as {acceptTerms:boolean;termsVersion:string};if(b.acceptTerms!==true||b.termsVersion!==TERMS_VERSION)throw new Error('Confirme o aceite da versão atual dos termos.');this.sql.exec('INSERT OR IGNORE INTO terms_acceptances VALUES(?,?,?,?)',user.id,TERMS_VERSION,user.role,now);return json({ok:true});}
    if(path==='/emails'&&user){
      if(method==='GET')return json(this.emails.list(user.id,user.email));
      if(method==='POST'){
        this.limit('manage-email:'+user.id,20,900000);
        const recent=this.one('SELECT user_id FROM sessions WHERE token=? AND expires_at>?',await sha(cookie(req)),now+14*86400000-15*60000);if(!recent)return json({error:'Saia e entre novamente para gerenciar seus e-mails. Seu login deve ter menos de 15 minutos.'},401);
        const b=await req.json() as {action:string;email:string;currentPassword:string};if(typeof b.currentPassword!=='string'||!same(await digest(b.currentPassword,user.salt),user.password))return json({error:'Senha atual incorreta.'},403);
        this.ctx.storage.transactionSync(()=>{const primary=this.one<Account>('SELECT * FROM accounts WHERE id=?',user.id)!.email;this.emails.manage(user.id,primary,b);if(b.action==='primary')this.sql.exec('UPDATE accounts SET email=? WHERE id=?',b.email.trim().toLowerCase(),user.id);});return json({ok:true});
      }
    }
    if(path==='/passkeys'&&method==='GET'&&user)return json({keys:this.keys.list(user.id)});
    if(path==='/passkeys'&&['PATCH','DELETE'].includes(method)&&user){
      const recent=this.one('SELECT user_id FROM sessions WHERE token=? AND expires_at>?',await sha(cookie(req)),now+14*86400000-15*60000);if(!recent)return json({error:'Por segurança, saia e entre novamente para gerenciar passkeys.'},401);
      return json(this.keys.manage(user.id,await req.json() as {id:string;name?:string},method));
    }
    if(path.startsWith('/passkey/register/')&&method==='POST'&&user){
      const recent=this.one('SELECT user_id FROM sessions WHERE token=? AND expires_at>?',await sha(cookie(req)),now+14*86400000-15*60000);if(!recent)return json({error:'Por segurança, entre novamente antes de adicionar uma passkey.'},401);
      if(path.endsWith('/options'))return json(await this.keys.options(user,req));
      if(path.endsWith('/verify'))return json(await this.keys.register(user.id,req,await req.json() as {challengeId:string;response:RegistrationResponseJSON}));
    }
    if(user&&!owner&&!this.one('SELECT user_id FROM terms_acceptances WHERE user_id=? AND version=?',user.id,TERMS_VERSION)&&!['/profile','/subscription'].includes(path))return json({error:'Leia e aceite os termos atuais para continuar.',termsRequired:true},403);
    if(path==='/subscription'&&method==='GET'&&user?.role==='driver')return json({subscription:access(this.subscription(user.id),!!user.approved),plans:PLANS,payments:this.sql.exec('SELECT id,plan,weeks,amount,paid_at,valid_until,note,created_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id).toArray()});
    if(path==='/subscription'&&method==='POST'&&owner){
      const b=await req.json() as Record<string,unknown>,id=text(b.userId,100),u=this.one<Account>("SELECT * FROM accounts WHERE id=? AND role='driver'",id);
      if(!u)throw new Error('Entregador não encontrado.');
      const current=this.subscription(id),revision=current?.revision||0,action=b.action;
      if(action==='payment'&&typeof b.clientId==='string'){const existing=this.one('SELECT * FROM subscription_payments WHERE user_id=? AND client_id=?',id,b.clientId);if(existing)return json({ok:true,payment:existing,subscription:access(current,!!u.approved)});}
      if(b.revision!==revision)return json({error:'Esta conta foi alterada. Atualize a administração antes de salvar.'},409);
      const plan=planId(b.plan||current?.plan||'basic');let until=current?.valid_until||0,revoked=current?.revoked||0,payment:Record<string,unknown>|undefined;
      this.ctx.storage.transactionSync(()=>{
        if(action==='payment'){
          const weeks=Number(b.weeks),amount=Number(b.amount),paidAt=accessDate(b.paidAt,now);
          if(paidAt>now+300000)throw new Error('Pagamento não pode estar no futuro.');
          if(!Number.isInteger(amount)||amount<1||amount>10000000)throw new Error('Valor pago inválido.');
          if(!/^[a-zA-Z0-9-]{16,100}$/.test(String(b.clientId||'')))throw new Error('Identificador de pagamento inválido.');
          until=renewedUntil(until,now,weeks);if(b.validUntil)until=accessDate(b.validUntil,now);if(until<=now)throw new Error('O pagamento precisa liberar uma validade futura.');revoked=0;
          const paymentId=crypto.randomUUID(),note=text(b.note,500);
          this.sql.exec('INSERT INTO subscription_payments VALUES(?,?,?,?,?,?,?,?,?,?)',paymentId,id,plan,weeks,amount,paidAt,until,note,now,String(b.clientId));
          payment={id:paymentId,amount,valid_until:until};
        }else if(action==='access'){
          until=accessDate(b.validUntil,now);if(typeof b.revoked!=='boolean')throw new Error('Estado de acesso inválido.');revoked=b.revoked?1:0;
        }else if(action==='revoke'){revoked=1;}else throw new Error('Ação inválida.');
        this.sql.exec('INSERT INTO subscriptions VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,valid_until=excluded.valid_until,revoked=excluded.revoked,revision=excluded.revision',id,plan,until,revoked,revision+1);
        this.sql.exec('INSERT INTO subscription_events(user_id,event,details,created_at) VALUES(?,?,?,?)',id,String(action),JSON.stringify({plan,validUntil:until,revoked:!!revoked,note:text(b.note,500)}),now);
        if(revoked||until<=now)this.withdrawOffers(id,'access_blocked');
      });this.tick();await this.schedule();return json({ok:true,payment,subscription:access(this.subscription(id),!!u.approved)});
    }
    if(user?.role==='driver'&&!owner&&!access(this.subscription(user.id),!!user.approved).active&&!['/profile','/subscription'].includes(path)){
      this.withdrawOffers(user.id,'access_blocked');this.tick();await this.schedule();return json({error:'Acesso bloqueado. Consulte seu plano e solicite a liberação ao administrador.',accessBlocked:true,subscription:access(this.subscription(user.id),!!user.approved)},403);
    }
    if(path.startsWith('/driver/')&&user?.role==='driver'){const s=this.subscription(user.id);if(!access(s,!!user.approved).active)return json({error:'Regularize sua assinatura.'},403);return this.tools.handle(req,user.id,s!.plan);}
    if((path==='/report'||path==='/report.csv')&&method==='GET'&&user?.role==='driver'){
      const s=this.subscription(user.id);if(!access(s,!!user.approved).active)return json({error:'Regularize sua assinatura para consultar os relatórios.'},403);
      if(s?.plan==='basic')return json({error:'Relatórios estão disponíveis nos planos Normal e Premium.'},403);
      if(path.endsWith('.csv')&&s?.plan!=='premium')return json({error:'Exportação CSV está disponível no plano Premium.'},403);
      this.limit('reports:'+user.id,30,60000);
      const range=reportRange(s!.plan,url.searchParams.get('days'),url.searchParams.get('from'),url.searchParams.get('to'));
      const query=`WITH completed AS (SELECT o.id,o.store_name,o.amount,COALESCE((SELECT MAX(e.created_at) FROM events e WHERE e.order_id=o.id AND e.event='completed'),o.created_at) AS completedAt FROM orders o WHERE o.driver_id=? AND o.status='completed')`;
      const totals=this.one<{count:number;total:number}>(query+' SELECT COUNT(*) AS count,COALESCE(SUM(amount),0) AS total FROM completed WHERE completedAt>=? AND completedAt<?',user.id,range.start,range.end)!;
      if(path.endsWith('.csv')){
        if(totals.count>10000)throw new Error('Este período tem mais de 10.000 entregas. Escolha um intervalo menor para exportar.');
        const rows=this.sql.exec(query+' SELECT * FROM completed WHERE completedAt>=? AND completedAt<? ORDER BY completedAt,id',user.id,range.start,range.end).toArray();
        const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
        const lines=['Conclusão (São Paulo);Estabelecimento;Valor da entrega (R$)',...rows.map(r=>[new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(Number(r.completedAt)),r.store_name,(Number(r.amount)/100).toFixed(2).replace('.',',')].map(cell).join(';'))];
        return new Response('\uFEFF'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="entregas-${range.from}-${range.to}.csv"`,'Cache-Control':'no-store'}});
      }
      const daily=this.sql.exec(query+" SELECT date(completedAt/1000,'unixepoch','-3 hours') AS day,COUNT(*) AS count,SUM(amount) AS total FROM completed WHERE completedAt>=? AND completedAt<? GROUP BY day ORDER BY day",user.id,range.start,range.end).toArray();
      return json({from:range.from,to:range.to,count:totals.count,total:totals.total,average:totals.count?Math.round(totals.total/totals.count):0,daily,exportAllowed:s?.plan==='premium'});
    }
    if(path==='/profile'&&method==='PUT'&&user){const b=await req.json() as Record<string,unknown>;if(!text(b.name)||!text(b.responsible)||String(b.phone||'').replace(/\D/g,'').length<10)throw new Error('Preencha nome, responsável e telefone.');const a=user.role==='store'?address(b.address):null;this.sql.exec('UPDATE accounts SET name=?,responsible=?,phone=?,address=? WHERE id=?',text(b.name),text(b.responsible),text(b.phone,30),a?JSON.stringify(a):null,user.id);return json({ok:true});}
    if(path==='/heartbeat'&&method==='POST'&&user?.role==='driver'){
      const b=await req.json() as {online?:boolean;lat?:number;lng?:number;geoAt?:number;accuracy?:number};
      if(b.online&&(!this.operation.snapshot().active||!this.operation.isPilot(user.id)))return json({error:'Sua região ainda está em preparação. Aguarde a abertura pelo administrador.'},403);
      if(b.online&&!user.approved)return json({error:'Seu cadastro aguarda liberação do administrador.'},403);
      if(b.online){if(!Number.isFinite(b.lat)||!Number.isFinite(b.lng)||!Number.isFinite(b.geoAt)||Math.abs(now-Number(b.geoAt))>45000||!Number.isFinite(b.accuracy)||Number(b.accuracy)>250||classify(Number(b.lat),Number(b.lng))==='outside')throw new Error('Precisamos de GPS recente em Jaú, com precisão de até 250 metros.');
        this.sql.exec('UPDATE accounts SET online=1,lat=?,lng=?,geo_at=?,seen_at=? WHERE id=?',Number(b.lat),Number(b.lng),Number(b.geoAt),now,user.id);
      }else this.sql.exec('UPDATE accounts SET online=0,seen_at=? WHERE id=?',now,user.id);
      this.tick();await this.schedule();return json({ok:true});
    }
    if(path==='/quote'&&method==='POST'&&user?.role==='store'){
      if(!this.operation.snapshot().active||!this.operation.isPilot(user.id))return json({error:'A operação ainda não está aberta para pedidos reais.'},403);
      if(!user.approved)return json({error:'Seu cadastro aguarda liberação do administrador.'},403);
      this.limit('quote:'+user.id,30,60000);const b=await req.json() as Record<string,unknown>;
      const pickup=b.otherPickup?address(b.pickup):address(JSON.parse(user.address||'null')),destination=address(b.destination),responsible=text(b.responsible||user.responsible);
      if(!responsible)throw new Error('Informe a pessoa responsável na retirada.');
      const sacks=Number(b.sacks||0);if(!Number.isInteger(sacks)||sacks<0||sacks>20)throw new Error('Quantidade de sacos inválida.');
      const weather=await this.weather(),rural=classify(destination.lat,destination.lng)==='rural'||classify(pickup.lat,pickup.lng)==='rural';
      const trips=Math.max(1,sacks,b.heavy?2:1),unit=rate(Date.now(),weather.rain===true,Boolean(b.peixinho));
      const data:OrderData={pickup,destination,responsible,sacks,heavy:Boolean(b.heavy),exchange:Boolean(b.exchange),retry:Boolean(b.retry),peixinho:Boolean(b.peixinho),rain:weather.rain,weatherTime:weather.time,weatherSource:weather.source,zone:rural?'rural':'urban',unit,trips};
      const reason=rural?'Zona rural: combinar o valor total com o administrador.':weather.rain===null?'Clima indisponível: valor precisa de revisão do administrador.':'';
      const amount=reason?null:unit*(trips*(data.exchange?2:1)+(data.retry?1:0)),id=crypto.randomUUID();
      this.sql.exec('DELETE FROM quotes WHERE expires_at<? AND order_id IS NULL',now-86400000);
      this.sql.exec('INSERT INTO quotes VALUES(?,?,?,?,?,0,?,NULL)',id,user.id,JSON.stringify(data),amount,reason,now+(reason?3600000:120000));
      return json({id,amount,reason,data,expiresAt:now+(reason?3600000:120000)});
    }
    if(path==='/quotes'&&method==='GET'&&user?.role==='store')return json({quotes:this.sql.exec('SELECT id,data,amount,reason,approved,expires_at FROM quotes WHERE store_id=? AND order_id IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 15',user.id,now).toArray()});
    if(path==='/orders'&&method==='POST'&&user?.role==='store'){
      if(!this.operation.snapshot().active||!this.operation.isPilot(user.id))return json({error:'A operação ainda não está aberta para pedidos reais.'},403);
      const b=await req.json() as {quoteId:string;clientId:string};if(!user.approved)return json({error:'Cadastro não liberado.'},403);if(!/^[a-zA-Z0-9-]{16,100}$/.test(b.clientId||''))throw new Error('Identificador de pedido inválido.');
      const existing=this.one<Order>('SELECT * FROM orders WHERE store_id=? AND client_id=?',user.id,b.clientId);if(existing)return json({id:existing.id});
      const q=this.one<Quote>('SELECT * FROM quotes WHERE id=? AND store_id=?',b.quoteId,user.id);if(!q||q.expires_at<=now)throw new Error('Atualize o cálculo antes de solicitar.');if(q.order_id)return json({id:q.order_id});if(q.amount===null)throw new Error('Aguarde o valor aprovado pelo administrador.');
      const data=JSON.parse(q.data) as OrderData;
      // Never allow a quote to carry an older night tariff across an hour boundary.
      if(!q.approved&&rate(now,data.rain===true,data.peixinho)!==data.unit)throw new Error('A faixa de horário mudou. Calcule novamente.');
      this.limit('order:'+user.id,10,60000);const id=crypto.randomUUID();
      this.ctx.storage.transactionSync(()=>{this.sql.exec('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,0,?,?)',id,user.id,user.name,data.responsible,JSON.stringify(data.pickup),JSON.stringify(data.destination),q.amount,q.data,'waiting',now,b.clientId);this.sql.exec('UPDATE quotes SET order_id=? WHERE id=?',id,q.id);this.event(id,user.id,'created');});this.tick();await this.schedule();return json({id});
    }
    if(path==='/orders'&&method==='GET'){
      this.tick();await this.schedule();
      if(user?.role==='store')return json({serverTime:Date.now(),orders:this.sql.exec('SELECT o.id,o.store_name,o.responsible,o.pickup,o.destination,o.amount,o.status,o.created_at,a.name AS driverName,a.phone AS driverPhone FROM orders o LEFT JOIN accounts a ON a.id=o.driver_id WHERE o.store_id=? ORDER BY o.created_at DESC LIMIT 50',user.id).toArray().map(o=>({...o,pickup:JSON.parse(String(o.pickup)),destination:JSON.parse(String(o.destination))}))});
      if(user?.role==='driver'){
        const orders=this.sql.exec("SELECT * FROM orders WHERE (offered_to=? AND status='offered') OR (driver_id=? AND status IN ('accepted','completed','cancelled')) ORDER BY created_at DESC LIMIT 30",user.id,user.id).toArray() as unknown as Order[];
        // Explicit allowlist: destination, store contacts and quote details never leave the server before acceptance.
        return json({serverTime:Date.now(),orders:orders.map(o=>o.status==='offered'?{id:o.id,status:o.status,expiresAt:o.expires_at,storeName:o.store_name,pickup:formatAddress(JSON.parse(o.pickup)),responsible:o.responsible,amount:o.amount}:{id:o.id,status:o.status,storeName:o.store_name,pickup:formatAddress(JSON.parse(o.pickup)),destination:formatAddress(JSON.parse(o.destination)),responsible:o.responsible,amount:o.amount})});
      }
    }
    if(path==='/answer'&&method==='POST'&&user?.role==='driver'){
      const b=await req.json() as {id:string;accept:boolean};if(typeof b.accept!=='boolean')throw new Error('Resposta inválida.');this.tick();let valid=false;
      this.ctx.storage.transactionSync(()=>{const o=this.one<Order>('SELECT * FROM orders WHERE id=?',b.id);if(!o||o.status!=='offered'||o.offered_to!==user.id||o.expires_at<=Date.now()||!user.approved)return;valid=true;
        this.sql.exec('UPDATE offers SET result=? WHERE order_id=? AND driver_id=?',b.accept?'accepted':'declined',o.id,user.id);this.sql.exec('UPDATE orders SET status=?,driver_id=?,offered_to=NULL,expires_at=0 WHERE id=?',b.accept?'accepted':'waiting',b.accept?user.id:null,o.id);this.event(o.id,user.id,b.accept?'accepted':'declined');});this.tick();await this.schedule();return valid?json({ok:true}):json({error:'Oferta encerrada. Ela já passou para outro entregador.'},409);
    }
    if(path==='/cancel'&&method==='POST'){
      const b=await req.json() as {id:string};const o=this.one<Order>('SELECT * FROM orders WHERE id=?',b.id);if(!o||(!owner&&o.store_id!==user?.id))return json({error:'Pedido não encontrado.'},404);
      if(o.status==='completed')throw new Error('Pedido já concluído.');this.sql.exec("UPDATE orders SET status='cancelled',offered_to=NULL,expires_at=0 WHERE id=?",o.id);this.event(o.id,user?.id||'owner','cancelled');this.tick();await this.schedule();return json({ok:true});
    }
    if(path==='/complete'&&method==='POST'&&user?.role==='driver'){
      const b=await req.json() as {id:string};const o=this.one<Order>("SELECT * FROM orders WHERE id=? AND driver_id=? AND status='accepted'",b.id,user.id);if(!o)throw new Error('Entrega não está em andamento para você.');this.sql.exec("UPDATE orders SET status='completed' WHERE id=?",o.id);this.event(o.id,user.id,'completed');this.tick();await this.schedule();return json({ok:true});
    }
    if(path==='/order-support'&&method==='GET'&&user){
      const orderId=text(url.searchParams.get('id'),100);
      const o=this.one<Order>('SELECT * FROM orders WHERE id=?',(orderId));
      if(!o||(!owner&&o.store_id!==user.id&&o.driver_id!==user.id))return json({error:'Pedido não encontrado.'},404);
      const rating=this.one('SELECT score,comment,created_at FROM order_ratings WHERE order_id=?',o.id);
      const messages=this.sql.exec('SELECT id,sender_id,body,created_at FROM order_messages WHERE order_id=? ORDER BY created_at',o.id).toArray();
      const incidents=this.sql.exec('SELECT id,type,description,status,created_at FROM order_incidents WHERE order_id=? ORDER BY created_at DESC',o.id).toArray();
      const route=this.sql.exec('SELECT lat,lng,event,created_at FROM order_route_events WHERE order_id=? ORDER BY created_at DESC LIMIT 30',o.id).toArray();
      return json({rating,messages,incidents,route});
    }
    if(path==='/order-message'&&method==='POST'&&user){
      const b=await req.json() as {id:string;body:string};
      const o=this.one<Order>('SELECT * FROM orders WHERE id=?',text(b.id,100));
      if(!o||(!owner&&o.store_id!==user.id&&o.driver_id!==user.id))return json({error:'Pedido não encontrado.'},404);
      const body=text(b.body,500);if(!body)throw new Error('Escreva uma mensagem.');
      this.sql.exec('INSERT INTO order_messages VALUES(?,?,?,?,?)',crypto.randomUUID(),o.id,user.id,body,now);
      this.event(o.id,user.id,'message');
      return json({ok:true});
    }
    if(path==='/order-incident'&&method==='POST'&&user){
      const b=await req.json() as {id:string;type:string;description:string};
      const o=this.one<Order>('SELECT * FROM orders WHERE id=?',text(b.id,100));
      if(!o||(!owner&&o.store_id!==user.id&&o.driver_id!==user.id))return json({error:'Pedido não encontrado.'},404);
      const type=text(b.type,40);const description=text(b.description,1000);
      if(!['delay','wrong-address','missing-customer','accident','damage','payment','other'].includes(type)||description.length<8)throw new Error('Selecione o tipo e descreva a ocorrência com pelo menos 8 caracteres.');
      this.sql.exec('INSERT INTO order_incidents VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),o.id,user.id,type,description,'open',now);
      this.event(o.id,user.id,'incident');
      return json({ok:true});
    }
    if(path==='/order-rating'&&method==='POST'&&user){
      const b=await req.json() as {id:string;score:number;comment:string};
      const o=this.one<Order>('SELECT * FROM orders WHERE id=?',text(b.id,100));
      if(!o||o.status!=='completed')throw new Error('A avaliação só fica disponível após a conclusão.');
      if(!owner&&o.store_id!==user.id&&o.driver_id!==user.id)return json({error:'Pedido não encontrado.'},404);
      const toUser=user.id===o.store_id?o.driver_id:o.store_id;if(!toUser)throw new Error('Ainda não há uma contraparte avaliada.');
      if(!Number.isInteger(b.score)||b.score<1||b.score>5)throw new Error('Escolha uma nota de 1 a 5.');
      this.sql.exec('INSERT OR IGNORE INTO order_ratings VALUES(?,?,?,?,?,?)',o.id,user.id,toUser,b.score,text(b.comment,500),now);
      this.event(o.id,user.id,'rated');
      return json({ok:true});
    }
    if(path==='/order-route'&&method==='POST'&&user?.role==='driver'){
      const b=await req.json() as {id:string;lat:number;lng:number;event:string};
      const o=this.one<Order>("SELECT * FROM orders WHERE id=? AND driver_id=? AND status='accepted'",text(b.id,100),user.id);
      if(!o)throw new Error('A rota só pode ser registrada durante uma entrega em andamento.');
      if(!Number.isFinite(b.lat)||!Number.isFinite(b.lng)||b.lat<-90||b.lat>90||b.lng<-180||b.lng>180)throw new Error('Localização inválida.');
      const event=text(b.event,30)||'location';
      this.sql.exec('INSERT INTO order_route_events VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),o.id,user.id,Number(b.lat),Number(b.lng),event,now);
      return json({ok:true});
    }
    if(path==='/admin'&&method==='GET'&&owner){this.tick();await this.schedule();return json({operation:this.operation.admin(),plans:PLANS,accounts:this.sql.exec('SELECT id,name,email,role,phone,approved,online,seen_at FROM accounts ORDER BY approved,name').toArray().map(a=>({...a,region:this.operation.accountRegion(String(a.id)),terms:this.one('SELECT version,accepted_at FROM terms_acceptances WHERE user_id=? AND version=?',String(a.id),TERMS_VERSION)||null,subscription:a.role==='driver'?access(this.subscription(String(a.id)),!!a.approved):null})),payments:this.sql.exec('SELECT id,user_id,plan,weeks,amount,paid_at,valid_until,note,created_at FROM subscription_payments ORDER BY created_at DESC LIMIT 500').toArray(),subscriptionEvents:this.sql.exec('SELECT * FROM subscription_events ORDER BY created_at DESC LIMIT 200').toArray(),orders:this.sql.exec('SELECT id,store_name,responsible,pickup,destination,amount,status,driver_id,created_at FROM orders ORDER BY created_at DESC LIMIT 100').toArray(),quotes:this.sql.exec("SELECT q.id,q.data,q.reason,q.amount,q.store_id,a.name AS store_name FROM quotes q JOIN accounts a ON a.id=q.store_id WHERE q.reason!='' AND q.approved=0 AND q.order_id IS NULL AND q.expires_at>?",now).toArray()});}
    if(path==='/approve-account'&&method==='POST'&&owner){const b=await req.json() as {id:string;approved:boolean};this.sql.exec('UPDATE accounts SET approved=?,online=0 WHERE id=?',b.approved?1:0,b.id);if(!b.approved){const active=this.sql.exec("SELECT id FROM orders WHERE offered_to=? AND status='offered'",b.id).toArray();for(const o of active){this.sql.exec("UPDATE orders SET status='waiting',offered_to=NULL,expires_at=0 WHERE id=?",o.id);this.sql.exec("UPDATE offers SET result='revoked' WHERE order_id=? AND driver_id=?",o.id,b.id);}}this.tick();await this.schedule();return json({ok:true});}
    if(path==='/approve-quote'&&method==='POST'&&owner){const b=await req.json() as {id:string;amount:number};if(!Number.isInteger(b.amount)||b.amount<100||b.amount>100000)throw new Error('Informe um valor entre R$ 1 e R$ 1.000.');this.sql.exec('UPDATE quotes SET amount=?,approved=1,expires_at=? WHERE id=? AND order_id IS NULL',b.amount,now+600000,b.id);return json({ok:true});}
    return json({error:'Ação não permitida.'},403);
  }
  async route(req:Request,owner:boolean):Promise<Response>{try{return await this.handle(req,owner);}catch(error){return json({error:error instanceof Error?error.message:'Não foi possível concluir.'},error instanceof Error&&(error as Error&{status?:number}).status===403?403:400);}}
}
