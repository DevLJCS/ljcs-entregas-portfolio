import { icon } from "./icons.js";
import { metrics, periodGoal, periodTotals, ridesToGoal } from './metrics.js';
let context, data, extra, timer, generation = 0;
let lastSignature = '';
const el = id => document.getElementById(id);
export function rememberPlatform(value) { localStorage.setItem('ljcs-last-platform', value || ''); }
export async function enhanceDashboard(dashboard, helpers, snapshot) {
 const version = ++generation;
 const result = snapshot ?? await helpers.api(`/api/productivity?date=${dashboard.date}`);
 if (version !== generation) return;
 context = helpers; data = dashboard; extra = result;
 const signature = JSON.stringify([dashboard,result]);
 if (signature === lastSignature) { renderMetrics(); renderAlerts(); renderCarryover(); return; }
 lastSignature = signature;
 mount(); render(); renderCarryover();
 clearInterval(timer); timer = setInterval(()=>{renderMetrics();renderAlerts();}, 30000);
}
function mount() {
 if (el('productivity-panel')) return;
 const panel = document.createElement('section'); panel.className = 'panel productivity'; panel.id = 'productivity-panel';
 panel.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">SEU TEMPO VALE</p><h3 class="icon-heading">${icon("clock")} Jornada e resultado</h3></div><button class="button button-secondary" id="cost-open">${icon("settings")} <span>Configurar custos</span></button></div>
 <p id="shift-status" role="status"></p><div class="shift-actions"><button class="button button-primary" id="shift-main"></button><button class="button button-secondary" id="shift-pause"></button></div>
 <div id="work-metrics" class="metric-grid"></div><p id="cost-explanation" class="subheading"></p><section class="driver-alerts" aria-labelledby="driver-alerts-title"><h4 id="driver-alerts-title">Avisos do seu corre</h4><div id="quality-warning" class="alert-list" role="status" aria-live="polite"></div></section><div id="shift-list"></div>`;
 const placeholder=document.querySelector('.productivity-placeholder');
 if(placeholder)placeholder.replaceWith(panel);
 else el('view-inicio').querySelector('.stats-grid')?.after(panel);
 if (!panel.isConnected) el('view-inicio').append(panel);
 const goals=document.createElement('section');goals.className='period-goals';goals.id='period-goals';
 goals.innerHTML=`<div class="period-goals-heading"><div><p class="eyebrow">VISÃO DE RITMO</p><h3>Metas da semana e do mês</h3></div><p>Calculadas pela sua meta diária configurada.</p></div><div class="period-goal-grid"><article class="period-goal"><div><strong>Semana até a data</strong><span id="week-goal-summary"></span></div><div class="period-progress" id="week-goal-track"><span id="week-goal-progress"></span></div><p id="week-goal-detail"></p></article><article class="period-goal"><div><strong>Mês até a data</strong><span id="month-goal-summary"></span></div><div class="period-progress" id="month-goal-track"><span id="month-goal-progress"></span></div><p id="month-goal-detail"></p></article></div>`;
 el('view-inicio').querySelector('.goal-card')?.after(goals);
 const reports = document.createElement('section'); reports.className='panel productivity'; reports.id='reports-panel';
 reports.innerHTML=`<div class="panel-heading"><div><p class="eyebrow">EVOLUÇÃO DO SEU CORRE</p><h3 class="icon-heading">${icon("trend")} Resumo por período</h3></div><select id="report-period" aria-label="Período do resumo"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></div><p id="report-dates" class="subheading"></p><div id="report-metrics" class="metric-grid"></div><p id="report-comparison"></p><div id="report-bars" class="report-bars" aria-label="Faturamento por dia"></div><div class="heading-actions"><button class="button button-secondary" id="report-export">${icon("download")} <span>Exportar resumo CSV</span></button><button class="button button-secondary" id="report-pdf">${icon("receipt")} <span>Salvar relatório em PDF</span></button><button class="button button-secondary" id="voice-summary">${icon("play")} <span>Ouvir resumo</span></button></div>`;
 el('view-historico').querySelector('.page-heading').after(reports);
 const maintenance=document.createElement('section'); maintenance.className='panel productivity'; maintenance.id='maintenance-panel';
 maintenance.innerHTML=`<div class="panel-heading"><div><p class="eyebrow">CUIDE DA SUA MOTO</p><h3 class="icon-heading">${icon("wrench")} Manutenções</h3></div><button class="button button-secondary" id="maintenance-open">${icon("plus")} <span>Adicionar lembrete</span></button></div><p id="maintenance-km" class="subheading"></p><div id="maintenance-list"></div>`;
 el('view-despesas').append(maintenance);
 const suggestions=document.createElement('datalist'); suggestions.id='establishment-suggestions';document.body.append(suggestions);el('ride-establishment').setAttribute('list',suggestions.id);
 addDialog('shift', 'Registrar jornada', `<p id="shift-help" class="subheading"></p><div class="field"><label for="shift-km">Quilometragem no painel</label><input id="shift-km" type="number" step="0.1" min="0" max="999999" required></div><div class="field" id="shift-fuel-field" hidden><label for="shift-fuel-level">Marcador de combustível</label><select id="shift-fuel-level" disabled></select></div>`);
 addDialog('cost', 'Estimativa de custos', `<p class="subheading">Informe valores adequados à sua moto. A reserva cobre óleo, pneus e manutenção e não representa dinheiro já gasto.</p>${field('fuel-price','Preço do combustível (R$/L)')}${field('efficiency-input','Consumo de referência (km/L)')}${field('reserve-input','Reserva para manutenção (R$/km)')}`);
 addDialog('maintenance', 'Adicionar manutenção', `<div class="field"><label for="maintenance-title">Nome da manutenção</label><input id="maintenance-title" maxlength="100" placeholder="Ex.: troca de óleo" required></div>${field('maintenance-last','Km da última manutenção','999999')}${field('maintenance-interval','Intervalo em km','999999')}`);
 addDialog('service', 'Registrar manutenção realizada', `<p id="service-title"></p>${field('service-km','Km da manutenção','999999')}`);
 el('shift-main').onclick=()=>{
  el('shift-form').reset();
  const active=extra.active, action=active?'end':'start';
  el('shift-dialog').dataset.action=action;
  el('shift-dialog').querySelector('h2').textContent=active?'Encerrar expediente':'Iniciar expediente';
  el('shift-help').textContent=active?'Informe o km final. O expediente será encerrado, inclusive se estiver pausado.':'O tempo começa ao salvar. Informe o odômetro antes de sair. Jornadas que passam da meia-noite ficam na data de início.';
  el('shift-km').min=active?.start_km ?? 0;
  configureShiftCheckpoint(action);
  el('shift-dialog').showModal();
 };
 el('shift-pause').onclick=()=>{
  const active=extra.active;
  el('shift-form').reset();
  const action=active.paused_at?'resume':'pause';
  el('shift-dialog').dataset.action=action;
  el('shift-dialog').querySelector('h2').textContent=action==='resume'?'Retomar expediente':'Pausar expediente';
  el('shift-help').textContent=action==='resume'?'Informe novamente o hodômetro e o nível atual do marcador de combustível para retomar.':'Informe o hodômetro e o nível atual do marcador de combustível ao pausar.';
  const lastKm=[...(extra.shiftEvents||[])].filter(event=>event.km!==null&&event.km!==undefined).sort((a,b)=>b.occurred_at-a.occurred_at)[0]?.km;
  el('shift-km').min=lastKm??active.start_km;
  el('shift-km').value=extra.latestKm??active.start_km;
  configureShiftCheckpoint(action);
  el('shift-dialog').showModal();
 };
 el('shift-form').onsubmit=e=>{
  e.preventDefault();
  const action=el('shift-dialog').dataset.action;
  const body={action,id:extra.active?.id,km:Number(el('shift-km').value)};
  if(action==='pause'||action==='resume')body.fuelLevel=Number(el('shift-fuel-level').value);
  submit(e,'/shift',body);
 };
 el('cost-open').onclick=()=>{el('fuel-price').value=extra.costs?.fuelPrice??'';el('efficiency-input').value=extra.costs?.efficiency??data.fuelEfficiency??'';el('reserve-input').value=extra.costs?.reserve??'';el('cost-dialog').showModal();};
 el('cost-form').onsubmit=e=>{e.preventDefault();submit(e,'/costs',{fuelPrice:Number(el('fuel-price').value),efficiency:Number(el('efficiency-input').value),reserve:Number(el('reserve-input').value)},'PUT');};
 el('maintenance-open').onclick=()=>{el('maintenance-form').reset();el('maintenance-dialog').showModal();};
 el('maintenance-form').onsubmit=e=>{e.preventDefault();submit(e,'/maintenance',{title:el('maintenance-title').value,lastKm:Number(el('maintenance-last').value),intervalKm:Number(el('maintenance-interval').value)});};
 el('service-form').onsubmit=e=>{e.preventDefault();submit(e,'/maintenance',{id:el('service-dialog').dataset.id,km:Number(el('service-km').value)},'PUT');};
 el('report-period').onchange=renderReports;
 el('report-export').onclick=exportReport;
 el('report-pdf').onclick=exportPdfReport;
 el('voice-summary').onclick=()=>{
  if(!('speechSynthesis' in window)){context.toast('Seu navegador não oferece leitura por voz.');return;}
  const p=periodTotals(extra.daily,data.date,Number(el('report-period').value));
  const text=`Resumo dos últimos ${p.days} dias. Faturamento de ${context.brl(p.gross)}. Despesas pagas de ${context.brl(p.expenses)}. Saldo após despesas de ${context.brl(p.gross-p.expenses)}. ${p.count} corridas registradas.`;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='pt-BR';utterance.rate=.92;
  window.speechSynthesis.speak(utterance);
 };
}
function configureShiftCheckpoint(action){
 const enabled=action==='pause'||action==='resume';
 const field=el('shift-fuel-field'),select=el('shift-fuel-level');
 field.hidden=!enabled;
 select.disabled=!enabled;
 if(!enabled)return;
 const segments=Number(data.motorcycle?.segments)||6;
 select.innerHTML=Array.from({length:segments+1},(_,level)=>`<option value="${level}">${level===0?'Vazio / reserva':`${level} de ${segments} ${data.motorcycle?.gaugeType==='bars'?'barras':'níveis'} acesos`}</option>`).join('');
 const current=data.motorcycle?.level;
 select.value=String(Number.isInteger(current)&&current>=0&&current<=segments?current:0);
}
function field(id,label,max='1000') {return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" min="${max==='999999'?'0':'0.001'}" step="any" max="${max}" required></div>`;}
function addDialog(id,title,fields) {
 const dialog=document.createElement('dialog');dialog.id=`${id}-dialog`;dialog.className='modal';
 dialog.innerHTML=`<form id="${id}-form" class="modal-card"><div class="modal-heading"><h2>${title}</h2><button type="button" class="close-modal" aria-label="Fechar">${icon("close")}</button></div>${fields}<p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-quiet close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar</button></div></form>`;
 dialog.querySelectorAll('.close-modal').forEach(b=>b.onclick=()=>dialog.close());document.body.append(dialog);
}
async function mutate(path,body,method='POST') {try {await context.api('/api/productivity'+path,{method,body:JSON.stringify(body)});await context.refresh();context.toast('Registro salvo no servidor.');}catch(e){context.toast(e.message);}}
async function submit(event,path,body,method='POST') {
 const form=event.currentTarget, button=form.querySelector('[type=submit]');button.disabled=true;form.querySelector('.form-error').textContent='';
 try{
  const result=await context.api('/api/productivity'+path,{method,body:JSON.stringify(body)});
  form.closest('dialog').close();
  await context.refresh();
  const ending=path==='/shift'&&body.action==='end';
  context.toast(ending?'Expediente encerrado.':'Registro salvo no servidor.');
 }
 catch(e){form.querySelector('.form-error').textContent=e.message;}finally{button.disabled=false;}
}
const metric=(label,value,action='')=>action
 ? `<button type="button" class="work-metric work-metric-action" data-report-action="${action}" aria-label="Ver histórico completo de ${label.toLocaleLowerCase("pt-BR")}"><span>${label}</span><strong>${value}</strong></button>`
 : `<div class="work-metric"><span>${label}</span><strong>${value}</strong></div>`;
