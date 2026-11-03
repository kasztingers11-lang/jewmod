import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';
import {createOwnerService,executionView} from '../server/owner.mjs';

const ownerId='1220900739325362328',buyerId='123456789012345678',origin='https://www.fosternya.xyz';
async function fixture({owner=true,contract=true,format='wrapped',openapi=false,global=false}={}){
  let time=1793707200000,userId=owner?ownerId:buyerId;
  const calls=[],store=new MemoryStore();
  const key={id:101,project_id:6147,status:'active',effective_status:'active',claimed_by:buyerId,tier:'premium',hwidless:false,max_devices:1,hwid_bound:true,hwid_lock:{enabled:true,reset_enabled:true,reset_cooldown_ms:86400000},duration:{state:'lifetime',is_lifetime:true,evaluated_at:time}};
  const logs=[{project_id:6147,key_id:101,created_at:time-10000,event:'authorized',hwid:'raw-device-A',country_code:'PL',executor:'Executor A',ip:'203.0.113.42',key_value:'NEVER-SHOW-THIS-KEY'},
    {project_id:6147,key_id:101,created_at:time,event:'authorized',hwid:'raw-device-B',country_code:'DE',executor:'Executor B'},
    {project_id:6147,key_id:999,created_at:time,hwid:'unrelated-device',country_code:'US'},
    {project_id:7,key_id:101,created_at:time,hwid:'other-project-device'}];
  const licenseFetch=async(url,options)=>{
    const path=new URL(url).pathname;calls.push({path,method:options.method});
    if(path==='/v1/automation')return Response.json(openapi?{paths:Object.fromEntries(['keys','logs'].map(name=>[global?'/v1/'+name:'/v1/projects/{projectId}/'+name,{get:{parameters:global?[{in:'query',name:'project_id'}]:[]}}]))}:{operations:contract?['keys','logs'].map(name=>({id:name+'.list',method:'GET',path:'/v1/projects/{project_id}/'+name})):[]});
    const wrap=(rows,name)=>format==='array'?rows:format==='nested'?{data:{records:rows}}:{[name]:rows};
    if(path==='/v1/projects/6147/logs'||path==='/v1/logs')return Response.json(wrap(logs,'logs'));
    if(path==='/v1/projects/6147/keys'||path==='/v1/keys')return Response.json(wrap([{...key,key_value:'NEVER-SHOW-THIS-KEY'},{...key,id:102,project_id:7}],'keys'));
    if(path==='/v1/projects/6147/keys/lookup')return Response.json(key);
    if(path==='/v1/keys/101/reset-hwid'){key.hwid_bound=false;key.hwid_lock.reset_available_at=time+86400000;return Response.json(key);}
    if(path==='/v1/keys/101')return Response.json(key);
    if(path==='/v1/keys/102')return Response.json({...key,id:102,project_id:7});
    throw Error('Unexpected provider path '+path);
  };
  const identityFetch=async url=>String(url).endsWith('/token')?Response.json({access_token:'mock-only-access',token_type:'Bearer',expires_in:60,scope:'identify'}):String(url).endsWith('/users/@me')?Response.json({id:userId,username:'synthetic',global_name:'Test Account'}):new Response(null,{status:200});
  const app=createApp({store,secret:'mock-only-owner-tests-secret-32-characters',origin,now:()=>time,discord:{clientId:'1565654517804957776',clientSecret:'synthetic-only'},identityFetch,licenseToken:'synthetic-only-api-token',licenseFetch,ownerId});
  let cookie,csrf;
  const call=(action,{method='GET',body,headers={},anonymous=false}={})=>app(new Request(origin+'/api/panel?action='+action,{method,headers:{...(cookie&&!anonymous?{cookie}:{}),...(method!=='GET'?{origin,'content-type':'application/json','x-neoperro-csrf':csrf??''}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)}));
  async function login(id){
    userId=id;const start=await app(new Request(origin+'/api/auth/login')),url=new URL(start.headers.get('location'));
    const end=await app(new Request(origin+'/api/auth/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'mock',iss:'https://discord.com'}),{headers:{cookie:start.headers.getSetCookie()[0].split(';')[0]}}));
    cookie=end.headers.getSetCookie().find(x=>x.startsWith('__Host-neoperro=')).split(';')[0];csrf=(await(await call('session')).json()).csrf;
  }
  await login(userId);
  return {call,store,calls,key,logs,login,advance:ms=>time+=ms};
}

test('owner endpoints require verified owner identity, valid session, origin and CSRF',async()=>{
  const f=await fixture({owner:false});
  for(const action of ['owner-state','owner-licenses','owner-contract','owner-feed'])assert.equal((await f.call(action)).status,403);
  for(const action of ['owner-license','owner-logs','owner-command','owner-announcement'])assert.equal((await f.call(action,{method:'POST',body:{}})).status,403);
  assert.equal((await f.call('owner-state',{anonymous:true})).status,401);
  await f.login(ownerId);
  assert.equal((await f.call('owner-state')).status,200);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:{},headers:{'x-neoperro-csrf':'wrong'}})).status,403);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:{},headers:{origin:'https://attacker.invalid'}})).status,403);
  f.advance(12*3600000+1);assert.equal((await f.call('owner-state')).status,401);
});

