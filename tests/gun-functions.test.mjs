import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFunction, parseFunction, initialGunFunctions, validateGunFunctions, exportGunScript} from '../public/gun-functions.mjs';
import {withWebDefaults} from '../public/config.mjs';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';

const defaults=JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url))).defaults;
const config=()=>withWebDefaults(defaults);

test('gun assignment functions round-trip lists, named tables, booleans and escaped text',()=>{
  const cfg=config();
  const operations=[
    {path:['Silent Aim','Prediction','Value'],value:0.135},
    {path:['Silent Aim','Prediction','Auto'],value:false},
    {path:['2d-Box','Silent Aim','Size'],value:{Height:4.3,Width:5}},
    {path:['2d-Box','Silent Aim','Color','Box','0'],value:[255,40,0]},
    {path:['Whitelist','Players'],value:["User1",12345]},
    {path:['Aim Assist','Activation','Keybind','0'],value:'Q'},
  ];
  const source=makeFunction(operations);
  assert(source.includes("['Keybind'][1]"));
  assert.deepEqual(parseFunction(source,cfg,defaults),operations);
  assert.deepEqual(parseFunction('',cfg,defaults),[]);
  assert.deepEqual(parseFunction('function() end',cfg,defaults),[]);
});

test('gun editors reject executable code, unsupported paths and invalid settings',()=>{
  const cfg=config();
  for(const source of [
    'function() request({}) end',
    'function() while true do end end',
    "function() neoperro['Silent Aim']['Prediction']['Value'] = math.huge end",
    "function() neoperro['Silent Aim']['Prediction']['Value'] = 4 end",
    "function() neoperro['__proto__']['x'] = true end",
    "function() neoperro['Web configs'] = true end",
    "function() end; request('x')",
  ])assert.throws(()=>parseFunction(source,cfg,defaults));
  assert.throws(()=>validateGunFunctions({Unknown:{Close:[]}},cfg,defaults));
  assert.throws(()=>validateGunFunctions({Revolver:{Unknown:[]}},cfg,defaults));
  assert.throws(()=>parseFunction(' '.repeat(8193),cfg,defaults));
  const many=Array.from({length:21},()=>({path:['Intro'],value:true}));
  assert.throws(()=>validateGunFunctions({Revolver:{Close:many}},cfg,defaults));
  assert.equal({}.x,undefined);
});

test('complete Lua exports include gun callbacks and keep their selected values',()=>{
  const cfg=config(),functions=initialGunFunctions(cfg);
  functions.Revolver.Close=[{path:['Silent Aim','Prediction','Value'],value:0.135}];
  const source=exportGunScript(cfg,undefined,functions);
  assert.equal((source.match(/= function\(\)/g)||[]).length,15);
  assert(source.includes("neoperro['Silent Aim']['Prediction']['Value'] = 0.135;"));
  assert(!source.includes('BoxSize'));
  assert(source.includes('YOUR-SCRIPT-KEY'));
  assert.equal(cfg['Silent Aim'].Prediction.Value,defaults['Silent Aim'].Prediction.Value);
});

test('gun functions save with the private profile and survive legacy saves',async()=>{
  const origin='https://www.fosternya.xyz';
  const app=createApp({store:new MemoryStore(),secret:'synthetic-gun-test-secret-long-enough',origin,allowPreview:true});
  let cookie,csrf;
  async function call(action,method='GET',body){
    const response=await app(new Request(origin+'/api/panel?action='+action,{method,headers:{
      origin,...(cookie?{cookie}:{}),...(csrf?{'x-neoperro-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})
    },body:body?JSON.stringify(body):undefined}));
    return {response,data:await response.json()};
  }
  const opened=await call('session','POST',{});
  cookie=opened.response.headers.get('set-cookie').split(';')[0];csrf=opened.data.csrf;
  const cfg=config(),functions=initialGunFunctions(cfg);
  functions.Revolver.Close=[{path:['Silent Aim','Prediction','Value'],value:0.135}];
  const saved=await call('profile','POST',{name:'Guns',config:cfg,revision:0,gunFunctions:functions});
  assert.equal(saved.response.status,200);
  assert.deepEqual(saved.data.profile.gunFunctions,functions);
  const legacy=await call('profile','POST',{name:'Guns',config:cfg,revision:1});
  assert.equal(legacy.response.status,200);
  assert.deepEqual(legacy.data.profile.gunFunctions,functions);
  const invalid=await call('profile','POST',{name:'Guns',config:cfg,revision:2,gunFunctions:{Revolver:{Close:[{path:['Intro'],value:'bad'}]}}});
  assert.equal(invalid.response.status,400);
  const current=await call('session');assert.equal(current.data.revision,2);
  assert.deepEqual(current.data.profile.gunFunctions,functions);
});
