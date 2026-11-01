import test from 'node:test';
import assert from 'node:assert/strict';
import {createLicenseService} from '../server/licenses.mjs';
import {MemoryStore} from '../server/store.mjs';

const user={id:'123456789012345678'},key='SYNTHETIC-NOT-A-REAL-KEY';
function service(response){
  const store=new MemoryStore();let calls=0;
  const license=createLicenseService({store,secret:'synthetic-test-secret-only-not-production',origin:'https://www.fosternya.xyz',token:'synthetic-account-token',fetcher:async()=>{calls++;return response();}});
  return {store,license,calls:()=>calls};
}
test('provider failures produce safe actionable messages without echoing provider content or retrying claims',async()=>{
  for(const [status,pattern] of [[401,/credential was rejected/],[403,/denied this action/],[404,/not found/],[409,/cannot be linked/],[429,/Please wait/],[500,/could not confirm/]]){
    const f=service(()=>Response.json({error:'SECRET-PROVIDER-DETAILS',key},{status}));
    await assert.rejects(()=>f.license.link(user,key),e=>pattern.test(e.message)&&!e.message.includes(key)&&!e.message.includes('SECRET-PROVIDER-DETAILS'));
    assert.equal(f.calls(),1);assert.equal(f.store.entries.size,0);
  }
});
test('malformed successful provider responses fail closed with a safe service error',async()=>{
  for(const value of [null,[],false,'invalid',{data:[]},{data:false},{data:{key:[]}}]){
    const f=service(()=>Response.json(value));
    await assert.rejects(()=>f.license.link(user,key),e=>e.status===503&&/invalid response/.test(e.message));
    assert.equal(f.calls(),1);assert.equal(f.store.entries.size,0);
  }
});
