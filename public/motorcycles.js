import { motorcycleCatalog } from '../shared/motorcycle-catalog.ts';
import { icon } from './icons.js';
let helpers, current, state, editingId=null;
const el=id=>document.getElementById(id);
const title=p=>`${p.brand} ${p.model}${p.year?` · ${p.year}`:''}`;
const number=id=>el(id).value===''?null:Number(el(id).value);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initMotorcycles(){
 const dialog=document.createElement('dialog');dialog.id='motorcycles-modal';dialog.className='modal motorcycles-modal';dialog.setAttribute('aria-labelledby','motorcycles-title');
 dialog.innerHTML=`<div class="modal-card"><div class="modal-heading"><div><p class="eyebrow">SUA GARAGEM</p><h2 id="motorcycles-title">Minha moto</h2></div><button class="close-modal" type="button" aria-label="Fechar">${icon('close')}</button></div>
 <p class="subheading">Escolha sua moto ou cadastre qualquer marca, modelo e ano. Os dados do catálogo valem somente para a versão indicada.</p>
 <div class="garage-selection"><div class="field"><label for="motorcycle-saved">Motos cadastradas</label><select id="motorcycle-saved"></select></div><button type="button" class="button button-secondary" id="motorcycle-use">Usar esta moto</button><button type="button" class="button button-quiet" id="motorcycle-new">Nova moto</button></div>
 <form id="motorcycle-form"><div class="field"><label for="motorcycle-catalog">Preencher a partir do catálogo verificado</label><select id="motorcycle-catalog"><option value="">Cadastro manual / outro modelo</option>${motorcycleCatalog.map(p=>`<option value="${p.key}">${escape(title(p))}</option>`).join('')}</select></div>
 <p class="subheading" id="motorcycle-source"></p><div class="form-grid">
 <div class="field"><label for="motorcycle-brand">Marca</label><input id="motorcycle-brand" maxlength="80" required></div>
 <div class="field"><label for="motorcycle-model">Modelo / versão</label><input id="motorcycle-model" maxlength="80" required></div>
 <div class="field"><label for="motorcycle-year">Ano <span class="optional">opcional</span></label><input id="motorcycle-year" type="number" min="1950" max="2100" step="1"></div>
 <div class="field"><label for="motorcycle-tank">Tanque total (L) <span class="optional">opcional</span></label><input id="motorcycle-tank" type="number" min="0.1" max="100" step="0.1"></div>
 <div class="field"><label for="motorcycle-reserve">Reserva incluída no total (L) <span class="optional">opcional</span></label><input id="motorcycle-reserve" type="number" min="0.1" max="100" step="0.1"></div>
 <div class="field"><label for="motorcycle-gauge">Marcador no painel</label><select id="motorcycle-gauge" required><option value="">Selecione conforme sua moto</option><option value="bars">Digital com barras / segmentos</option><option value="analog">Ponteiro / escala E–F</option><option value="reserve">Somente aviso de reserva</option></select></div>
 <div class="field" id="motorcycle-segments-field"><label for="motorcycle-segments">Quantidade de barras no painel</label><input id="motorcycle-segments" type="number" min="1" max="12" step="1"></div></div>
 <p class="subheading">Confira o manual da sua moto. Quando o catálogo não confirmar um dado, preencha-o manualmente. Barras e posição do ponteiro não equivalem a frações exatas de litros.</p>
 <p class="form-error" id="motorcycle-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-quiet close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar e usar</button></div></form></div>`;
 document.body.append(dialog);
 dialog.querySelectorAll('.close-modal').forEach(b=>b.onclick=()=>dialog.close());
 el('open-motorcycles').onclick=async()=>{try{state=await helpers.api('/api/motorcycles');el('motorcycle-saved').innerHTML=state.profiles.map(p=>`<option value="${p.id}">${escape(title(p))}${p.id===state.selectedId?' · atual':''}</option>`).join('');el('motorcycle-saved').value=state.selectedId;load(state.profiles.find(p=>p.id===state.selectedId));el('motorcycle-error').textContent='';dialog.showModal();}catch(e){helpers.toast(e.message);}};
 el('motorcycle-saved').onchange=()=>load(state.profiles.find(p=>p.id===el('motorcycle-saved').value));
 el('motorcycle-new').onclick=()=>{editingId=null;el('motorcycle-form').reset();updateGaugeFields();updateSource();el('motorcycle-error').textContent='';};
 el('motorcycle-catalog').onchange=()=>{const c=motorcycleCatalog.find(p=>p.key===el('motorcycle-catalog').value);if(c){for(const [field,key] of [['brand','brand'],['model','model'],['year','year'],['tank','tankLiters'],['reserve','reserveLiters'],['gauge','gaugeType'],['segments','segments']])el('motorcycle-'+field).value=c[key]??'';}updateGaugeFields();updateSource();};
 el('motorcycle-gauge').onchange=updateGaugeFields;
 el('motorcycle-use').onclick=()=>saveAction(async()=>{await helpers.api('/api/motorcycles',{method:'PUT',body:JSON.stringify({action:'select',id:el('motorcycle-saved').value})});});
 el('motorcycle-form').onsubmit=e=>{e.preventDefault();saveAction(async()=>{const result=await helpers.api('/api/motorcycles',{method:'PUT',body:JSON.stringify({action:'save',id:editingId,brand:el('motorcycle-brand').value,model:el('motorcycle-model').value,year:number('motorcycle-year'),tankLiters:number('motorcycle-tank'),reserveLiters:number('motorcycle-reserve'),gaugeType:el('motorcycle-gauge').value,segments:el('motorcycle-gauge').value==='bars'?number('motorcycle-segments'):el('motorcycle-gauge').value==='analog'?4:1,catalogKey:el('motorcycle-catalog').value||null})});await helpers.api('/api/motorcycles',{method:'PUT',body:JSON.stringify({action:'select',id:result.savedId})});});};
}
function load(p){editingId=p.id;el('motorcycle-catalog').value=p.catalogKey??'';for(const [field,key] of [['brand','brand'],['model','model'],['year','year'],['tank','tankLiters'],['reserve','reserveLiters'],['gauge','gaugeType'],['segments','segments']])el('motorcycle-'+field).value=p[key]??'';updateGaugeFields();updateSource();}
function updateGaugeFields(){const bars=el('motorcycle-gauge').value==='bars';el('motorcycle-segments-field').hidden=!bars;el('motorcycle-segments').required=bars;}
function updateSource(){const c=motorcycleCatalog.find(p=>p.key===el('motorcycle-catalog').value);el('motorcycle-source').innerHTML=c?`Referência do fabricante para capacidade: <a href="${c.source}" target="_blank" rel="noopener noreferrer">${escape(title(c))}</a>. ${c.gaugeSource?`<a href="${c.gaugeSource}" target="_blank" rel="noopener noreferrer">Manual do painel</a>. `:''}Confirme o tipo e o número de divisões no seu painel. Campos alterados são dados personalizados.`:(editingId==='legacy'?'Dados personalizados. A configuração anterior da Fazer 150 foi preservada; informe ano e capacidade se souber.':'Dados personalizados. Informe as especificações do manual da moto.');}
async function saveAction(action){const buttons=el('motorcycles-modal').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);el('motorcycle-error').textContent='';try{await action();await helpers.refresh();el('motorcycles-modal').close();helpers.toast('Moto atualizada na nuvem.');}catch(e){el('motorcycle-error').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
export function renderMotorcycle(data,context){
 helpers=context;current=data.motorcycle;if(!current)return;
 el('motorcycle-name').textContent=title(current);
 el('motorcycle-capacity').textContent=current.tankLiters===null?'Capacidade do tanque não informada · toque no nome para configurar.':`Tanque total: ${current.tankLiters.toLocaleString('pt-BR')} L${current.reserveLiters!==null?` · reserva incluída: ${current.reserveLiters.toLocaleString('pt-BR')} L`:''}`;
 const max=current.segments,level=data.fuelLevel;
 const labels=current.gaugeType==='analog'?['E / reserva','¼','½','¾','F / cheio']:current.gaugeType==='reserve'?['Reserva acesa','Reserva apagada']:Array.from({length:max+1},(_,i)=>i===0?'Vazio / reserva':`${i} de ${max} barras acesas`);
 el('fuel-gauge-label').textContent=level===null?'Nível ainda não informado':labels[level];
 el('fuel-gauge-bars').setAttribute('aria-label','Marcador manual de combustível');
 el('fuel-gauge-bars').innerHTML=Array.from({length:max},(_,i)=>i+1).concat(0).map(n=>`<button type="button" class="${current.gaugeType==='bars'&&n>0?'fuel-gauge-square':'fuel-level-option'} ${level!==null&&n>0&&n<=level?'lit':''}" aria-label="${labels[n]}" aria-pressed="${n===level}" data-fuel-level="${n}">${current.gaugeType==='bars'&&n>0?'':labels[n]}</button>`).join('');
 el('fuel-gauge-help').textContent='Registro manual conforme o painel. Não estima litros restantes nem autonomia.';
 el('fuel-gauge-bars').querySelectorAll('[data-fuel-level]').forEach(b=>b.onclick=async()=>{try{await helpers.api('/api/settings/fuel-level',{method:'PUT',body:JSON.stringify({fuelLevel:Number(b.dataset.fuelLevel),motorcycleId:current.id})});await helpers.refresh();}catch(e){helpers.toast(e.message);}});
}
