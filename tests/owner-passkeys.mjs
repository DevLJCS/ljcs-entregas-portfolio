import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {encodeCBOR} from '@levischuck/tiny-cbor';
const base='http://localhost:8787';
async function req(path,body,cookie='',method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
const login=()=>req('/api/access/login/password',{email:'design@example.invalid',password:'LocalDesignTest2026!'});
let owner=await login();assert.equal(owner.status,200);
assert.equal((await req('/api/passkeys')).status,401);
const sessionToken=decodeURIComponent(owner.cookie.split('; ').find(c=>c.startsWith('__Host-ride_session=')).split('=')[1]);
const digest=createHash('sha256').update(sessionToken).digest('base64url');
execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','entregas-ljcs','--local','--command',`UPDATE sessions SET created_at=0 WHERE token_hash='${digest}'`],{stdio:'pipe'});
assert.equal((await req('/api/passkeys/register/options',{},owner.cookie)).status,401,'old session cannot enroll');
assert.equal((await req('/api/passkeys',{id:'missing',name:'Teste'},owner.cookie,'PATCH')).status,401,'old session cannot rename');
assert.equal((await req('/api/passkeys',{id:'missing'},owner.cookie,'DELETE')).status,401,'old session cannot remove');
owner=await login();

const initial=(await req('/api/passkeys',undefined,owner.cookie)).data.keys.length;
const b64=b=>Buffer.from(b).toString('base64url'),sha=b=>createHash('sha256').update(b).digest();
const created=[];
for(let i=0;i<2;i++){
 const o=await req('/api/passkeys/register/options',{},owner.cookie);assert.equal(o.status,200);assert.equal(o.data.options.authenticatorSelection.residentKey,'required');assert.equal(o.data.options.excludeCredentials.length,initial+i);
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),credential=randomBytes(32),id=b64(credential);
 const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]])),length=Buffer.alloc(2);length.writeUInt16BE(credential.length);
 const authData=Buffer.concat([sha('localhost'),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,credential,Buffer.from(cose)]);
 const registration={id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(JSON.stringify({type:'webauthn.create',challenge:o.data.options.challenge,origin:base,crossOrigin:false})),attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))),transports:['internal']}};
 const b={challengeId:o.data.challengeId,response:registration,name:'Teste local '+i};
 assert.equal((await req('/api/passkeys/register/verify',b,owner.cookie)).status,200);
 assert.equal((await req('/api/passkeys/register/verify',b,owner.cookie)).status,400);
 created.push({id,privateKey});
}
const keys=(await req('/api/passkeys',undefined,owner.cookie)).data.keys;assert.equal(keys.length,initial+2);assert.ok(keys.every(k=>!k.public_key));
const key=created[0];assert.equal((await req('/api/passkeys',{id:key.id,name:'Notebook local'},owner.cookie,'PATCH')).status,200);
assert.equal((await req('/api/passkeys',undefined,owner.cookie)).data.keys.find(k=>k.id===key.id).name,'Notebook local');
async function assertion(){const o=await req('/api/access/passkey/options',{}),client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:o.data.options.challenge,origin:base,crossOrigin:false})),count=Buffer.alloc(4);count.writeUInt32BE(1);const auth=Buffer.concat([sha('localhost'),Buffer.from([5]),count]);return {challengeId:o.data.challengeId,response:{id:key.id,rawId:key.id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(auth),signature:b64(sign('sha256',Buffer.concat([auth,sha(client)]),key.privateKey))}}};}
const authenticated=await req('/api/access/passkey/verify',await assertion());assert.equal(authenticated.status,200);assert.equal(authenticated.data.role,'admin');owner=authenticated;
for(const k of created)assert.equal((await req('/api/passkeys',{id:k.id},owner.cookie,'DELETE')).status,200);
assert.equal((await req('/api/access/passkey/verify',await assertion())).status,401);
assert.equal((await req('/api/passkeys',undefined,owner.cookie)).data.keys.length,initial);
console.log('OK: admin can add multiple signed WebAuthn keys, name/list/remove own keys; challenge replay and removed authentication rejected; original keys preserved.');
