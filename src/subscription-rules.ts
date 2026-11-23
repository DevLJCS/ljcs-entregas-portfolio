export const PLANS = {
  basic: {name:'Básico',weeklyCents:1000,description:'Para organizar seu dia e receber entregas.',features:['Painel do dia com quantidade e valor das entregas concluídas','Meta diária e estimativa de corridas para alcançá-la','Chamadas por proximidade e aceite em 5 segundos','Histórico recente com busca e filtros','Telas próprias de chamadas, meta, plano e cadastro','Senha, passkeys e consulta de pagamentos']},
  normal: {name:'Normal',weeklyCents:2500,description:'Para acompanhar sua produção e seus gastos.',features:['Todos os recursos do Básico','Despesas de combustível, manutenção, alimentação e outros gastos','Saldo estimado das entregas menos as despesas registradas','Remoção e restauração de despesas','Relatórios de 7 e 30 dias com totais e evolução diária','Telas exclusivas de despesas e relatórios']},
  premium: {name:'Premium',weeklyCents:5000,description:'Para analisar resultados e cuidar da sua moto.',features:['Todos os recursos do Normal','Moto e odômetro com lembretes de manutenção por km','Comparação com o período anterior','Período personalizado de até 90 dias','Exportação CSV das entregas concluídas','Exportação JSON dos próprios dados','Telas exclusivas de manutenção, comparativos e exportações']}
} as const;
export type PlanId=keyof typeof PLANS;
export function reportRange(plan:PlanId,days:string|null,from:string|null,to:string|null,now=Date.now()){
  if(plan==='basic')throw new Error('Relatórios estão disponíveis nos planos Normal e Premium.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  let start:string,end:string;
  if(from!==null||to!==null){if(plan!=='premium')throw new Error('O período personalizado está disponível no Premium.');if(!from||!to||!valid(from)||!valid(to))throw new Error('Informe datas válidas.');start=from;end=to;}
  else {const count=Number(days||7);if(![7,30].includes(count))throw new Error('Escolha o período de 7 ou 30 dias.');end=today;start=new Date(Date.parse(today+'T12:00:00Z')-(count-1)*86400000).toISOString().slice(0,10);}
  if(end<start||end>today||Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z')>89*86400000)throw new Error('Escolha até 90 dias, sem datas futuras.');
  return {from:start,to:end,start:Date.parse(start+'T00:00:00-03:00'),end:Date.parse(end+'T00:00:00-03:00')+86400000};
}
export interface Subscription {user_id:string;plan:PlanId;valid_until:number;revoked:number;revision:number}
export function planId(value:unknown):PlanId {if(typeof value!=='string'||!Object.hasOwn(PLANS,value))throw new Error('Plano inválido.');return value as PlanId;}
export function access(s:Subscription|undefined,approved:boolean,now=Date.now()){
  const status=s?.revoked?'revoked':!approved?'pending_approval':!s?.valid_until?'pending_payment':s.valid_until<=now?'expired':'active';
  return {plan:s?.plan||'basic',planName:PLANS[s?.plan||'basic'].name,weeklyCents:PLANS[s?.plan||'basic'].weeklyCents,validUntil:s?.valid_until||0,revoked:!!s?.revoked,revision:s?.revision||0,status,active:status==='active'};
}
export function renewedUntil(current:number,now:number,weeks:number){if(!Number.isInteger(weeks)||weeks<1||weeks>52)throw new Error('Informe de 1 a 52 semanas.');return Math.max(current,now)+weeks*7*86400000;}
export function accessDate(value:unknown,now:number){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))throw new Error('Informe data e hora de validade com fuso horário.');const date=Date.parse(value);if(!Number.isFinite(date)||date<0||date>now+5*366*86400000)throw new Error('Validade inválida. Use uma data em até 5 anos.');return date;}
