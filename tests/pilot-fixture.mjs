// Local-only setup. Never use this helper against a public host.
export async function ensurePilot(base='http://127.0.0.1:8787'){
 if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Fixture is restricted to localhost.');
 const headers={'Content-Type':'application/json',Origin:base,'CF-Connecting-IP':crypto.randomUUID()};
 const auth=await fetch(base+'/api/auth/login/password',{method:'POST',headers,body:JSON.stringify({email:'design@example.invalid',password:'LocalDesignTest2026!'})});if(!auth.ok)throw new Error('Seed local owner fixture before tests.');const owner=auth.headers.getSetCookie()[0].split(';')[0];
 async function req(path,body,cookie=owner){const r=await fetch(base+'/api/central'+path,{method:body?'POST':'GET',headers:{...headers,Cookie:cookie},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
 const stores=[],drivers=[];
 for(const role of ['store','driver'])for(let i=0;i<10;i++){
  const email=`pilot-v2-${role}-${i}@example.invalid`,password='PilotFixtureLocal2026!';let user=(await req('/admin')).accounts.find(u=>u.email===email);
  if(!user){const token=role==='store'?(await req('/operation/invite',{email,days:7})).token:undefined;
   const r=await fetch(base+'/api/central/register',{method:'POST',headers:{...headers,'CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify({email,password,role,name:`Piloto local ${role} ${i}`,responsible:'Pessoa fictícia',phone:'14999990000',city:'Jaú',state:'SP',inviteToken:token,acceptTerms:true,termsVersion:'2026-11-19.2',address:{street:'Rua de teste',number:'100',district:'Centro',city:'Jaú',state:'SP',lat:-22.2965,lng:-48.557}})});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));user=d.user;
  }
  await req('/approve-account',{id:user.id,approved:true});
  const login=await fetch(base+'/api/central/login',{method:'POST',headers:{...headers,'CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify({email,password})});if(!login.ok)throw new Error('Pilot login failed');const cookie=login.headers.getSetCookie()[0].split(';')[0];await req('/terms/accept',{acceptTerms:true,termsVersion:'2026-11-19.2'},cookie);
  (role==='store'?stores:drivers).push({id:user.id,cookie,email});
 }
 const op=(await req('/admin')).operation;
 const configured=await fetch(base+'/api/central/operation',{method:'PUT',headers:{...headers,Cookie:owner},body:JSON.stringify({revision:op.revision,technical:true,enabled:true,publicStores:true})});if(!configured.ok)throw new Error(await configured.text());
 return {owner,stores,drivers};
}
