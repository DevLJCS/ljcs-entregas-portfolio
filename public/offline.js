import { icon } from "./icons.js";
const QUEUE='ljcs-pending-v1', CACHE='ljcs-offline-cache-v1';
let syncing=false;
let retryTimer, autoTimer;
function scheduleSync() {
 clearTimeout(retryTimer);
 retryTimer=setTimeout(() => { void syncPending(); }, 1500);
 retryTimer.unref?.();
}
function queueCreation(path, options) {
 const queue=read(QUEUE,[]);
 queue.push({path,options});
 localStorage.setItem(QUEUE,JSON.stringify(queue));
 status(`${queue.length} registro(s) neste dispositivo · sincronização automática aguardando conexão.`, 'pending');
 scheduleSync();
 return {queued:true};
}
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function status(message, state='idle') {
 const el=document.getElementById('sync-status');if(el)el.textContent=message;
 const badge=document.getElementById('sync-icon');
 if(badge){badge.innerHTML=icon({idle:'cloud',synced:'cloudCheck',syncing:'sync',pending:'warning',offline:'offline',error:'warning'}[state]);badge.setAttribute?.('data-state',state);}
}
export function clearOffline(){localStorage.removeItem(CACHE);}
export function hasOfflineDashboard(){return Object.keys(read(CACHE,{})).some(k=>k.startsWith('/api/dashboard?'));}
export async function offlineApi(path,options={}) {
 const creation=options.method==='POST' && ['/api/rides','/api/expenses'].includes(path);
 if(creation){const body=JSON.parse(options.body);body.clientId??=crypto.randomUUID();options={...options,body:JSON.stringify(body)};}
 let response;
 try {response=await fetch(path,{...options,signal:AbortSignal.timeout(15000),headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});}
 catch(error){
  if(creation)return queueCreation(path,options);
  if(!options.method && (path.startsWith('/api/dashboard?')||path.startsWith('/api/productivity?'))){const cached=read(CACHE,{})[path];if(cached){status('Sem conexão: exibindo a última consulta salva. Registros pendentes ainda não entram nos totais.', 'offline');return cached;}}
  throw new Error('Sem conexão. Tente novamente quando a internet voltar.');
 }
 const result=await response.json().catch(()=>({}));
 if(creation && response.status>=500)return queueCreation(path,options);
 if(!response.ok){if(response.status===401)clearOffline();throw new Error(result.error||'Não foi possível concluir a solicitação.');}
 if(creation && read(QUEUE,[]).length)scheduleSync();
 if(!options.method && (path.startsWith('/api/dashboard?')||path.startsWith('/api/productivity?'))){try{const cache=read(CACHE,{});if(JSON.stringify(cache[path])!==JSON.stringify(result)){cache[path]=result;const keys=Object.keys(cache);while(keys.length>20)delete cache[keys.shift()];localStorage.setItem(CACHE,JSON.stringify(cache));}}catch{/* Caching must not block online use. */}}
 if(path.startsWith('/api/dashboard?') && !read(QUEUE,[]).length) status('Nuvem conectada · atualização automática a cada 30 segundos.', 'synced');
 return result;
}
export async function syncPending(){
 if(syncing || !navigator.onLine) return;
 syncing=true;
 try{
  let queue=read(QUEUE,[]);
  if(!queue.length)return;
  status(`Sincronizando automaticamente ${queue.length} registro(s) com a nuvem…`, 'syncing');
  const me=await fetch('/api/auth/me',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());if(!me.authenticated){status(`${queue.length} registro(s) pendente(s). Entre na conta para sincronizar automaticamente.`, 'pending');return;}
  while(queue.length){
   const item=queue[0];const response=await fetch(item.path,{...item.options,signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'}});
   if(!response.ok){const error=await response.json().catch(()=>({}));status(`Sincronização interrompida: ${error.error||'entre novamente ou revise os dados'}. ${queue.length} registro(s) preservado(s) no dispositivo.`, 'error');return;}
   // Re-read before removing so a new record from this tab is preserved.
   queue=read(QUEUE,[]).filter(q=>JSON.parse(q.options.body).clientId!==JSON.parse(item.options.body).clientId);localStorage.setItem(QUEUE,JSON.stringify(queue));
  }
  status('Sincronização concluída · registros salvos no servidor.', 'synced');document.dispatchEvent(new Event('ljcs-synced'));
 }catch{status(`${read(QUEUE,[]).length} registro(s) pendente(s). Nova tentativa automática em até 30 segundos com o aplicativo aberto.`, 'pending');}finally{syncing=false;}
}
export function initOffline(){
 if(autoTimer)return;
 const banner=document.createElement('div');banner.className='sync-banner';banner.innerHTML='<span id="sync-icon" class="sync-icon" aria-hidden="true"></span><span id="sync-status" role="status"></span><button class="button button-secondary" id="install-app" hidden>Instalar aplicativo</button>';document.querySelector('main').prepend(banner);
 const autoSync=async()=>{
  if(!navigator.onLine)return;
  await syncPending();
  if(document.visibilityState!=='hidden')document.dispatchEvent(new Event('ljcs-cloud-refresh'));
 };
 autoTimer=setInterval(autoSync,30000);
 window.addEventListener('online',autoSync);
 window.addEventListener('focus',autoSync);
 window.addEventListener('storage',event=>{if(event.key===QUEUE)void autoSync();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void autoSync();});
 window.addEventListener('offline',()=>status('Sem conexão · novas corridas e despesas serão sincronizadas automaticamente ao reconectar.', 'offline'));
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();const button=document.getElementById('install-app');button.hidden=false;button.onclick=async()=>{await event.prompt();button.hidden=true;};});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
 status(navigator.onLine?'Sincronização automática ativa · atualizações a cada 30 segundos.':'Sem conexão · sincronização automática ao reconectar.', navigator.onLine?'idle':'offline');
}
