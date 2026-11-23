import { motorcycleCatalog } from '../shared/motorcycle-catalog';
export interface Motorcycle {
 id:string; brand:string; model:string; year:number|null; tankLiters:number|null; reserveLiters:number|null;
 gaugeType:'bars'|'analog'|'reserve'; segments:number; level:number|null; catalogKey:string|null;
}
interface Garage { selectedId:string; profiles:Motorcycle[]; raw:string|null }
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function garage(db:D1Database):Promise<Garage> {
 const row=await db.prepare("SELECT value FROM settings WHERE key='motorcycle_profiles'").first<{value:string}>();
 if(row)return {...JSON.parse(row.value),raw:row.value};
 const level=await db.prepare("SELECT value FROM settings WHERE key='fuel_level'").first<{value:string}>();
 return {raw:null,selectedId:'legacy',profiles:[{id:'legacy',brand:'Yamaha',model:'Fazer 150',year:null,tankLiters:null,reserveLiters:null,gaugeType:'bars',segments:6,level:Number(level?.value??6),catalogKey:null}]};
}
export const selectedMotorcycle=(state:Garage)=>state.profiles.find(p=>p.id===state.selectedId)!;
export async function storeGarage(db:D1Database,state:Garage) {
 const value=JSON.stringify({selectedId:state.selectedId,profiles:state.profiles});
 const result=state.raw===null
 ? await db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('motorcycle_profiles',?)").bind(value).run()
 : await db.prepare("UPDATE settings SET value=? WHERE key='motorcycle_profiles' AND value=?").bind(value,state.raw).run();
 if(!result.meta.changes)throw new Error('GARAGE_CONFLICT');
}
export async function motorcycleApi(request:Request,db:D1Database):Promise<Response|null> {
 if(new URL(request.url).pathname!=='/api/motorcycles')return null;
 const state=await garage(db);
 if(request.method==='GET')return reply({selectedId:state.selectedId,profiles:state.profiles,catalog:motorcycleCatalog});
 if(request.method!=='PUT')return reply({error:'Método indisponível.'},405);
 let b:Record<string,unknown>;try{b=await request.json();}catch{return reply({error:'Dados inválidos.'},400);}
 if(!b||typeof b!=='object')return reply({error:'Dados inválidos.'},400);
 let savedId:string|undefined;
 if(b.action==='select') {
  if(!state.profiles.some(p=>p.id===b.id))return reply({error:'Moto não encontrada.'},404);
  if(b.id!==state.selectedId && await db.prepare('SELECT id FROM work_shifts WHERE ended_at IS NULL').first())return reply({error:'Encerre o expediente antes de trocar de moto.'},409);
  state.selectedId=String(b.id);
 } else if(b.action==='save') {
  const validText=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=80;
  const validLiters=(v:unknown)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=100);
  if(!validText(b.brand)||!validText(b.model)||(b.year!==null&&(!Number.isInteger(b.year)||Number(b.year)<1950||Number(b.year)>2100))||!validLiters(b.tankLiters)||!validLiters(b.reserveLiters)||!['bars','analog','reserve'].includes(String(b.gaugeType))||!Number.isInteger(b.segments)||Number(b.segments)<1||Number(b.segments)>12||(typeof b.tankLiters==='number'&&typeof b.reserveLiters==='number'&&b.reserveLiters>=b.tankLiters))return reply({error:'Confira marca, modelo, ano, litros e marcador (1 a 12 divisões).'},400);
  const old=state.profiles.find(p=>p.id===b.id);
  if(b.id && !old)return reply({error:'Moto não encontrada.'},404);
  if(!old && state.profiles.length>=30)return reply({error:'Limite de 30 motos cadastradas.'},400);
  const profile:Motorcycle={id:old?.id??crypto.randomUUID(),brand:String(b.brand).trim(),model:String(b.model).trim(),year:b.year as number|null,tankLiters:b.tankLiters as number|null,reserveLiters:b.reserveLiters as number|null,gaugeType:b.gaugeType as Motorcycle['gaugeType'],segments:b.gaugeType==='bars'?Number(b.segments):b.gaugeType==='analog'?4:1,level:old&&old.gaugeType===b.gaugeType&&old.segments===b.segments?old.level:null,catalogKey:typeof b.catalogKey==='string'&&motorcycleCatalog.some(c=>c.key===b.catalogKey)?b.catalogKey:null};
  savedId=profile.id;
  if(old)state.profiles=state.profiles.map(p=>p.id===old.id?profile:p);else state.profiles.push(profile);
 } else return reply({error:'Ação inválida.'},400);
 try{await storeGarage(db,state);}catch(e){if(e instanceof Error&&e.message==='GARAGE_CONFLICT')return reply({error:'Dados atualizados em outro dispositivo. Reabra a janela.'},409);throw e;}
 return reply({selectedId:state.selectedId,profiles:state.profiles,savedId});
}
