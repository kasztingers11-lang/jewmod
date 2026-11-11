import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';

async function fixture() {
  let now = 1794350000000;
  const origin = 'https://www.fosternya.xyz';
  const app = createApp({store:new MemoryStore(), secret:'synthetic-signing-secret-for-tests', origin, now:()=>now, allowPreview:true});
  let cookie, csrf;
  async function call(action, method='GET', body, token) {
    const response = await app(new Request(origin+'/api/panel?action='+action, {method, headers:{
      origin, ...(cookie?{cookie}:{}), ...(csrf?{'x-neoperro-csrf':csrf}:{}),
      ...(token?{authorization:'Bearer '+token}:{}), ...(body?{'content-type':'application/json'}:{}),
    }, body:body?JSON.stringify(body):undefined}));
    return {status:response.status, data:await response.json(), response};
  }
  const browser=await call('session','POST',{});
  cookie=browser.response.headers.get('set-cookie').split(';')[0]; csrf=browser.data.csrf;
  const pair=await call('pair','POST',{});
  const send=calibration=>call('runtime','POST',{version:'2.0.0-rc.17',appliedRevision:0,rejectedRevision:0,configEnabled:false,calibration},pair.data.token);
  return {call,send,advance:ms=>{now+=ms;}};
}

const profile={smoothness:0.024,strength:0.026,minSpeed:12,fullSpeed:600,maxSpeed:300,
  curve:{enabled:false,early:0.07,middle:0.077,late:0.012}};

test('timed capture requires a connected supported client and one active command',async()=>{
  const f=await fixture();
  assert.equal((await f.call('calibration-session','POST',{duration:180})).status,409);
  await f.send({enabled:true,follow:'Mouse'});
  assert.equal((await f.call('calibration-session','POST',{duration:180})).status,409);
  f.advance(4000);await f.send({enabled:true,follow:'Mouse',timed:true});
  assert.equal((await f.call('calibration-session','POST',{duration:120})).status,400);
  const started=await f.call('calibration-session','POST',{duration:360});
  assert.equal(started.status,200);assert.match(started.data.request.id,/^[a-f0-9]{32}$/);
  assert.equal((await f.call('calibration-session','POST',{duration:180})).status,409);
  const heartbeat=await f.send({enabled:true,follow:'Mouse',timed:true});
  assert.deepEqual(heartbeat.data.calibrationSession,started.data.request);
  assert.equal(heartbeat.data.config,null);
  assert.equal((await f.call('calibration-session','DELETE',{id:'bad'})).status,409);
  assert.equal((await f.call('calibration-session','DELETE',{id:started.data.request.id})).status,200);
  assert.equal((await f.send({enabled:true,follow:'Mouse',timed:true})).data.calibrationSession.cancelled,true);
  assert.equal((await f.call('calibration-session','POST',{duration:600})).status,200);
});

test('session results are bounded and cannot be attached to a different command',async()=>{
  const f=await fixture();
  await f.send({enabled:true,follow:'Camera',timed:true});
  const started=await f.call('calibration-session','POST',{duration:180});
  const session={...started.data.request};delete session.createdAt;
  Object.assign(session,{follow:'Camera',status:'complete',elapsed:180,samples:4000,activeSeconds:150,curveSamples:0,graph:Array(60).fill(20),profile});
  f.advance(180000);
  assert.equal((await f.send({enabled:true,follow:'Camera',timed:true,session})).status,200);
  const own=await f.call('session');
  assert.deepEqual(own.data.runtime.calibration.session,session);
  assert.equal((await f.send({enabled:true,follow:'Camera',timed:true,session:{...session,samples:999999}})).status,400);
  assert.equal((await f.send({enabled:true,follow:'Camera',timed:true,session:{...session,graph:Array(60).fill(9999)}})).status,400);
  assert.equal((await f.send({enabled:true,follow:'Camera',timed:true,session:{...session,profile:{...profile,curve:{...profile.curve,early:0.4}}}})).status,400);
  f.advance(7000);
  await f.send({enabled:true,follow:'Camera',timed:true,session:{...session,id:'b'.repeat(32)}});
  assert.equal((await f.call('session')).data.runtime.calibration.session,undefined);
  f.advance(35000);
  assert.equal((await f.call('session')).data.runtime.calibration,null);
});

test('curve and result formatting preserve zero values and do not bridge graph gaps',async()=>{
  const {calibrationLua,trackingGraph}=await import('../public/dashboard-calibration.mjs');
  const snippet=calibrationLua({follow:'Mouse',profile:{...profile,curve:{enabled:false,early:0,middle:0,late:0}}});
  for(const key of ['Strength','Min Speed','Full Speed','Max Speed','Early','Middle','Late'])assert(snippet.includes("['"+key+"']"));
  assert(snippet.includes("['Enabled'] = false"));
  const graph=trackingGraph([10,-1,20,...Array(57).fill(-1)]);
  assert.equal((graph.path.match(/M/g)||[]).length,2);
});