function renderMetrics(){
 if(!data || !extra || !el('work-metrics')) return;
 const m=metrics(extra.shifts,{...data,grossCents:data.motorcycleGrossCents,expenses:data.expenses.filter(e=>e.motorcycle_id===data.motorcycle.id)},extra.costs);
 const fmt=v=>v===null?'—':context.brl(v);
 el('work-metrics').innerHTML=metric('Horas trabalhadas',`${Math.floor(m.hours)}h ${Math.floor(m.hours%1*60)}min`)+metric('Km percorridos',m.distance===null?'—':`${m.distance.toLocaleString('pt-BR')} km`)+metric('Corridas no expediente',String(m.rideCount))+metric('Faturamento / hora',fmt(m.hourly))+metric('Faturamento / km',fmt(m.perKm))+metric('Faturamento médio / corrida',fmt(m.grossPerRide))+metric('Custo estimado / km',fmt(m.costPerKm))+metric('Custo estimado / corrida',fmt(m.costPerRide))+metric('Lucro estimado / corrida',fmt(m.profitPerRide))+metric('Resultado estimado',fmt(m.result));
 el('cost-explanation').textContent=m.result===null?'Encerre a jornada com km final e configure os custos para calcular o resultado estimado. Indicadores de jornada usam as corridas realizadas durante o expediente e os dados da moto selecionada.':'Estimativa: corridas do expediente menos combustível por km e reserva de manutenção. Custos de corrida são distribuídos pela quilometragem registrada. O abastecimento pago não é descontado novamente. Outras despesas podem se sobrepor à reserva.';
}
function render(){
 const {escapeHtml:esc}=context;const active=extra.active;
 el('shift-status').textContent=active?`Expediente ${active.paused_at?'pausado':'em andamento'} · iniciado em ${new Date(active.started_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · ${active.start_km.toLocaleString('pt-BR')} km iniciais`:'Nenhum expediente aberto. Inicie antes de sair para registrar seu tempo.';
 el('shift-main').innerHTML=icon(active?'stop':'play')+`<span>${active?'Encerrar expediente':'Iniciar expediente'}</span>`;el('shift-pause').hidden=!active;el('shift-pause').innerHTML=icon(active?.paused_at?'play':'pause')+`<span>${active?.paused_at?'Retomar':'Pausar'}</span>`;
 el('establishment-suggestions').innerHTML=extra.suggestions.filter(r=>r.establishment!=='Não informado').map(r=>`<option value="${esc(r.establishment)}"></option>`).join('');
 el('maintenance-km').textContent=extra.latestKm===null?'Registre o odômetro em uma jornada ou abastecimento para acompanhar os prazos.':`Maior odômetro registrado: ${Number(extra.latestKm).toLocaleString('pt-BR')} km. Lembretes são exibidos aqui ao abrir o painel.`;
 const labels={start:'Iniciado',pause:'Pausado',resume:'Retomado',end:'Encerrado'};
 el('shift-list').innerHTML=(extra.shiftEvents||[]).length
  ? [...extra.shiftEvents].sort((a,b)=>a.occurred_at-b.occurred_at).map(event=>`<p class="subheading">${labels[event.type]||event.type} às ${new Date(event.occurred_at).toLocaleString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}${event.km!==null&&event.km!==undefined?` · ${Number(event.km).toLocaleString('pt-BR')} km`:''}${event.fuel_level!==null&&event.fuel_level!==undefined?` · combustível ${event.fuel_level} de ${data.motorcycle?.segments??6}`:''}</p>`).join('')
  : extra.shifts.map(s=>`<p class="subheading">${new Date(s.started_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})} → ${s.ended_at?new Date(s.ended_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}):'aberto'} · ${s.start_km} → ${s.end_km??'—'} km</p>`).join('');
 el('maintenance-list').innerHTML=extra.maintenance.length?extra.maintenance.map(m=>{const remaining=extra.latestKm===null?null:m.last_km+m.interval_km-extra.latestKm;return `<div class="maintenance-row"><div><strong>${esc(m.title)}</strong><p class="${remaining!==null&&remaining<=0?'quality-note':'subheading'}">Próxima: ${(m.last_km+m.interval_km).toLocaleString('pt-BR')} km · ${remaining===null?'aguardando odômetro':remaining<=0?'Manutenção vencida':`faltam ${remaining.toLocaleString('pt-BR')} km`}</p></div><button class="button button-secondary" data-service="${m.id}">${icon("wrench")} <span>Registrar realizada</span></button></div>`;}).join(''):'<p class="subheading">Adicione óleo, pneus, relação e revisões conforme o manual da sua moto.</p>';
 el('maintenance-list').querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{const m=extra.maintenance.find(m=>m.id===b.dataset.service);el('service-dialog').dataset.id=m.id;el('service-title').textContent=m.title;el('service-km').min=m.last_km;el('service-km').value=extra.latestKm??m.last_km;el('service-dialog').showModal();});
 renderPeriodGoals();
 renderMetrics();renderReports();
}
function renderAlerts(){
 if(!data||!extra||!el('quality-warning'))return;
 const {escapeHtml:esc}=context;
 const missing=data.rides.filter(r=>!r.establishment.trim()||r.establishment==='Não informado').length;
 const alerts=[];
 const overdue=extra.maintenance.filter(m=>extra.latestKm!==null&&m.last_km+m.interval_km-extra.latestKm<=0);
 const upcoming=extra.maintenance.filter(m=>extra.latestKm!==null&&m.last_km+m.interval_km-extra.latestKm>0&&m.last_km+m.interval_km-extra.latestKm<=500);
 if(overdue.length)alerts.push({level:'urgent',text:`Manutenção vencida: ${overdue.map(m=>m.title).join(', ')}. Agende a revisão.`});
 if(upcoming.length)alerts.push({level:'warning',text:`Manutenção próxima (até 500 km): ${upcoming.map(m=>m.title).join(', ')}.`});
 if(missing)alerts.push({level:'warning',text:`${missing} corrida(s) sem estabelecimento. Revise em Minhas corridas.`});
 if(data.fuelEfficiency===null)alerts.push({level:'info',text:'Consumo ainda sem referência: registre dois tanques cheios com odômetro crescente.'});
 if(extra.active&&!extra.active.paused_at&&Date.now()-extra.active.started_at>=12*60*60*1000)alerts.push({level:'warning',text:'A jornada aberta já passa de 12 horas. Confira se precisa pausá-la ou encerrá-la.'});
 el('quality-warning').innerHTML=alerts.length?alerts.map(alert=>`<p class="driver-alert ${alert.level}">${esc(alert.text)}</p>`).join(''):'<p class="driver-alert clear">Nenhum aviso no momento. Boa rota!</p>';
}
function renderPeriodGoals(){
 const result=periodGoal(extra.daily,data.date,data.dailyGoalCents??0);
 for(const [key,period] of Object.entries({week:result.week,month:result.month})){
  el(`${key}-goal-summary`).textContent=`${period.days} ${period.days===1?'dia':'dias'} considerados`;
  el(`${key}-goal-progress`).style.width=`${period.progress}%`;
  el(`${key}-goal-track`).setAttribute('role','progressbar');
  el(`${key}-goal-track`).setAttribute('aria-label',`Ritmo da meta ${key==='week'?'semanal':'mensal'}`);
  el(`${key}-goal-track`).setAttribute('aria-valuemin','0');
  el(`${key}-goal-track`).setAttribute('aria-valuemax','100');
  el(`${key}-goal-track`).setAttribute('aria-valuenow',String(period.progress));
  el(`${key}-goal-detail`).textContent=`${context.brl(period.gross)} de ${context.brl(period.target)} no ritmo diário${period.remaining?` · faltam ${context.brl(period.remaining)} para o ritmo`: ' · ritmo alcançado'}.`;
 }
}
function renderCarryover(){
 if(!data||!extra)return;
 const carry=Number(extra.carryCents||0);
 const adjustedGross=data.grossCents+carry;
 const remaining=Math.max(0,data.dailyGoalCents-adjustedGross);
 const progress=data.dailyGoalCents?Math.max(0,Math.min(100,Math.round(adjustedGross/data.dailyGoalCents*100))):0;
 el('goal-progress').style.width=`${progress}%`;
 el('goal-progress').parentElement.setAttribute('aria-valuenow',String(progress));
 el('goal-progress-label').textContent=carry<0?`${progress}% concluído · saldo anterior ${context.brl(carry)}`:`${progress}% concluído`;
 el('goal-remaining').textContent=remaining?`Faltam ${context.brl(remaining)}${carry<0?` · inclui saldo anterior de ${context.brl(-carry)}`:''}`:carry<0?`Meta batida após compensar ${context.brl(-carry)} de saldo anterior`:'Meta batida! Mandou bem';
 const estimate=el('goal-rides-estimate');
 if(estimate){
  const needed=ridesToGoal(remaining);
  estimate.textContent=needed?`Faltam ${needed} ${needed===1?'corrida':'corridas'} de R$ 9,00 para bater a meta${carry<0?' e compensar o saldo anterior':''}.`:'Meta atingida · nenhuma corrida adicional necessária.';
 }
}
function renderReports(){
 const p=periodTotals(extra.daily,data.date,Number(el('report-period').value));const money=context.brl;
 el('report-dates').textContent=`${p.start} a ${data.date} · dias sem registros contam como zero.`;
 el('report-metrics').innerHTML=metric('Faturamento',money(p.gross),'rides')+metric('Recebido',money(p.paid))+metric('Pendente',money(p.gross-p.paid))+metric('Despesas pagas',money(p.expenses),'expenses')+metric('Saldo recebido',money(p.paid-p.expenses))+metric('Média por entrega',p.count?money(p.gross/p.count):'—');
 el('report-metrics').querySelectorAll('[data-report-action]').forEach(button=>{
  button.onclick=()=>context.openFullHistory(button.dataset.reportAction);
 });
 el('report-comparison').textContent=p.previousGross?`Faturamento ${((p.gross/p.previousGross-1)*100).toFixed(1)}% em relação aos ${p.days} dias anteriores.`:'Período anterior sem faturamento registrado para comparação.';
 const max=Math.max(1,...p.rows.map(r=>Math.abs(r.paid-r.expenses)));
 el('report-bars').innerHTML=p.rows.length?p.rows.map(r=>{
  const net=r.paid-r.expenses;
  const negative=net<0;
  return `<div class="report-row"><span>${r.day.slice(5).split('-').reverse().join('/')}</span><div class="bar-track ${negative?'bar-negative':''}"><div style="width:${Math.abs(net)/max*100}%"></div></div><strong class="${negative?'negative-value':''}">${money(net)}</strong></div>`;
 }).join(''):'<p>Sem registros neste período.</p>';
}
function exportReport(){
 const p=periodTotals(extra.daily,data.date,Number(el('report-period').value));const rows=[['Data','Corridas','Faturamento R$','Recebido R$','Pendente R$','Despesas R$','Saldo recebido R$'],...p.rows.map(r=>[r.day,r.count,(r.gross/100).toFixed(2),(r.paid/100).toFixed(2),((r.gross-r.paid)/100).toFixed(2),(r.expenses/100).toFixed(2),((r.paid-r.expenses)/100).toFixed(2)])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`resumo-${data.date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportPdfReport(){
 const p=periodTotals(extra.daily,data.date,Number(el('report-period').value));
 const printWindow=window.open('', '_blank', 'noopener,noreferrer');
 if(!printWindow){context.toast('Permita pop-ups para gerar o relatório em PDF.');return;}
 const rows=p.rows.map(r=>`<tr><td>${r.day.split('-').reverse().join('/')}</td><td>${r.count}</td><td>${context.brl(r.gross)}</td><td>${context.brl(r.paid)}</td><td>${context.brl(r.gross-r.paid)}</td><td>${context.brl(r.expenses)}</td><td>${context.brl(r.paid-r.expenses)}</td></tr>`).join('');
 printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório LJCS</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ccc;text-align:left;font-size:12px}@media print{button{display:none}}</style></head><body><h1>Relatório LJCS Entregas</h1><p>${p.start.split('-').reverse().join('/')} a ${data.date.split('-').reverse().join('/')}</p><table><thead><tr><th>Data</th><th>Corridas</th><th>Faturamento</th><th>Recebido</th><th>Pendente</th><th>Despesas</th><th>Saldo recebido</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Sem registros</td></tr>'}</tbody></table><p>Use o comando Imprimir e escolha “Salvar como PDF”.</p><button onclick="window.print()">Salvar como PDF</button></body></html>`);
 printWindow.document.close();
}
