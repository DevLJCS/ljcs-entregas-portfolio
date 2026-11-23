import zones from '../shared/jau-zones.json';

export interface Address { cep: string; street: string; number: string; district: string; city: string; state: string; complement: string; lat: number; lng: number }
export function text(value: unknown, max = 150): string { return String(value ?? '').trim().slice(0, max); }
export function address(value: unknown): Address {
  const a = value as Partial<Address> | null;
  if (!a || !text(a.street) || !text(a.number) || !text(a.district) || !text(a.city) || text(a.state).toUpperCase() !== 'SP' || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) throw new Error('Complete o endereço, incluindo número, bairro e pin no mapa.');
  const result = {cep:text(a.cep,9),street:text(a.street),number:text(a.number,20),district:text(a.district),city:text(a.city,80),state:'SP',complement:text(a.complement),lat:Number(a.lat),lng:Number(a.lng)};
  if(result.city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()!=='jau')throw new Error('A operação atual atende endereços do município de Jaú/SP.');
  if (classify(result.lat,result.lng) === 'outside') throw new Error('Nesta etapa, coleta e entrega devem estar dentro do município de Jaú.');
  return result;
}
function inRing(x:number,y:number,ring:number[][]):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    const cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
    if(Math.abs(cross)<1e-11 && x>=Math.min(xi,xj)-1e-9 && x<=Math.max(xi,xj)+1e-9 && y>=Math.min(yi,yj)-1e-9 && y<=Math.max(yi,yj)+1e-9)return true;
    if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;
}
export function classify(lat:number,lng:number):'urban'|'rural'|'outside' {
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return 'outside';
  for(const f of zones) {
    const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];
    for(const polygon of polygons as number[][][][])if(inRing(lng,lat,polygon[0])&&!polygon.slice(1).some(r=>inRing(lng,lat,r)))return f.zone as 'urban'|'rural';
  }return 'outside';
}
export function distance(lat:number,lng:number,a:number,b:number):number {
  const r=Math.PI/180,dlat=(a-lat)*r,dlng=(b-lng)*r;
  const v=Math.sin(dlat/2)**2+Math.cos(lat*r)*Math.cos(a*r)*Math.sin(dlng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
export function rate(now:number,rain:boolean,peixinho:boolean):number {
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
  return Math.max(1000,rain?1100:0,peixinho?1500:0,hour===0?1200:hour>=1&&hour<5?1300:0);
}
export function formatAddress(a:Address):string{return `${a.street}, ${a.number} · ${a.district} · ${a.city}/${a.state}${a.complement?' · '+a.complement:''}`;}
