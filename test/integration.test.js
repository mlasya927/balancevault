import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const enabled=process.env.RUN_INTEGRATION==='1';
test('API integration: idempotent retry and auditor is read-only',{skip:!enabled},async()=>{
 const base=process.env.TEST_BASE_URL||'http://localhost:4000';
 async function login(email,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(r.status,200);return (await r.json()).token}
 const token=await login('holder@ledgerline.test','HolderDemo123!');const headers={Authorization:'Bearer '+token,'content-type':'application/json'};
 const accounts=await (await fetch(base+'/api/accounts',{headers})).json();assert.ok(accounts.length);const id=accounts[0].id;const before=Number(accounts[0].balance_paise);const key=randomUUID();const body=JSON.stringify({accountId:id,amountPaise:1});
 const first=await fetch(base+'/api/money/withdraw',{method:'POST',headers:{...headers,'Idempotency-Key':key},body});const result=await first.json();const retry=await fetch(base+'/api/money/withdraw',{method:'POST',headers:{...headers,'Idempotency-Key':key},body});const replay=await retry.json();assert.equal(replay.replayed,true);
 const statement=await (await fetch(base+`/api/accounts/${id}/statement`,{headers})).json();assert.equal(Number(statement.currentBalancePaise),before-(result.ok?1:0));
 const auditor=await login('auditor@ledgerline.test','AuditorDemo123!');const denied=await fetch(base+'/api/money/withdraw',{method:'POST',headers:{Authorization:'Bearer '+auditor,'content-type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({accountId:id,amountPaise:1})});assert.equal(denied.status,403);
});
