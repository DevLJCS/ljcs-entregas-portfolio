import {ensurePilot} from './pilot-fixture.mjs';
await ensurePilot('http://localhost:8787');
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {encodeCBOR} from '@levischuck/tiny-cbor';
const base='http://localhost:8787',version='2026-11-19.2',run=crypto.randomUUID(),headers={'Content-Type':'application/json',Origin:base,'CF-Connecting-IP':run};
async function req(path,body,cookie='',method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{...headers,Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookies:r.headers.getSetCookie(),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
const address={street:'Rua de teste',number:'100',district:'Centro',city:'Jaú',state:'SP',lat:-22.2965,lng:-48.557};
function input(role,i){return {name:'Conta teste '+i,responsible:'Teste',phone:'14999990000',city:'Jaú',state:'SP',role,email:`${run}-${i}@example.invalid`,password:'ContasLocal2026!',address,plan:'normal',city:'Jaú',state:'SP',acceptTerms:true,termsVersion:version};}
assert.equal((await req('/api/central/register',{...input('driver','reject'),acceptTerms:false})).status,400);
assert.equal((await req('/api/central/register',{...input('store','stale'),termsVersion:'old'})).status,400);
assert.equal((await req('/api/central/register',{...input('admin','bad')})).status,400);
const driverInput=input('driver',1),storeInput=input('store',2),driver=await req('/api/central/register',driverInput),store=await req('/api/central/register',storeInput);assert.equal(driver.status,200);assert.equal(store.status,200);assert.ok(driver.data.user.terms.accepted_at);assert.equal(driver.data.user.terms.version,version);assert.equal(driver.data.user.termsRequired,false);
const owner=await req('/api/access/login/password',{email:'design@example.invalid',password:'LocalDesignTest2026!'});assert.equal(owner.status,200);assert.equal(owner.data.role,'admin');assert.equal((await req('/api/access/me',undefined,owner.cookie)).data.role,'admin');
const reserve=await req('/api/central/register',{...input('driver','reserved'),email:'design@example.invalid'});assert.equal(reserve.status,409);
const centralLogin=await req('/api/access/login/password',{email:driverInput.email,password:driverInput.password},owner.cookie);assert.equal(centralLogin.status,200);assert.equal(centralLogin.data.role,'driver');assert.ok(centralLogin.cookies.some(c=>c.includes('__Host-ride_session=;')));assert.equal((await req('/api/dashboard?date=2026-11-19',undefined,centralLogin.cookie)).status,401);assert.equal((await req('/api/auth/me',undefined,owner.cookie)).data.authenticated,false,'switching account must revoke previous admin session');
assert.equal((await req('/api/access/login/password',{email:storeInput.email,password:storeInput.password})).data.role,'store');
assert.equal((await req('/api/access/login/password',{email:driverInput.email,password:'wrong'})).status,401);
assert.equal((await req('/api/central/passkey/register/options',{})).status,401);
const dCookie=centralLogin.cookie,sCookie=store.cookie;
const opts=await req('/api/central/passkey/register/options',{},dCookie);assert.equal(opts.status,200);assert.equal(opts.data.options.authenticatorSelection.residentKey,'required');assert.equal(opts.data.options.user.name,driverInput.email);
const otherAttempt=await req('/api/central/passkey/register/verify',{challengeId:opts.data.challengeId,response:{}},sCookie);assert.equal(otherAttempt.status,400);
const b64=b=>Buffer.from(b).toString('base64url'),sha=b=>createHash('sha256').update(b).digest();
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),credential=randomBytes(32),id=b64(credential);
const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
const length=Buffer.alloc(2);length.writeUInt16BE(credential.length);
const authData=Buffer.concat([sha('localhost'),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,credential,Buffer.from(cose)]);
const registration={id,rawId:id,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(JSON.stringify({type:'webauthn.create',challenge:opts.data.options.challenge,origin:base,crossOrigin:false})),attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))),transports:['internal']}};
const registered=await req('/api/central/passkey/register/verify',{challengeId:opts.data.challengeId,response:registration},dCookie);assert.equal(registered.status,200,JSON.stringify(registered.data));assert.equal((await req('/api/central/passkeys',undefined,dCookie)).data.keys.length,1);assert.equal((await req('/api/central/passkeys',undefined,sCookie)).data.keys.length,0);
assert.equal((await req('/api/central/passkey/register/verify',{challengeId:opts.data.challengeId,response:registration},dCookie)).status,400);
async function assertion(counter,origin=base){const o=await req('/api/access/passkey/options',{});assert.equal(o.status,200);const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:o.data.options.challenge,origin,crossOrigin:false})),count=Buffer.alloc(4);count.writeUInt32BE(counter);const auth=Buffer.concat([sha('localhost'),Buffer.from([5]),count]);return {challengeId:o.data.challengeId,response:{id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(auth),signature:b64(sign('sha256',Buffer.concat([auth,sha(client)]),privateKey)),userHandle:b64(driver.data.user.id)}}};}
const signed=await assertion(1),logged=await req('/api/access/passkey/verify',signed);assert.equal(logged.status,200,JSON.stringify(logged.data));assert.equal(logged.data.role,'driver');assert.equal(logged.data.user.id,driver.data.user.id);assert.equal((await req('/api/central/me',undefined,logged.cookie)).data.user.id,driver.data.user.id);assert.equal((await req('/api/dashboard?date=2026-11-19',undefined,logged.cookie)).status,401);assert.equal((await req('/api/central/admin',undefined,logged.cookie)).status,403);assert.equal((await req('/api/central/orders',undefined,logged.cookie)).status,403,'passkey cannot bypass unpaid subscription');
assert.equal((await req('/api/access/passkey/verify',signed)).status,400,'challenge must be single use');assert.equal((await req('/api/access/passkey/verify',await assertion(2,'https://evil.example'))).status,401);
assert.equal((await req('/api/access/passkey/verify',await assertion(1))).status,401,'counter replay must fail');
const accepted=(await req('/api/central/me',undefined,dCookie)).data.user.terms.accepted_at;await req('/api/central/terms/accept',{city:'Jaú',state:'SP',acceptTerms:true,termsVersion:version},dCookie);assert.equal((await req('/api/central/me',undefined,dCookie)).data.user.terms.accepted_at,accepted);
const out=await req('/api/access/logout',{},logged.cookie);assert.equal(out.status,200);assert.ok(out.cookies.some(c=>c.includes('__Host-central_session=;')));assert.equal((await req('/api/access/me',undefined,logged.cookie)).data.authenticated,false);
const adminAgain=await req('/api/access/login/password',{email:'design@example.invalid',password:'LocalDesignTest2026!'});
const legacySwitch=await req('/api/central/login',{email:storeInput.email,password:storeInput.password},adminAgain.cookie);assert.equal(legacySwitch.status,200);assert.equal((await req('/api/auth/me',undefined,adminAgain.cookie)).data.authenticated,false);
const beforeSignup=await req('/api/access/login/password',{email:'design@example.invalid',password:'LocalDesignTest2026!'});
const signupSwitch=await req('/api/central/register',input('store','switch'),beforeSignup.cookie);assert.equal(signupSwitch.status,200);assert.equal((await req('/api/auth/me',undefined,beforeSignup.cookie)).data.authenticated,false);
console.log('OK: unified role login, admin cookie revocation, reserved email, terms enforcement and recorded consent, account-scoped passkeys, signed WebAuthn registration/login, challenge reuse, origin and counter rejection, role isolation, subscription enforcement and unified logout.');

assert.equal((await req('/api/central/passkeys',{id,name:'Chave de outra conta'},sCookie,'PATCH')).status,400);
assert.equal((await req('/api/central/passkeys',{id},sCookie,'DELETE')).status,400);
assert.equal((await req('/api/central/passkeys',{id,name:'Meu aparelho de teste'},dCookie,'PATCH')).status,200);
assert.equal((await req('/api/central/passkeys',undefined,dCookie)).data.keys[0].name,'Meu aparelho de teste');
assert.equal((await req('/api/central/passkeys',{id},dCookie,'DELETE')).status,200);
assert.equal((await req('/api/access/passkey/verify',await assertion(3))).status,401,'removed key must not authenticate');
console.log('OK: passkey rename/removal scoped to own account and removed key rejected.');
