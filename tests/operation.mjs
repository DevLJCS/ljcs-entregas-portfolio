import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ensurePilot} from './pilot-fixture.mjs';
await build({entryPoints:['src/operation.ts'],bundle:true,platform:'node',format:'esm',outfile:'outputs/operation-rules-test.mjs'});
const {ready,region}=await import('../outputs/operation-rules-test.mjs');
assert.equal(ready({stores:9,drivers:10},true,true),false);assert.equal(ready({stores:10,drivers:9},true,true),false);assert.equal(ready({stores:10,drivers:10},false,true),false);assert.equal(ready({stores:10,drivers:10},true,false),false);assert.equal(ready({stores:10,drivers:10},true,true),true);assert.equal(region('São Paulo','sp').key,'SAO PAULO');assert.throws(()=>region('Teste','XX'));
const base='http://127.0.0.1:8787',run=crypto.randomUUID(),headers={Origin:base,'Content-Type':'application/json','CF-Connecting-IP':run};
async function req(path,body,cookie='',method=body?'POST':'GET'){const r=await fetch(base+'/api/central'+path,{method,headers:{...headers,Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie()[0]?.split(';')[0]};}
const auth=await fetch(base+'/api/auth/login/password',{method:'POST',headers,body:JSON.stringify({email:'design@example.invalid',password:'LocalDesignTest2026!'})}),owner=auth.headers.getSetCookie()[0].split(';')[0];
let op=(await req('/admin',undefined,owner)).data.operation;
assert.equal((await req('/operation',{revision:op.revision,technical:false,enabled:false,publicStores:false},owner,'PUT')).status,200);
assert.equal((await req('/operation')).data.city,null);assert.equal((await req('/operation')).data.publicStores,false);
const before=(await req('/admin',undefined,owner)).data.accounts.length;
const interest={role:'store',name:'Interesse nacional',email:run+'@example.invalid',phone:'31999990000',city:'João Pessoa',state:'PB',acceptTerms:true,termsVersion:'2026-11-19.2'};
assert.equal((await req('/interest',interest)).status,200);assert.equal((await req('/interest',interest)).status,200);assert.equal((await req('/admin',undefined,owner)).data.accounts.length,before);assert.equal((await req('/admin',undefined,owner)).data.operation.interest.filter(i=>i.email===interest.email).length,1);
const body={...interest,city:'Jaú',state:'SP',responsible:'Teste',password:'ConviteLocal2026!',address:{street:'Rua de teste',number:'100',district:'Centro',city:'Jaú',state:'SP',lat:-22.2965,lng:-48.557}};
assert.equal((await req('/register',body)).status,403);assert.equal((await req('/operation/invite',{email:body.email,days:7})).status,401);
const invite=await req('/operation/invite',{email:body.email,days:7},owner);assert.equal(invite.status,200);assert.equal((await req('/operation/invite-check?token='+invite.data.token)).data.valid,true);
assert.equal((await req('/register',{...body,email:'wrong-'+body.email,inviteToken:invite.data.token})).status,403);
const counts=(await req('/operation')).data.counts,accepted=await req('/register',{...body,inviteToken:invite.data.token});assert.equal(accepted.status,200);assert.equal(accepted.data.user.approved,false);assert.deepEqual((await req('/operation')).data.counts,counts);assert.equal((await req('/operation/invite-check?token='+invite.data.token)).data.valid,false);assert.equal((await req('/register',{...body,inviteToken:invite.data.token})).status,403);assert.equal((await req('/quote',{destination:body.address},accepted.cookie)).status,403);
assert.equal((await req('/operation',{revision:0,technical:true,enabled:true,publicStores:true},accepted.cookie,'PUT')).status,403);
const seeded=await ensurePilot(base);op=(await req('/admin',undefined,seeded.owner)).data.operation;assert.equal((await req('/operation')).data.active,true);assert.equal((await req('/operation')).data.city,'Jaú');
assert.equal((await req('/operation',{revision:op.revision,technical:false,enabled:true,publicStores:true},seeded.owner,'PUT')).status,400);
const eligible=(await req('/admin',undefined,seeded.owner)).data.accounts.filter(a=>a.role==='driver'&&a.approved&&a.terms?.version==='2026-11-19.2'&&a.region?.city_key==='JAU'&&a.region?.state==='SP');
const revoked=eligible.slice(9);try{for(const d of revoked)await req('/approve-account',{id:d.id,approved:false},seeded.owner);const publicState=(await req('/operation')).data;assert.equal(publicState.counts.drivers,9);assert.equal(publicState.active,false);assert.equal(publicState.city,null);assert.equal(publicState.publicStores,false);assert.equal((await req('/quote',{destination:body.address},seeded.stores[0].cookie)).status,403);}finally{for(const d of revoked)await req('/approve-account',{id:d.id,approved:true},seeded.owner);}
console.log('OK: 10+10 and manual readiness, national interest without account creation, closed store registration, bound single-use invites, manual approval, private city before opening and automatic pause below minimum.');
