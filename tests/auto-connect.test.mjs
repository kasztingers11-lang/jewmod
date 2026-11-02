import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';

const origin='https://www.fosternya.xyz',value='SYNTHETIC-TEST-LICENSE-ONLY';
const defaults=JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url))).defaults;
async function fixture(){
  let time=1793600000000;
  const store=new MemoryStore();
  const key={id:101,project_id:6147,status:'active',effective_status:'active',claimed_by:null,tier:'premium',hwidless:false,max_devices:1,hwid_bound:true,hwid_lock:{enabled:true,reset_enabled:true,reset_cooldown_ms:86400000},duration:{state:'lifetime',is_lifetime:true,evaluated_at:time}};
  const identityFetch=async url=>String(url).endsWith('/token')?Response.json({access_token:'mock-access',token_type:'Bearer',expires_in:60,scope:'identify'}):String(url).endsWith('/users/@me')?Response.json({id:'123456789012345678',username:'fixture'}):new Response(null,{status:200});
  const licenseFetch=async(url,options)=>{
    if(String(url).endsWith('/lookup')&&JSON.parse(options.body).key_value!==value)return Response.json({}, {status:404});
    if(String(url).endsWith('/claim'))key.claimed_by=JSON.parse(options.body).discord_user_id;
    return Response.json(key);
  };
  const app=createApp({store,origin,secret:'synthetic-test-secret-only-long-enough',now:()=>time,discord:{clientId:'1565654517804957776',clientSecret:'mock-only-secret'},identityFetch,licenseToken:'mock-api-key',licenseFetch});
  let cookie,csrf;
  const call=(action,method='GET',body,headers={},browser=true)=>app(new Request(origin+(action.startsWith('/')?action:'/api/panel?action='+action),{method,headers:{...(browser?{cookie:cookie??'',origin,'x-neoperro-csrf':csrf??''}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}));
  const login=await call('/api/auth/login'),location=new URL(login.headers.get('location'));
  cookie=login.headers.getSetCookie()[0].split(';')[0];
  const callback=await call('/api/auth/callback?'+new URLSearchParams({state:location.searchParams.get('state'),code:'mock-code',iss:'https://discord.com'}));
  cookie=callback.headers.getSetCookie().find(c=>c.startsWith('__Host-neoperro=')).split(';')[0];
  csrf=(await (await call('session')).json()).csrf;
  assert.equal((await call('license','POST',{key:value})).status,200);
  const connect=()=>call('runtime-connect','POST',{key:value},{},false);
  const heartbeat=token=>call('runtime','POST',{version:'1.3.40-rc.2',appliedRevision:0,rejectedRevision:0,configEnabled:true},{authorization:'Bearer '+token},false);
  return {store,key,call,connect,heartbeat,advance:n=>time+=n};
}

test('license connects to its verified Discord workspace, delivers rc versions, and never grants browser privileges',async()=>{
  const f=await fixture();const config=structuredClone(defaults);config['Web connect']=true;config['Web configs']=true;
  assert.equal((await f.call('profile','POST',{name:'Fixture',config,revision:0})).status,200);
  const response=await f.connect();assert.equal(response.status,200);const {token}=await response.json();
  const beat=await f.heartbeat(token);assert.equal(beat.status,200);assert.deepEqual((await beat.json()).config,config);
  assert.equal((await f.call('license-reveal','POST',{}, {authorization:'Bearer '+token},false)).status,401);
  const stored=JSON.stringify([...f.store.entries]);assert.ok(!stored.includes(value));assert.ok(!stored.includes(token));assert.ok(!stored.includes('mock-api-key'));
});
test('reconnect rotates tokens; revoke blocks automatic reconnection until browser explicitly enables it',async()=>{
  const f=await fixture(),a=await(await f.connect()).json(),b=await(await f.connect()).json();
  assert.equal((await f.heartbeat(a.token)).status,401);assert.equal((await f.heartbeat(b.token)).status,200);
  assert.equal((await f.call('pair','DELETE')).status,200);
  await f.call('session');assert.equal((await f.connect()).status,403);assert.equal((await f.heartbeat(b.token)).status,401);
  assert.equal((await f.call('connect-enable','POST',{})).status,200);assert.equal((await f.connect()).status,200);
});
test('bad keys, cross-site requests, identity injection, revoked licenses and logout cannot pair',async()=>{
  const f=await fixture();
  assert.equal((await f.call('runtime-connect','POST',{key:'WRONG-LICENSE-VALUE'},{},false)).status,400);
  assert.equal((await f.call('runtime-connect','POST',{key:value},{origin:'https://attacker.invalid'},false)).status,403);
  assert.equal((await f.call('runtime-connect','POST',{key:value,user:'attacker'},{},false)).status,400);
  f.key.status='revoked';assert.equal((await f.connect()).status,403);f.key.status='active';
  const {token}=await(await f.connect()).json();assert.equal((await f.call('session','DELETE')).status,200);
  assert.equal((await f.heartbeat(token)).status,401);assert.equal((await f.connect()).status,403);
});
test('absolute session expiry and per-license connection budgets are enforced',async()=>{
  const f=await fixture();for(let i=0;i<5;i++)assert.equal((await f.connect()).status,200);
  assert.equal((await f.connect()).status,429);f.advance(12*3600000+1);assert.equal((await f.connect()).status,403);
});
