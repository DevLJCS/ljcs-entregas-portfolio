import { garage, selectedMotorcycle, storeGarage } from "./motorcycles";
import { carryBeforeDay } from "../shared/daily-balance";
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store'}});
const bad = (error: string, status = 400) => reply({error}, status);
const km = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 999999;
const fuelLevel = (v: unknown, segments: number): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= segments;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date());
export async function productivity(request: Request, db: D1Database): Promise<Response | null> {
 const url = new URL(request.url), path = url.pathname, method = request.method;
 if (!path.startsWith('/api/productivity')) return null;
 const motorcycle = selectedMotorcycle(await garage(db));
 const costKey = motorcycle.id === 'legacy' ? 'cost_model' : `cost_model:${motorcycle.id}`;
 if (method === 'GET' && path === '/api/productivity') {
  const day = url.searchParams.get('date') || today();
  const parsedDay = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0,10)!==day) return bad('Data inválida.');
  const [shifts, active, maintenance, costs, suggestions, daily, latest, priorDays] = await Promise.all([
   db.prepare('SELECT * FROM work_shifts WHERE day = ? AND motorcycle_id = ? ORDER BY started_at').bind(day,motorcycle.id).all(),
    db.prepare('SELECT * FROM work_shifts WHERE ended_at IS NULL AND motorcycle_id = ?').bind(motorcycle.id).first(),
   db.prepare('SELECT * FROM maintenance WHERE motorcycle_id = ? ORDER BY title').bind(motorcycle.id).all(),
   db.prepare("SELECT value FROM settings WHERE key = ?").bind(costKey).first<{value:string}>(),
   db.prepare('SELECT establishment FROM rides GROUP BY establishment ORDER BY MAX(occurred_at) DESC LIMIT 100').all(),
   db.prepare(`WITH days AS (SELECT substr(occurred_at,1,10) day FROM rides UNION SELECT substr(occurred_at,1,10) FROM expenses)
    SELECT d.day, COALESCE(r.gross,0) gross, COALESCE(r.paid,0) paid, COALESCE(r.count,0) count, COALESCE(e.expenses,0) expenses FROM days d
    LEFT JOIN (SELECT substr(occurred_at,1,10) day,SUM(amount_cents) gross,SUM(CASE WHEN paid=1 THEN amount_cents ELSE 0 END) paid,COUNT(*) count FROM rides GROUP BY day) r ON r.day=d.day
    LEFT JOIN (SELECT substr(occurred_at,1,10) day,SUM(amount_cents) expenses FROM expenses GROUP BY day) e ON e.day=d.day
    WHERE d.day BETWEEN date(?, '-59 days') AND ? ORDER BY d.day`).bind(day,day).all(),
   db.prepare('SELECT MAX(value) km FROM (SELECT start_km value FROM work_shifts WHERE motorcycle_id = ?1 UNION ALL SELECT end_km FROM work_shifts WHERE motorcycle_id = ?1 UNION ALL SELECT odometer_km FROM expenses WHERE motorcycle_id = ?1)').bind(motorcycle.id).first(),
   db.prepare(`WITH activity AS (
     SELECT substr(occurred_at,1,10) day,amount_cents amount FROM rides WHERE occurred_at < ? AND paid = 1
     UNION ALL SELECT substr(occurred_at,1,10) day,-amount_cents amount FROM expenses WHERE occurred_at < ?
    ) SELECT day,SUM(amount) net FROM activity GROUP BY day ORDER BY day`).bind(`${day}T00:00`,`${day}T00:00`).all<{day:string;net:number}>()
  ]);
  const activeShift = active as { id?: string } | null;
  const events = activeShift?.id
    ? await db.prepare('SELECT * FROM work_shift_events WHERE shift_id = ? ORDER BY occurred_at').bind(activeShift.id).all()
    : { results: [] };
  const endedShiftIds = (shifts.results as Array<{ id: string; ended_at: number | null }>)
   .filter((shift) => shift.ended_at !== null)
   .map((shift) => shift.id);
  let historyEvents: { results: unknown[] } = { results: [] };
  if (endedShiftIds.length) {
    const placeholders = endedShiftIds.map(() => '?').join(',');
    historyEvents = await db.prepare(`SELECT * FROM work_shift_events WHERE shift_id IN (${placeholders}) ORDER BY occurred_at`).bind(...endedShiftIds).all();
  }
  const allEvents = [...historyEvents.results, ...events.results];
  const carryCents=carryBeforeDay(priorDays.results,day);
  return reply({shifts:shifts.results, active, maintenance:maintenance.results, costs: costs ? JSON.parse(costs.value) : null, carryCents, suggestions:suggestions.results, daily:daily.results, latestKm:latest?.km ?? null, shiftEvents:allEvents});
 }
 let body: Record<string, unknown>;
 try { body = await request.json(); } catch { return bad('Dados inválidos.'); }
 if (!body || typeof body !== 'object') return bad('Dados inválidos.');
 if (method === 'POST' && path === '/api/productivity/shift') {
  const now = Date.now();
  if (body.action === 'start') {
   if (!km(body.km)) return bad('Informe o km inicial válido.');
   try { await db.prepare('INSERT INTO work_shifts(id,day,started_at,start_km,motorcycle_id) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),today(),now,body.km,motorcycle.id).run(); }
   catch { return bad('Já existe um expediente aberto. Atualize o painel.',409); }
   const started = await db.prepare('SELECT id FROM work_shifts WHERE ended_at IS NULL AND motorcycle_id = ?').bind(motorcycle.id).first<{id:string}>();
   if (started) await db.prepare('INSERT INTO work_shift_events(id,shift_id,type,occurred_at,km,motorcycle_id) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),started.id,'start',now,body.km,motorcycle.id).run();
  } else {
   const active = await db.prepare('SELECT * FROM work_shifts WHERE ended_at IS NULL AND motorcycle_id = ?').bind(motorcycle.id).first<{id:string; start_km:number; paused_at:number|null; paused_ms:number}>();
   if (!active || active.id !== body.id) return bad('O expediente mudou. Atualize o painel.',409);
   if (body.action === 'pause' && active.paused_at === null) {
    if (!km(body.km) || body.km < active.start_km) return bad('Informe o km do painel ao pausar, maior ou igual ao inicial.');
    if (!fuelLevel(body.fuelLevel,motorcycle.segments)) return bad(`Informe o nível do marcador de combustível entre 0 e ${motorcycle.segments}.`);
    const updated = await db.prepare('UPDATE work_shifts SET paused_at=? WHERE id=? AND paused_at IS NULL AND ended_at IS NULL').bind(now,active.id).run();
    if (!updated.meta.changes) return bad('O expediente mudou. Atualize o painel.',409);
    await db.prepare('INSERT INTO work_shift_events(id,shift_id,type,occurred_at,km,fuel_level,motorcycle_id) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),active.id,'pause',now,body.km,body.fuelLevel,motorcycle.id).run();
    const state=await garage(db);
    const selected=selectedMotorcycle(state);
    selected.level=Number(body.fuelLevel);
    await storeGarage(db,state);
   } else if (body.action === 'resume' && active.paused_at !== null) {
    if (!km(body.km)) return bad('Informe o km do painel ao retomar.');
    if (!fuelLevel(body.fuelLevel,motorcycle.segments)) return bad(`Informe o nível do marcador de combustível entre 0 e ${motorcycle.segments}.`);
    const last=await db.prepare('SELECT km FROM work_shift_events WHERE shift_id=? AND km IS NOT NULL ORDER BY occurred_at DESC LIMIT 1').bind(active.id).first<{km:number}>();
    if (last && body.km<last.km) return bad('O km ao retomar não pode ser menor que a última leitura registrada.');
    const updated=await db.prepare('UPDATE work_shifts SET paused_ms=paused_ms+?-paused_at,paused_at=NULL WHERE id=? AND paused_at IS NOT NULL AND ended_at IS NULL').bind(now,active.id).run();
    if (!updated.meta.changes) return bad('O expediente mudou. Atualize o painel.',409);
    await db.prepare('INSERT INTO work_shift_events(id,shift_id,type,occurred_at,km,fuel_level,motorcycle_id) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),active.id,'resume',now,body.km,body.fuelLevel,motorcycle.id).run();
    const state=await garage(db);
    const selected=selectedMotorcycle(state);
    selected.level=Number(body.fuelLevel);
    await storeGarage(db,state);
   } else if (body.action === 'end') {
    if (!km(body.km) || body.km < active.start_km) return bad('O km final deve ser maior ou igual ao inicial.');
    const last=await db.prepare('SELECT km FROM work_shift_events WHERE shift_id=? AND km IS NOT NULL ORDER BY occurred_at DESC LIMIT 1').bind(active.id).first<{km:number}>();
    if (last && body.km<last.km) return bad('O km final não pode ser menor que a última leitura registrada.');
    const updated = await db.prepare('UPDATE work_shifts SET ended_at=?,end_km=?,paused_ms=paused_ms+CASE WHEN paused_at IS NULL THEN 0 ELSE ?-paused_at END,paused_at=NULL WHERE id=? AND ended_at IS NULL').bind(now,body.km,now,active.id).run();
    if (!updated.meta.changes) return bad('O expediente já foi encerrado em outra solicitação. Atualize o painel.',409);
    await db.prepare('INSERT INTO work_shift_events(id,shift_id,type,occurred_at,km,motorcycle_id) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),active.id,'end',now,body.km,motorcycle.id).run();
    return reply({saved:true});
   } else return bad('Ação indisponível para este expediente.',409);
  }
  return reply({saved:true});
 }
 if (method === 'PUT' && path === '/api/productivity/costs') {
  for (const key of ['fuelPrice','efficiency','reserve']) if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || Number(body[key]) <= 0 || Number(body[key]) > 1000) return bad('Preencha preço/L, km/L e reserva por km com valores positivos até 1.000.');
  await db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(costKey,JSON.stringify({fuelPrice:body.fuelPrice,efficiency:body.efficiency,reserve:body.reserve})).run();
  return reply({saved:true});
 }
 if (method === 'POST' && path === '/api/productivity/maintenance') {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100 || !km(body.lastKm) || !km(body.intervalKm) || body.intervalKm <= 0) return bad('Confira nome, km da última manutenção e intervalo.');
  await db.prepare('INSERT INTO maintenance(id,title,last_km,interval_km,motorcycle_id) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),body.title.trim(),body.lastKm,body.intervalKm,motorcycle.id).run();
  return reply({saved:true});
 }
 if (method === 'PUT' && path === '/api/productivity/maintenance') {
  if (typeof body.id !== 'string' || !km(body.km)) return bad('Informe a quilometragem da manutenção.');
  const result = await db.prepare('UPDATE maintenance SET last_km=? WHERE id=? AND last_km<=?').bind(body.km,body.id,body.km).run();
  return result.meta.changes ? reply({saved:true}) : bad('Registro ausente ou km menor que a última manutenção.');
 }
 return bad('Rota não encontrada.',404);
}