test('announcements publish as plain data, survive fresh sessions, expire and reject stale writes',async()=>{
  const f=await fixture();
  assert.deepEqual(await(await f.call('announcements',{anonymous:true})).json(),{revision:0,announcement:null});
  const input={revision:0,enabled:true,message:'Update ready <script>not executable</script>',hours:1};
  assert.equal((await f.call('owner-announcement',{method:'POST',body:input})).status,200);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:input})).status,409);
  const publicState=await(await f.call('announcements',{anonymous:true})).json();
  assert.equal(publicState.announcement.message,input.message);assert.equal(JSON.stringify(publicState).includes(ownerId),false);
  await f.login(ownerId);const state=await(await f.call('owner-state')).json();assert.equal(state.audit.length,1);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:{...input,revision:1,message:'x'.repeat(241)}})).status,400);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:{...input,revision:1,hours:-1}})).status,400);
  f.advance(3600001);assert.equal((await(await f.call('announcements',{anonymous:true})).json()).announcement,null);
  assert.equal((await f.call('owner-announcement',{method:'POST',body:{revision:1,enabled:false,message:'',hours:null}})).status,200);
});

test('project license views and execution changes redact secrets and unrelated licenses',async()=>{
  const f=await fixture();
  const detail=await(await f.call('owner-license',{method:'POST',body:{licenseId:101}})).json();assert.equal(detail.id,101);
  const list=await(await f.call('owner-licenses')).json();assert.equal(list.licenses.length,1);
  const response=await f.call('owner-logs',{method:'POST',body:{licenseId:101}});assert.equal(response.status,200);
  const view=await response.json();assert.equal(view.events.length,2);assert.deepEqual(view.events[0].changes,['device','country','executor']);
  const output=JSON.stringify({detail,list,view});
  for(const secret of ['NEVER-SHOW-THIS-KEY','raw-device','unrelated-device','other-project-device'])assert.ok(!output.includes(secret));
  assert.equal(view.events[1].ip,'203.0.113.42');
  assert.equal((await f.call('owner-license',{method:'POST',body:{licenseId:102}})).status,403);
  assert.equal((await f.call('owner-license',{method:'POST',body:{licenseId:'https://attacker.invalid'}})).status,400);
  assert.equal((await f.call('owner-command',{method:'POST',body:{licenseId:101,command:'arbitrary-url'}})).status,400);
});

test('unadvertised provider endpoints fail closed without guessed requests',async()=>{
  const f=await fixture({contract:false});
  assert.equal((await f.call('owner-licenses')).status,503);
  assert.equal((await f.call('owner-logs',{method:'POST',body:{licenseId:101}})).status,503);
  assert.equal(f.calls.some(row=>row.path.endsWith('/logs')||row.path==='/v1/projects/6147/keys'),false);
});

test('web access block cannot be removed by relinking and reset respects provider cooldown',async()=>{
  const f=await fixture({owner:false});
  assert.equal((await f.call('license',{method:'POST',body:{key:'SYNTHETIC-ONLY-TEST-KEY'}})).status,200);
  await f.login(ownerId);
  const command=command=>f.call('owner-command',{method:'POST',body:{licenseId:101,command}});
  assert.equal((await command('block-web')).status,200);
  const state=await(await f.call('owner-state')).json();assert.equal(state.audit.at(-1).action,'block-web');
  await f.login(buyerId);
  assert.equal((await f.call('license',{method:'POST',body:{key:'SYNTHETIC-ONLY-TEST-KEY'}})).status,403);
  assert.equal((await f.call('runtime-connect',{method:'POST',body:{key:'SYNTHETIC-ONLY-TEST-KEY'},anonymous:true})).status,403);
  await f.login(ownerId);assert.equal((await command('unblock-web')).status,200);
  f.key.hwid_lock.reset_available_at=1793707200000+86400000;assert.equal((await command('reset-hwid')).status,429);
  f.key.hwid_lock.reset_available_at=null;assert.equal((await command('reset-hwid')).status,200);
  assert.equal(f.calls.filter(row=>row.path.endsWith('/reset-hwid')).length,1);
});

