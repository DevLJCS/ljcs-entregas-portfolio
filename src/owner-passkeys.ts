import {generateRegistrationOptions,verifyRegistrationResponse,type RegistrationResponseJSON} from '@simplewebauthn/server';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const nameOf=(value:unknown)=>typeof value==='string'?value.trim().slice(0,60):'';
export async function ownerPasskeys(req:Request,db:D1Database,sessionHash:string){
 const path=new URL(req.url).pathname,method=req.method;
 if(!path.startsWith('/api/passkeys'))return null;
 if(path==='/api/passkeys'&&method==='GET'){
  const rows=await db.prepare("SELECT c.id,c.created_at,COALESCE(d.name,'') AS name FROM credentials c LEFT JOIN credential_details d ON d.credential_id=c.id ORDER BY c.created_at").all();
  return json({keys:rows.results,limit:10});
 }
 const recent=await db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND created_at>? AND expires_at>?').bind(sessionHash,Math.floor(Date.now()/1000)-900,Math.floor(Date.now()/1000)).first();
 if(!recent)return json({error:'Por segurança, saia e entre novamente para gerenciar passkeys. A entrada deve ter ocorrido nos últimos 15 minutos.'},401);
 if(path==='/api/passkeys/register/options'&&method==='POST'){
  const keys=await db.prepare('SELECT id FROM credentials').all<{id:string}>();if(keys.results.length>=10)return json({error:'Limite de 10 passkeys por conta.'},409);
  const profile=await db.prepare('SELECT email,display_name FROM rider_profile WHERE id=1').first<{email:string;display_name:string}>();
  const options=await generateRegistrationOptions({rpName:'LJCS Entregas',rpID:new URL(req.url).hostname,userID:new TextEncoder().encode('ljcs-admin'),userName:profile?.email||'Administrador LJCS',userDisplayName:profile?.display_name||'Administrador',attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:keys.results.map(k=>({id:k.id}))});
  const challengeId=crypto.randomUUID();await db.prepare('INSERT INTO challenges VALUES(?,?,?,?)').bind(challengeId,options.challenge,'manage-key:'+sessionHash,Math.floor(Date.now()/1000)).run();return json({options,challengeId});
 }
 if(path==='/api/passkeys/register/verify'&&method==='POST'){
  const b=await req.json() as {challengeId:string;response:RegistrationResponseJSON;name?:string};
  const row=await db.prepare('DELETE FROM challenges WHERE id=? AND purpose=? AND created_at>? RETURNING challenge').bind(b.challengeId,'manage-key:'+sessionHash,Math.floor(Date.now()/1000)-300).first<{challenge:string}>();if(!row)return json({error:'Solicitação expirada. Tente novamente.'},400);
  const result=await verifyRegistrationResponse({response:b.response,expectedChallenge:row.challenge,expectedOrigin:new URL(req.url).origin,expectedRPID:new URL(req.url).hostname,requireUserVerification:true});if(!result.verified||!result.registrationInfo)return json({error:'Não foi possível verificar a passkey.'},400);
  const k=result.registrationInfo.credential;
  const saved=await db.prepare('INSERT INTO credentials SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM credentials)<10 RETURNING id').bind(k.id,btoa(String.fromCharCode(...k.publicKey)),k.counter,JSON.stringify(k.transports||[]),new Date().toISOString()).first();if(!saved)return json({error:'Limite de 10 passkeys por conta.'},409);
  await db.prepare('INSERT OR REPLACE INTO credential_details VALUES(?,?)').bind(k.id,nameOf(b.name)).run();return json({verified:true});
 }
 if(path==='/api/passkeys'&&(method==='PATCH'||method==='DELETE')){
  const b=await req.json() as {id:string;name?:string};if(typeof b.id!=='string')return json({error:'Passkey inválida.'},400);
  if(method==='PATCH'){if(!nameOf(b.name))return json({error:'Informe um nome para a passkey.'},400);const row=await db.prepare('INSERT OR REPLACE INTO credential_details SELECT id,? FROM credentials WHERE id=? RETURNING credential_id').bind(nameOf(b.name),b.id).first();return json(row?{ok:true}:{error:'Passkey não encontrada.'},row?200:404);}
  const removed=await db.prepare("DELETE FROM credentials WHERE id=? AND ((SELECT COUNT(*) FROM credentials)>1 OR EXISTS(SELECT 1 FROM rider_profile WHERE id=1 AND password_hash IS NOT NULL AND password_hash<>'')) RETURNING id").bind(b.id).first();if(!removed)return json({error:'Passkey não encontrada ou é a última forma de acesso. Cadastre outra antes de removê-la.'},409);
  await db.prepare('DELETE FROM credential_details WHERE credential_id=?').bind(b.id).run();return json({ok:true});
 }
 return json({error:'Rota não encontrada.'},404);
}
