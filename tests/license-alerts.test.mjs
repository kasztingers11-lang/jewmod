import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {MemoryStore} from '../server/store.mjs';
import {createLicenseAlerts,createAlertHandler,verifyFlowAuth,discordWebhook,normalizeAlert,webAlertHandler} from '../server/license-alerts.mjs';
import {createAlertSetup,recordWebhookTest} from '../server/license-alert-setup.mjs';
import {countryLookup} from '../server/country-lookup.mjs';

const secret='synthetic-only-webhook-secret-32-characters';
const origin='https://www.fosternya.xyz';
const destination='https://discord.com/api/webhooks/123456789012345678/'+('SYNTHETIC_ONLY_'.repeat(5));
const start=1794396000000;
const event=(at,data={},type='script.executed')=>({event:type,timestamp:at,project_id:6147,data:{key_id:101,player_id:12345678,player_name:'Test Player',...data}});
function fixture(){
  let time=start,status=200;const messages=[],store=new MemoryStore();
  const fetcher=async(url,options)=>{assert.equal(url,destination+'?wait=true');assert.equal(options.redirect,'error');messages.push(JSON.parse(options.body));return new Response(null,{status});};
  const alerts=createLicenseAlerts({store,secret,origin,webhookUrl:destination,countryLookup:ip=>ip==='203.0.113.1'?'PL':ip==='203.0.113.2'?'DE':null,fetcher,now:()=>time});
  return {alerts,messages,store,advance:ms=>time+=ms,setStatus:n=>status=n,now:()=>time};
}
function sign(body,time=start){const raw=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body)),timestamp=String(time);return {raw,timestamp,signature:'sha256='+createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex')};}
async function call(handler,{body,headers={},method='POST',time=start,parsed=false}={}){
  const signed=sign(body,time),req=Readable.from([signed.raw]);req.method=method;
  req.headers={'content-type':'application/json','x-flowauth-signature':signed.signature,'x-flowauth-timestamp':signed.timestamp,'x-flowauth-delivery':'test-delivery','x-flowauth-event':body?.event,...headers};
  if(parsed)req.body=body;
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};
  await handler(req,res);return res;
}

test('signature verification binds exact bytes, timestamp and secret',()=>{
  const s=sign(event(start));assert.equal(verifyFlowAuth(s.raw,s.timestamp,s.signature,secret,start),true);
  for(const [raw,timestamp,signature,key,now]of [[Buffer.concat([s.raw,Buffer.from(' ')]),s.timestamp,s.signature,secret,start],[s.raw,s.timestamp,s.signature,'x'.repeat(32),start],[s.raw,s.timestamp,s.signature,secret,start+300001],[s.raw,s.timestamp,s.signature.toUpperCase(),secret,start],[s.raw,['bad'],s.signature,secret,start],[{},s.timestamp,s.signature,secret,start]])assert.equal(verifyFlowAuth(raw,timestamp,signature,key,now),false);
});

test('destination is a Discord webhook only, without redirects or alternate hosts',()=>{
  assert.ok(discordWebhook(destination)?.endsWith('?wait=true'));
  for(const url of ['http://discord.com/api/webhooks/1/x',destination+'?x=y',destination+'#x',destination.replace('discord.com','discord.com.attacker.invalid'),destination.replace('discord.com','localhost'),'https://discord.com@attacker.invalid/path'])assert.equal(discordWebhook(url),null);
});

test('first successful run silently establishes each license baseline',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{hwid:'raw-device-A',ip:'203.0.113.1',executor:'REAL'}),'a');
  assert.equal(f.messages.length,0);
  await f.alerts.receive(event(start+1,{hwid:'different-raw-device',ip:'203.0.113.2',executor:'Wave',key_id:202}),'b');assert.equal(f.messages.length,0);
  await f.alerts.receive(event(start+2,{hwid:'raw-device-A',ip:'203.0.113.1',executor:'real'}),'c');assert.equal(f.messages.length,0);
  const saved=JSON.stringify([...f.store.entries]);assert.ok(!saved.includes('raw-device'));assert.ok(!saved.includes('SYNTHETIC_ONLY_'));
});

test('alerts contain all statuses, old to new changes, hidden IDs and UTC time',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{hwid:'raw-A',ip:'203.0.113.1',executor:'REAL'}),'a');
  await f.alerts.receive(event(start+1,{hwid:'raw-B',ip:'203.0.113.2',executor:'Wave',key_value:'DO-NOT-LEAK-KEY',claimed_by:'123456789012345678'}),'b');
  assert.equal(f.messages.length,1);const msg=f.messages[0],embed=msg.embeds[0];
  assert.deepEqual(msg.allowed_mentions,{parse:[]});
  assert.ok(embed.fields[0].value.includes('||101||'));assert.ok(embed.fields[0].value.includes('||12345678||'));
  for(const name of ['HWID','IP address','Approximate country','Executor'])assert.ok(embed.fields.find(x=>x.name===name).value.startsWith('❌ — '));
  assert.equal(embed.fields.find(x=>x.name==='IP address').value,'❌ — 203.0.113.1 → 203.0.113.2');
  assert.ok(embed.fields.find(x=>x.name==='Time (UTC)').value.endsWith('Z'));
  assert.ok(!JSON.stringify(msg).includes('raw-A'));assert.ok(!JSON.stringify(msg).includes('raw-B'));assert.ok(!JSON.stringify(msg).includes('DO-NOT-LEAK-KEY'));
  await f.alerts.receive(event(start+2,{hwid:'raw-B',ip:'203.0.113.2',executor:'Volt'}),'c');
  const next=f.messages[1].embeds[0];assert.ok(next.fields.find(x=>x.name==='HWID').value.startsWith('✅'));
  assert.ok(next.fields.find(x=>x.name==='Executor').value.startsWith('❌'));
});