test('owner disconnect invalidates an existing runtime token, not just future bootstrap',async()=>{
  const f=await fixture({owner:false});
  await f.call('license',{method:'POST',body:{key:'SYNTHETIC-ONLY-TEST-KEY'}});
  const connected=await(await f.call('runtime-connect',{method:'POST',body:{key:'SYNTHETIC-ONLY-TEST-KEY'},anonymous:true})).json();
  const heartbeat=()=>f.call('runtime',{method:'POST',body:{version:'2.0.0-rc.2',appliedRevision:0,rejectedRevision:0},headers:{authorization:'Bearer '+connected.token},anonymous:true});
  assert.equal((await heartbeat()).status,200);
  await f.login(ownerId);
  assert.equal((await f.call('owner-command',{method:'POST',body:{licenseId:101,command:'disconnect-web'}})).status,200);
  assert.equal((await heartbeat()).status,401);
});

test('administration audit is bounded, pruned and excludes private command payloads',async()=>{
  const store=new MemoryStore();let time=1793707200000;
  const owner=createOwnerService({store,secret:'synthetic-only-secret',origin,now:()=>time});
  for(let i=0;i<105;i++)await owner.audit({id:ownerId},'disconnect-web',101);
  assert.equal((await owner.state()).audit.length,100);
  time+=31*86400000;assert.equal((await owner.state()).audit.length,0);
  await owner.audit({id:ownerId},'block-web',101);assert.equal((await owner.state()).audit.length,1);
  assert.ok(JSON.stringify([...store.entries]).length<1000);
});

test('missing execution fields never create a fabricated change or leak a raw identifier',()=>{
  const result=executionView([{key_id:101,created_at:100,hwid:'A'},{key_id:101,created_at:200,country_code:'PL'},{key_id:101,created_at:300,hwid:'A',country_code:'PL'},{key_id:101,created_at:'invalid',hwid:'B'}],{secret:'synthetic-only',licenseId:101});
  assert.equal(result.length,3);assert.ok(result.every(row=>row.changes.length===0));
});

test('owner lookup accepts a private key and string ID without returning the key',async()=>{
  const f=await fixture();
  for(const licenseId of ['SYNTHETIC-ONLY-PRIVATE-KEY','101']){
    const response=await f.call('owner-license',{method:'POST',body:{licenseId}});assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.id,101);assert.ok(!JSON.stringify(result).includes('PRIVATE-KEY'));
  }
  assert.ok(!JSON.stringify([...f.store.entries]).includes('PRIVATE-KEY'));
});

test('owner collections accept array and nested pagination formats under advertised scoped contracts',async()=>{
  for(const format of ['array','nested'])for(const global of [false,true]){
    const f=await fixture({format,global,openapi:true});
    const list=await f.call('owner-licenses');assert.equal(list.status,200);assert.equal((await list.json()).licenses.length,1);
    const records=await f.call('owner-logs',{method:'POST',body:{licenseId:101}});assert.equal(records.status,200);assert.equal((await records.json()).events.length,2);
  }
});

test('owner execution feed is bounded, stable, cached briefly and never public',async()=>{
  const f=await fixture();
  const first=await(await f.call('owner-feed')).json();assert.ok(first.events.length>0);assert.equal(first.pollSeconds,20);
  const second=await(await f.call('owner-feed')).json();assert.deepEqual(first.events.map(x=>x.id),second.events.map(x=>x.id));
  assert.equal(f.calls.filter(row=>row.path.endsWith('/logs')).length,1);
  f.advance(10001);await f.call('owner-feed');assert.equal(f.calls.filter(row=>row.path.endsWith('/logs')).length,2);
  assert.equal((await f.call('owner-feed',{anonymous:true})).status,401);
  await f.login(buyerId);assert.equal((await f.call('owner-feed')).status,403);
});

test('all-license change detection does not compare devices from different licenses',()=>{
  const result=executionView([{key_id:101,created_at:100,hwid:'A'},{key_id:999,created_at:200,hwid:'B'},{key_id:101,created_at:300,hwid:'A'},{key_id:101,created_at:400,hwid:'A',ip:'203.0.113.1'},{key_id:101,created_at:500,hwid:'A',ip:'203.0.113.2'}],{secret:'synthetic-only'});
  assert.deepEqual(result[0].changes,['ip']);assert.ok(result.slice(1).every(row=>!row.changes.length));
});
