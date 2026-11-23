import assert from 'node:assert/strict';

const headers = {'Content-Type':'application/json','Cookie':'__Host-ride_session=local-productivity-test'};
async function req(path, method='GET', body) {
  const response = await fetch(`http://127.0.0.1:8787/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {status:response.status,data:await response.json()};
}

const year = 2070 + crypto.getRandomValues(new Uint16Array(1))[0] % 20;
const day = `${year}-06-15`;
const followingDay = `${year}-06-16`;
const id = crypto.randomUUID();
const legacyId = crypto.randomUUID();
const before = (await req(`/dashboard?date=${day}`)).data;
const ride = {clientId:id,occurredAt:`${day}T12:00`,establishment:'Teste pagamentos',amount:17.5,paid:false};

assert.equal((await req('/rides','POST',ride)).status,201);
let dashboard = (await req(`/dashboard?date=${day}`)).data;
assert.equal(dashboard.grossCents,1750);
assert.equal(dashboard.paidCents,0);
assert.equal(dashboard.pendingPaymentCents,1750);
assert.equal(dashboard.netCents,before.carryCents,'Unpaid rides must not increase the cash balance.');
assert.equal((await req(`/dashboard?date=${day}`)).data.rides.find(item=>item.id===id).paid,0);
assert.equal((await req(`/rides/${id}/payment`,'PATCH',{paid:1})).status,400);
assert.equal((await req(`/rides/${id}/payment`,'PATCH',{paid:true})).status,200);
dashboard = (await req(`/dashboard?date=${day}`)).data;
assert.equal(dashboard.paidCents,1750);
assert.equal(dashboard.pendingPaymentCents,0);
assert.equal(dashboard.netCents,before.carryCents+1750);
assert.equal((await req(`/dashboard?date=${followingDay}`)).data.carryCents,Math.min(0,before.carryCents+1750));

assert.equal((await req(`/rides/${id}/payment`,'PATCH',{paid:false})).status,200);
dashboard = (await req(`/dashboard?date=${day}`)).data;
assert.equal(dashboard.paidCents,0);
assert.equal(dashboard.pendingPaymentCents,1750);
assert.equal(dashboard.netCents,before.carryCents);
assert.equal((await req(`/dashboard?date=${followingDay}`)).data.carryCents,Math.min(0,before.carryCents));
assert.equal((await req('/rides','POST',{clientId:legacyId,occurredAt:`${day}T13:00`,establishment:'Compatibilidade',amount:1})).status,201);
const rides=(await req('/rides')).data.results;
assert.equal(rides.find(item=>item.id===legacyId).paid,1,'Older clients that omit payment status retain the prior paid behavior.');
await req(`/rides/${id}`,'DELETE');
await req(`/rides/${legacyId}`,'DELETE');
console.log('OK: payment status validation, pending and received balances, carryover and older client compatibility.');