test('missing values never erase baselines or fabricate a country',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{hwid:'A',ip:'203.0.113.1'}),'a');
  await f.alerts.receive(event(start+1,{hwid:null,ip:'not-an-ip',executor:'REAL',country:'Poland'}),'b');assert.equal(f.messages.length,0);
  await f.alerts.receive(event(start+2,{executor:'Wave'}),'c');
  const msg=f.messages[0].embeds[0];assert.equal(msg.fields.find(x=>x.name==='IP address').value,'✅ — 203.0.113.1 (last observed)');
  assert.ok(!JSON.stringify(msg).includes('PO'));
  const unknown=normalizeAlert(event(start,{executor:'REAL'}),{secret,now:start});assert.equal(unknown.country,null);
});

test('stale events, duplicate delivery IDs and replayed bodies do not duplicate alerts',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{executor:'REAL'}),'a');const changed=event(start+5,{executor:'Wave'});
  await f.alerts.receive(changed,'b');await f.alerts.receive(changed,'b');await f.alerts.receive(changed,'changed-delivery-header');
  await f.alerts.receive(event(start+1,{executor:'Old'}),'old');assert.equal(f.messages.length,1);
  await assert.rejects(()=>f.alerts.receive(event(start+6,{executor:'Altered'}),'b'),{status:409});
});

test('HWID resets alert without execution, retain known values and deduplicate',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{hwid:'A',ip:'203.0.113.1',executor:'REAL'}),'a');
  const reset=event(start+1,{forced:false},'key.hwid_reset');await f.alerts.receive(reset,'reset');await f.alerts.receive(reset,'reset-again');
  assert.equal(f.messages.length,1);assert.equal(f.messages[0].embeds[0].title,'HWID reset');
  assert.ok(f.messages[0].embeds[0].fields.find(x=>x.name==='HWID').value.endsWith('→ Binding reset'));
  assert.equal(f.messages[0].embeds[0].fields.find(x=>x.name==='Reset').value,'Player reset');
  await f.alerts.receive(event(start+2,{hwid:'B',ip:'203.0.113.1',executor:'REAL'}),'new');assert.equal(f.messages.length,2);
  assert.ok(f.messages[1].embeds[0].fields.find(x=>x.name==='HWID').value.startsWith('❌'));
});

test('HWID mismatch attempts alert once per device combination without replacing successful baseline',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{hwid:'A',executor:'REAL'}),'a');
  for(let i=1;i<4;i++)await f.alerts.receive(event(start+i,{hwid:'B',reason:'hwid_mismatch'},'auth.failed'),'reject'+i);
  assert.equal(f.messages.length,1);assert.match(f.messages[0].embeds[0].title,/run rejected/);
  await f.alerts.receive(event(start+10,{hwid:'A',executor:'REAL'}),'success');assert.equal(f.messages.length,1);
  await f.alerts.receive(event(start+11,{hwid:'C',reason:'invalid_key'},'auth.failed'),'other');assert.equal(f.messages.length,1);
});

test('failed Discord deliveries remain pending and retries recover without recreating alerts',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{executor:'REAL'}),'a');f.setStatus(500);
  const next=event(start+1,{executor:'Wave'});await assert.rejects(()=>f.alerts.receive(next,'b'),{status:503});
  const state=[...f.store.entries.values()][0].data;assert.equal(state.pending.length,1);
  f.setStatus(200);f.advance(10000);await f.alerts.receive(next,'b');assert.equal([...f.store.entries.values()][0].data.pending.length,0);
  await f.alerts.receive(next,'b');assert.equal(f.messages.length,2);
});

test('concurrent deliveries serialize baseline changes and one sender holds the outbox lease',async()=>{
  const f=fixture();await f.alerts.receive(event(start,{executor:'REAL'}),'a');const next=event(start+1,{executor:'Wave'});
  const results=await Promise.allSettled([f.alerts.receive(next,'b'),f.alerts.receive(next,'b')]);
  assert.ok(results.some(x=>x.status==='fulfilled'));
  assert.equal(f.messages.length,1);await f.alerts.receive(next,'b');assert.equal(f.messages.length,1);
});

