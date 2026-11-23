export function ridesToGoal(remainingCents, rideCents=900) {
 return Math.ceil(Math.max(0, remainingCents) / rideCents);
}
export function metrics(shifts, data, costs, now=Date.now()) {
 const hours=shifts.reduce((sum,s)=>sum+Math.max(0,(s.ended_at??now)-s.started_at-s.paused_ms-(s.paused_at===null?0:Math.max(0,now-s.paused_at))),0)/3600000;
 const complete=shifts.length>0 && shifts.every(s=>s.end_km!==null && s.ended_at!==null);
 const distance=complete?shifts.reduce((sum,s)=>sum+s.end_km-s.start_km,0):null;
 const costPerKm=costs?(costs.fuelPrice/costs.efficiency+costs.reserve)*100:null;
 const other=data.expenses.filter(e=>e.kind!=='fuel').reduce((s,e)=>s+e.amount_cents,0);
 const hasRideList=Array.isArray(data.rides);
 const rideRows=(hasRideList?data.rides:[]).filter(ride=>{
  const occurred=Date.parse(ride.occurred_at);
  return Number.isFinite(occurred)&&shifts.some(s=>{
   const ended=s.ended_at??now;
   return occurred>=s.started_at&&occurred<=ended;
  });
 }).filter(ride=>!ride.motorcycle_id||ride.motorcycle_id===data.motorcycle?.id);
 const shiftGross=hasRideList?rideRows.reduce((sum,ride)=>sum+Number(ride.amount_cents||0),0):data.grossCents;
 const rideCount=hasRideList?rideRows.length:0;
 const grossPerRide=rideCount?shiftGross/rideCount:null;
 const costPerRide=rideCount&&distance!==null&&costPerKm!==null?distance*costPerKm/rideCount:null;
 const profitPerRide=grossPerRide!==null&&costPerRide!==null?grossPerRide-costPerRide:null;
 return {hours,distance,hourly:hours>0?shiftGross/hours:null,perKm:distance>0?shiftGross/distance:null,costPerKm,result:distance!==null&&costPerKm!==null?shiftGross-distance*costPerKm-other:null,rideCount,grossPerRide,costPerRide,profitPerRide};
}
export function periodTotals(rows,date,days) {
 const offset=n=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
 const start=offset(days-1),previousStart=offset(days*2-1);
 const selected=rows.filter(r=>r.day>=start&&r.day<=date);
 return {start,days,rows:selected,gross:selected.reduce((s,r)=>s+r.gross,0),paid:selected.reduce((s,r)=>s+Number(r.paid||0),0),expenses:selected.reduce((s,r)=>s+r.expenses,0),count:selected.reduce((s,r)=>s+r.count,0),previousGross:rows.filter(r=>r.day>=previousStart&&r.day<start).reduce((s,r)=>s+r.gross,0)};
}
export function periodGoal(rows,date,dailyGoalCents) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(dailyGoalCents)||dailyGoalCents<0) throw new RangeError('Data ou meta diária inválida.');
 const selectedDate=new Date(`${date}T12:00:00Z`);
 if(!Number.isFinite(selectedDate.getTime())||selectedDate.toISOString().slice(0,10)!==date) throw new RangeError('Data inválida.');
 const dayOfWeek=(selectedDate.getUTCDay()+6)%7;
 const weekStart=new Date(selectedDate);
 weekStart.setUTCDate(weekStart.getUTCDate()-dayOfWeek);
 const monthStart=`${date.slice(0,7)}-01`;
 const summarize=start=>{
  const days=Math.floor((selectedDate-Date.parse(`${start}T12:00:00Z`))/86400000)+1;
  const gross=rows.filter(row=>row.day>=start&&row.day<=date).reduce((sum,row)=>sum+Number(row.gross||0),0);
  const target=dailyGoalCents*days;
  return {start,days,gross,target,remaining:Math.max(0,target-gross),progress:target?Math.min(100,Math.round(gross/target*100)):0};
 };
 return {week:summarize(weekStart.toISOString().slice(0,10)),month:summarize(monthStart)};
}
