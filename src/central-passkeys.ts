import {generateRegistrationOptions,verifyRegistrationResponse,verifyAuthenticationResponse,type RegistrationResponseJSON,type AuthenticationResponseJSON,type AuthenticatorTransportFuture} from '@simplewebauthn/server';
interface KeyRow {id:string;user_id:string;public_key:string;counter:number;transports:string;created_at:number}
export class CentralKeys {
  constructor(private sql:SqlStorage){sql.exec(`CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,public_key TEXT NOT NULL,counter INTEGER NOT NULL,transports TEXT NOT NULL,created_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS passkey_user ON passkeys(user_id);CREATE TABLE IF NOT EXISTS key_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS passkey_details(id TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '');`);}
  list(userId:string){return this.sql.exec("SELECT p.id,p.created_at,COALESCE(d.name,'') AS name FROM passkeys p LEFT JOIN passkey_details d ON d.id=p.id WHERE p.user_id=? ORDER BY p.created_at",userId).toArray();}
  async options(user:{id:string;email:string;name:string},req:Request){
    if(this.list(user.id).length>=10)throw new Error('Esta conta já tem 10 passkeys.');
    const options=await generateRegistrationOptions({rpName:'LJCS Entregas',rpID:new URL(req.url).hostname,userID:new TextEncoder().encode(user.id),userName:user.email,userDisplayName:user.name,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:this.list(user.id).map(k=>({id:String(k.id)}))});
    const challengeId=crypto.randomUUID();this.sql.exec('DELETE FROM key_challenges WHERE expires_at<?',Date.now());this.sql.exec('INSERT INTO key_challenges VALUES(?,?,?,?)',challengeId,user.id,options.challenge,Date.now()+300000);return {options,challengeId};
  }
  async register(userId:string,req:Request,body:{challengeId:string;response:RegistrationResponseJSON;name?:string}){
    const challenge=this.sql.exec('DELETE FROM key_challenges WHERE id=? AND user_id=? AND expires_at>? RETURNING challenge',body.challengeId,userId,Date.now()).toArray()[0];if(!challenge)throw new Error('Solicitação da passkey expirada. Tente novamente.');
    const result=await verifyRegistrationResponse({response:body.response,expectedChallenge:String(challenge.challenge),expectedOrigin:new URL(req.url).origin,expectedRPID:new URL(req.url).hostname,requireUserVerification:true});if(!result.verified||!result.registrationInfo)throw new Error('Não foi possível verificar a passkey.');
    const k=result.registrationInfo.credential;
    if(this.list(userId).length>=10)throw new Error('Esta conta já tem 10 passkeys.');
    this.sql.exec('INSERT INTO passkeys VALUES(?,?,?,?,?,?)',k.id,userId,btoa(String.fromCharCode(...k.publicKey)),k.counter,JSON.stringify(k.transports||[]),Date.now());this.sql.exec('INSERT OR REPLACE INTO passkey_details VALUES(?,?)',k.id,String(body.name||'').trim().slice(0,60));return {verified:true};
  }
  manage(userId:string,b:{id:string;name?:string},method:string){
    if(typeof b.id!=='string')throw new Error('Passkey inválida.');
    const row=this.sql.exec('SELECT id FROM passkeys WHERE id=? AND user_id=?',b.id,userId).toArray()[0];if(!row)throw new Error('Passkey não encontrada.');
    if(method==='PATCH'){const name=String(b.name||'').trim().slice(0,60);if(!name)throw new Error('Informe um nome para a passkey.');this.sql.exec('INSERT OR REPLACE INTO passkey_details VALUES(?,?)',b.id,name);}
    else {this.sql.exec('DELETE FROM passkeys WHERE id=? AND user_id=?',b.id,userId);this.sql.exec('DELETE FROM passkey_details WHERE id=?',b.id);}
    return {ok:true};
  }
  async authenticate(response:AuthenticationResponseJSON,challenge:string,origin:string,rpID:string){
    const k=this.sql.exec('SELECT * FROM passkeys WHERE id=?',response.id).toArray()[0] as unknown as KeyRow|undefined;if(!k)throw new Error('Passkey não reconhecida. Entre com seu e-mail e senha.');
    const result=await verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,credential:{id:k.id,publicKey:Uint8Array.from(atob(k.public_key),c=>c.charCodeAt(0)),counter:k.counter,transports:JSON.parse(k.transports) as AuthenticatorTransportFuture[]},requireUserVerification:true});if(!result.verified)throw new Error('Passkey inválida.');
    const saved=this.sql.exec('UPDATE passkeys SET counter=? WHERE id=? AND counter=? RETURNING user_id',result.authenticationInfo.newCounter,k.id,k.counter).toArray()[0];if(!saved)throw new Error('A passkey foi usada em outra solicitação. Tente novamente.');return k.user_id;
  }
}