test('country lookup is offline for IPv4, IPv6 and private addresses',()=>{
  assert.equal(countryLookup('8.8.8.8'),'US');assert.equal(countryLookup('2001:4860:4860::8888'),'US');assert.equal(countryLookup('192.168.1.1'),null);
  const v6=normalizeAlert(event(start,{ip:'2001:4860:4860:0:0:0:0:8888'}),{secret,countryLookup,now:start});assert.equal(v6.ip,'2001:4860:4860::8888');assert.equal(v6.country,'US');
  const mapped=normalizeAlert(event(start,{ip:'::ffff:8.8.8.8'}),{secret,countryLookup,now:start});assert.equal(mapped.ip,'8.8.8.8');assert.equal(mapped.country,'US');
});

test('receiver authenticates before parsing, enforces project and never trusts an already-parsed body',async()=>{
  const f=fixture();const handler=createAlertHandler({alerts:f.alerts,secret,now:f.now});const body=event(start,{executor:'REAL'});
  assert.equal((await call(handler,{body})).statusCode,200);
  assert.equal((await call(handler,{body,method:'GET'})).statusCode,405);
  assert.equal((await call(handler,{body,headers:{'x-flowauth-signature':'sha256='+'0'.repeat(64)}})).statusCode,401);
  assert.equal((await call(handler,{body,headers:{'x-flowauth-event':'key.hwid_reset'}})).statusCode,400);
  assert.equal((await call(handler,{body:{...body,project_id:77}})).statusCode,400);
  assert.equal((await call(handler,{body,parsed:true})).statusCode,400);
  assert.equal((await call(handler,{body,headers:{'content-type':'text/plain'}})).statusCode,415);
  assert.equal((await call(handler,{body:{...body,padding:'a'.repeat(33000)}})).statusCode,413);
  assert.equal(f.messages.length,0);
});

test('official provider test records receipt without sending an activity alert',async()=>{
  const f=fixture();const handler=createAlertHandler({alerts:f.alerts,secret,now:f.now,onTest:()=>recordWebhookTest(f.store,f.now)});
  const r=await call(handler,{body:{event:'webhook.test',timestamp:start,project_id:6147,data:{}}});assert.equal(r.statusCode,200);assert.equal(r.data.test,true);
  assert.equal((await f.store.read('license-alert-setup-v1/6147.json')).data.testReceivedAt,start);assert.equal(f.messages.length,0);
});

test('native Web Request adapter preserves exact JSON bytes including whitespace',async()=>{
  const f=fixture(),handler=webAlertHandler(createAlertHandler({alerts:f.alerts,secret,now:f.now}));
  const e=event(start,{executor:'REAL'}),s=sign(Buffer.from(JSON.stringify(e,null,2)));
  const request=new Request(origin+'/api/flowauth-alerts',{method:'POST',headers:{'content-type':'application/json','x-flowauth-timestamp':s.timestamp,'x-flowauth-signature':s.signature,'x-flowauth-delivery':'native-request','x-flowauth-event':e.event},body:s.raw});
  const result=await handler(request);assert.equal(result.status,200);assert.equal((await result.json()).accepted,true);assert.equal(f.messages.length,0);
});

test('setup is authenticated, fixed to this project and receiver, and creates once',async()=>{
  const f=fixture(),calls=[];
  const handler=createAlertSetup({store:f.store,secret,origin,apiToken:'MOCK-ONLY',alerts:f.alerts,now:f.now,fetcher:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return Response.json({webhook:{id:81}});}});
  const setup=action=>{const body={action},s=sign(body);return call(handler,{body,headers:{'x-neoperro-setup-timestamp':s.timestamp,'x-neoperro-setup-signature':s.signature}});};
  assert.equal((await call(handler,{body:{action:'configure'}})).statusCode,401);
  assert.equal((await setup('configure')).statusCode,200);assert.equal((await setup('configure')).statusCode,200);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://flowauth.net/v1/projects/6147/webhooks');assert.equal(calls[0].body.url,origin+'/api/flowauth-alerts');assert.equal(calls[0].body.signing_secret,secret);
  assert.deepEqual(calls[0].body.events,['script.executed','key.hwid_reset','auth.failed']);
  assert.equal((await setup('test')).statusCode,200);assert.equal(calls[1].url,'https://flowauth.net/v1/webhooks/81/test');
  const status=await setup('status');assert.equal(status.data.webhookId,81);assert.ok(!JSON.stringify(status.data).includes(secret));
});

test('ambiguous registration never creates a second webhook automatically',async()=>{
  const f=fixture();let calls=0;const handler=createAlertSetup({store:f.store,secret,origin,apiToken:'MOCK-ONLY',alerts:f.alerts,now:f.now,fetcher:async()=>{calls++;throw Error('DO-NOT-PRINT-TOKEN');}});
  const body={action:'configure'},s=sign(body),options={body,headers:{'x-neoperro-setup-timestamp':s.timestamp,'x-neoperro-setup-signature':s.signature}};
  const first=await call(handler,options);assert.equal(first.statusCode,503);assert.ok(!JSON.stringify(first.data).includes('DO-NOT-PRINT'));
  assert.equal((await call(handler,options)).statusCode,409);assert.equal(calls,1);
});
