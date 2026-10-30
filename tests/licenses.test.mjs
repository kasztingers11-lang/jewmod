import test from 'node:test';
import assert from 'node:assert/strict';
import {createLicenseService} from '../server/licenses.mjs';
import {MemoryStore} from '../server/store.mjs';

const user={id:'123456789012345678'},other={id:'987654321098765432'},keyValue='TEST-ONLY-NOT-A-REAL-LICENSE';
function fixture(){
  let time=1793306400000;
  const store=new MemoryStore(),calls=[];
  const key={id:101,project_id:6147,status:'active',effective_status:'active',claimed_by:null,tier:'premium',paused_at:null,blacklist_id:null,hwidless:false,max_devices:1,hwid_bound:true,
    hwid_lock:{enabled:true,reset_enabled:true,reset_cooldown_ms:86400000,reset_available_at:null},duration:{state:'pending',remaining_ms:86400000,is_lifetime:false,evaluated_at:time}};
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method,body});
    if(path.endsWith('/lookup'))return Response.json(key);
    if(path.endsWith('/claim')){if(key.claimed_by&&key.claimed_by!==body.discord_user_id)return Response.json({error:'claimed'},{status:409});key.claimed_by=body.discord_user_id;key.duration.state='active';return Response.json(key);}
    if(path.endsWith('/reset-hwid')){key.hwid_bound=false;key.hwid_lock.reset_available_at=time+86400000;return Response.json(key);}
    return Response.json(key);
  };
  const service=createLicenseService({store,secret:'test-only-signing-secret-with-adequate-length',origin:'https://www.fosternya.xyz',token:'mock-account-api-token',fetcher,now:()=>time});
  return {store,key,calls,service,advance:ms=>{time+=ms;},time:()=>time};
}

test('pairing makes a permanent provider claim and stores only an authenticated encrypted key',async()=>{
  const f=fixture(),status=await f.service.link(user,keyValue);
  assert.equal(status.status,'active');assert.equal(f.key.claimed_by,user.id);
  const claim=f.calls.find(x=>x.path.endsWith('/claim'));assert.deepEqual(claim.body,{discord_user_id:user.id});
  const stored=JSON.stringify([...f.store.entries]);for(const value of [keyValue,'mock-account-api-token',user.id])assert.ok(!stored.includes(value));
  assert.deepEqual(await f.service.reveal(user),{key:keyValue});
  await assert.rejects(()=>f.service.reveal(other),/Link your license first/);
  const [path,record]=[...f.store.entries][0];record.data.ciphertext=record.data.ciphertext.slice(0,20)+'A'+record.data.ciphertext.slice(21);
  await assert.rejects(()=>f.service.reveal(user));assert.ok(path.startsWith('account-v1/'));
});

test('wrong Discord, wrong project, revoked, paused, expired and HWID-less keys are rejected before claim',async()=>{
  for(const mutate of [k=>{k.claimed_by=other.id;},k=>{k.project_id=6588;},k=>{k.effective_status='revoked';},k=>{k.paused_at=1;},k=>{k.duration.state='expired';k.duration.remaining_ms=0;},k=>{k.hwidless=true;},k=>{k.max_devices=2;},k=>{k.hwid_lock.enabled=false;}]){
    const f=fixture();mutate(f.key);await assert.rejects(()=>f.service.link(user,keyValue));
    assert.equal(f.calls.filter(x=>x.path.endsWith('/claim')).length,0);assert.equal(f.store.entries.size,0);
  }
});

test('an existing Discord claim is never reassigned and an existing account cannot replace its linked key',async()=>{
  const f=fixture();f.key.claimed_by=user.id;await f.service.link(user,keyValue);
  assert.equal(f.calls.filter(x=>x.path.endsWith('/claim')).length,0);
  f.key.id=102;await assert.rejects(()=>f.service.link(user,'ANOTHER-TEST-LICENSE'),/already has a different/);
  assert.equal(f.calls.filter(x=>x.path.endsWith('/claim')).length,0);
});

test('HWID reset enforces policy and the 24-hour cooldown on the server',async()=>{
  const f=fixture();f.key.duration.remaining_ms=3*86400000;await f.service.link(user,keyValue);const status=await f.service.reset(user);
  assert.equal(status.hwidBound,false);assert.equal(status.resetAvailableAt,f.time()+86400000);
  f.key.hwid_bound=true;await assert.rejects(()=>f.service.reset(user),/once every 24 hours/);
  assert.equal(f.calls.filter(x=>x.path.endsWith('/reset-hwid')).length,1);
  f.advance(86400001);await f.service.reset(user);assert.equal(f.calls.filter(x=>x.path.endsWith('/reset-hwid')).length,2);
  f.key.hwid_lock.reset_cooldown_ms=0;await assert.rejects(()=>f.service.reset(user),/24-hour policy/);
});

test('provider revocation is rechecked and a missing service never grants access',async()=>{
  const f=fixture();await f.service.link(user,keyValue);assert.equal((await f.service.status(user)).status,'active');
  f.key.status='revoked';f.advance(30001);assert.equal((await f.service.status(user)).status,'inactive');await assert.rejects(()=>f.service.assertActive(user));
  const unavailable=createLicenseService({store:f.store,secret:'test-only-signing-secret-with-adequate-length',origin:'https://www.fosternya.xyz'});
  assert.equal((await unavailable.status(user)).status,'unavailable');await assert.rejects(()=>unavailable.reveal(user),/not configured/);
});

test('simultaneous pairing requests are serialized before provider claims',async()=>{
  const f=fixture();
  const jobs=await Promise.allSettled([f.service.link(user,keyValue),f.service.link(user,keyValue)]);
  assert.equal(jobs.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(jobs.filter(x=>x.status==='rejected').length,1);
});

test('a cached active status cannot extend a license past its actual deadline',async()=>{
  const f=fixture();f.key.duration.remaining_ms=1000;await f.service.link(user,keyValue);
  assert.equal((await f.service.status(user)).status,'active');f.advance(1001);
  assert.equal((await f.service.status(user)).status,'inactive');await assert.rejects(()=>f.service.reveal(user),/expired/);
});
