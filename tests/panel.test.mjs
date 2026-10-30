import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createApp}from'../server/app.mjs';
import {MemoryStore,BlobStore}from'../server/store.mjs';
import {BlobPreconditionFailedError}from'@vercel/blob';
import {validateConfig,exportLua}from'../public/config.mjs';

const defaults=JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url))).defaults;
function fixture(){
  let time=1793306400000;const store=new MemoryStore(),origin='https://www.fosternya.xyz';
  const app=createApp({store,secret:'test-only-signing-secret-with-adequate-length',origin,now:()=>time});
  const call=async(action,{method='GET',cookie,csrf,bearer,body,headers={}}={})=>{
    const h={...headers};if(cookie)h.cookie=cookie;if(csrf)h['x-neoperro-csrf']=csrf;if(bearer)h.authorization='Bearer '+bearer;
    if(method!=='GET'){h.origin??=origin;h['content-type']??='application/json';}
    const res=await app(new Request(origin+'/api/panel?action='+action,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}));
    return {res,data:await res.json()};
  };
  const start=async()=>{const r=await call('session',{method:'POST',body:{}});assert.equal(r.res.status,201);return{cookie:r.res.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf,...r};};
  return{app,call,start,store,advance:ms=>{time+=ms;}};
}
test('session cookie is host-only, HttpOnly, Secure, SameSite Strict and absolute 12h',async()=>{
  const f=fixture(),s=await f.start(),cookie=s.res.headers.get('set-cookie');
  for(const value of ['__Host-neoperro=','HttpOnly','Secure','SameSite=Strict','Max-Age=43200','Path=/'])assert.ok(cookie.includes(value));
  assert.ok(!cookie.includes('Domain='));f.advance(6*3600000);
  const reuse=await f.call('session',{method:'POST',body:{},cookie:s.cookie});assert.equal(reuse.data.expiresAt,s.data.expiresAt);assert.equal(reuse.res.headers.get('set-cookie'),null);
  f.advance(6*3600000);assert.equal((await f.call('session',{cookie:s.cookie})).res.status,401);
});
test('tampered cookie, CSRF, cross-origin and cross-site requests fail',async()=>{
  const f=fixture(),s=await f.start();
  assert.equal((await f.call('session',{cookie:s.cookie+'x'})).res.status,401);
  assert.equal((await f.call('pair',{method:'POST',cookie:s.cookie,body:{}})).res.status,403);
  assert.equal((await f.call('pair',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{},headers:{origin:'https://evil.example'}})).res.status,403);
  assert.equal((await f.call('session',{method:'POST',body:{},headers:{origin:'https://evil.example'}})).res.status,403);
  assert.equal((await f.call('session',{cookie:s.cookie,headers:{'sec-fetch-site':'cross-site'}})).res.status,403);
});
test('single profile is isolated and concurrent stale revisions cannot overwrite it',async()=>{
  const f=fixture(),a=await f.start(),b=await f.start();
  const payload={name:'My profile',config:structuredClone(defaults),revision:0};
  const save=()=>f.call('profile',{method:'POST',cookie:a.cookie,csrf:a.csrf,body:payload});
  const results=await Promise.all([save(),save()]);assert.deepEqual(results.map(x=>x.res.status).sort(),[200,409]);
  assert.equal((await f.call('session',{cookie:b.cookie})).data.profile,null);
  const own=(await f.call('session',{cookie:a.cookie})).data;assert.equal(own.revision,1);assert.equal(own.profile.name,'My profile');
  const next=await f.call('profile',{method:'POST',cookie:a.cookie,csrf:a.csrf,body:{...payload,name:'Replace the same slot',revision:1}});
  assert.equal(next.data.revision,2);assert.equal(f.store.entries.size,2);
});
test('settings reject arbitrary code, unknown fields, prototype pollution, non-finite values and oversized payloads',async()=>{
  const f=fixture(),s=await f.start();
  const save=config=>f.call('profile',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{config,name:'Test',revision:0}});
  assert.equal((await save('loadstring("code")()')).res.status,400);
  const extra=structuredClone(defaults);extra['script_key']='not-a-real-key';assert.equal((await save(extra)).res.status,400);
  const polluted=JSON.parse(JSON.stringify(defaults).slice(0,-1)+',"__proto__":{"polluted":true}}');assert.equal((await save(polluted)).res.status,400);assert.equal({}.polluted,undefined);
  const bad=structuredClone(defaults);bad['Silent Aim'].Prediction.Value=Infinity;assert.throws(()=>validateConfig(bad,defaults));
  assert.equal((await save({...defaults,extra:'x'.repeat(66000)})).res.status,413);
});
test('pair, deliver, apply acknowledgment, rejection, revocation and expiry are distinct',async()=>{
  const f=fixture(),s=await f.start();
  await f.call('profile',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{config:defaults,name:'Test',revision:0}});
  const pair=await f.call('pair',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{}}),token=pair.data.token;
  assert.ok(token.length>80);
  const payload={version:'1.3.38',game:'Da Strike',appliedRevision:0,rejectedRevision:0,errorCode:null};
  const poll=body=>f.call('runtime',{method:'POST',bearer:token,body:{...payload,...body}});
  assert.equal((await poll({appliedRevision:1})).res.status,400);
  const first=await poll({});assert.deepEqual(first.data.config,defaults);
  let state=(await f.call('session',{cookie:s.cookie})).data;assert.equal(state.runtime.deliveredRevision,1);assert.equal(state.runtime.appliedRevision,0);assert.equal(state.stats.executions,1);
  f.advance(16000);await poll({appliedRevision:1});state=(await f.call('session',{cookie:s.cookie})).data;
  assert.equal(state.runtime.appliedRevision,1);assert.equal(state.stats.executions,1);assert.equal(state.stats.games['Da Strike'],16);
  assert.equal((await poll({appliedRevision:1})).data.config,null);
  await f.call('profile',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{config:defaults,name:'Test',revision:1}});
  assert.equal((await poll({appliedRevision:1})).data.revision,2);
  await poll({appliedRevision:1,rejectedRevision:2,errorCode:'apply-failed'});
  assert.equal((await poll({appliedRevision:1,rejectedRevision:2})).data.config,null);
  const visible=(await f.call('session',{cookie:s.cookie})).data;assert.ok(!JSON.stringify(visible).includes(token));assert.ok(!JSON.stringify(visible).includes('tokenHash'));
  await f.call('pair',{method:'DELETE',cookie:s.cookie,csrf:s.csrf});assert.equal((await poll({})).res.status,401);
});
test('re-pairing and logout revoke existing runtime credentials',async()=>{
  const f=fixture(),s=await f.start();const pair=()=>f.call('pair',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:{}});
  const a=await pair(),b=await pair(),body={version:'1.3.38',game:'Other',appliedRevision:0,rejectedRevision:0};
  assert.equal((await f.call('runtime',{method:'POST',bearer:a.data.token,body})).res.status,401);
  assert.equal((await f.call('runtime',{method:'POST',bearer:b.data.token,body})).res.status,200);
  const logout=await f.call('session',{method:'DELETE',cookie:s.cookie,csrf:s.csrf});assert.ok(logout.res.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await f.call('runtime',{method:'POST',bearer:b.data.token,body})).res.status,401);assert.equal(f.store.entries.size,0);
});
test('request rate is bounded and unavailable service fails closed',async()=>{
  const f=fixture();for(let i=0;i<8;i++)await f.start();assert.equal((await f.call('session',{method:'POST',body:{}})).res.status,429);
  const app=createApp({store:new MemoryStore(),secret:undefined});const r=await app(new Request('https://www.fosternya.xyz/api/panel'));assert.equal(r.status,503);
});
test('Lua export is settings-only, escapes strings and uses the unchanged website loader',()=>{
  validateConfig(defaults,defaults);const text=exportLua(defaults);assert.ok(text.includes('YOUR-SCRIPT-KEY'));assert.ok(text.endsWith('loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()\n'));assert.ok(!text.includes('flowauth.net'));
});
test('compressed private reads cannot turn strong storage versions into unusable weak ETags',async()=>{
  let record={config:'x'.repeat(20000)},version=1;
  const tag=()=>`"version-${version}"`;
  const store=new BlobStore({
    get:async(_,options)=>({stream:new Response(JSON.stringify(record)).body,blob:{etag:options.headers?.['Accept-Encoding']==='identity'?tag():'W/'+tag()}}),
    put:async(_,data,options)=>{if(options.ifMatch!==tag())throw new BlobPreconditionFailedError();record=JSON.parse(data);version++;},
    del:async(_,options)=>{if(options.ifMatch!==tag())throw new BlobPreconditionFailedError();record=null;}
  });
  const first=await store.read('workspace');first.data.paired=true;await store.write('workspace',first.data,first.etag);
  const second=await store.read('workspace');assert.equal(second.data.paired,true);
  second.data.acknowledged=1;await store.write('workspace',second.data,second.etag);
  await assert.rejects(store.write('workspace',{},second.etag));
  const latest=await store.read('workspace');await store.remove('workspace',latest.etag);assert.equal(record,null);
});
