import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectedGameProfile,macroSetting,macroDefaults,gunModificationDefaults,configForGame,functionsForGame} from '../public/game-profile.mjs';
import {validateConfig,withWebDefaults,exportLua} from '../public/config.mjs';
const defaults=JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url))).defaults;

test('fresh connected game selects its macro; stale or unknown games select neither',()=>{
  for(const profile of ['da-strike','da-uphill','da-uphill-2','da-downhill','da-hood']){
    assert.equal(connectedGameProfile({online:true,seenAt:100,gameProfile:profile},101),profile);
    assert.equal(macroSetting(profile),profile==='da-hood'?'Macro':'Macro Abuse');
  }
  for(const runtime of [{online:false,seenAt:100,gameProfile:'da-hood'},{online:true,seenAt:100,gameProfile:'unknown'},{online:true,seenAt:100,gameProfile:'da-hood'},null])assert.equal(connectedGameProfile(runtime,35100),null);
});

test('both macro profiles save independently and Lua exports include only the active game',()=>{
  const config=structuredClone(defaults);config.Misc.Macro=structuredClone(macroDefaults);
  config.Misc.Macro.Keybind[0]='V';config['Gun Modifications']=structuredClone(gunModificationDefaults);
  config.Misc['Macro Abuse'].Enabled=true;
  validateConfig(config,defaults);
  for(const profile of ['da-hood','da-strike']){
    const exported=configForGame(config,profile);validateConfig(exported,defaults);
    assert.equal(Object.hasOwn(exported.Misc,profile==='da-hood'?'Macro Abuse':'Macro'),false);
    assert.ok(exportLua(exported).includes(profile==='da-hood'?'["Macro"]':'["Macro Abuse"]'));
  }
  assert.ok(config.Misc.Macro.Keybind[0]==='V'&&config.Misc['Macro Abuse'].Enabled);
  const functions={Usp:{Close:[{path:['Misc','Macro','Keybind','0'],value:'V'},{path:['Misc','Macro Abuse','Enabled'],value:true},{path:['Intro'],value:false}]}};
  assert.deepEqual(functionsForGame(functions,'da-hood').Usp.Close.map(x=>x.path),[['Misc','Macro','Keybind','0'],['Intro']]);
  assert.equal(functions.Usp.Close.length,3);
  for(const value of [-1,1.01,NaN]){const bad=structuredClone(config);bad['Gun Modifications']['Spread Modifier']['Double-Barrel SG'].Value=value;assert.throws(()=>validateConfig(bad,defaults));}
  const bad=structuredClone(config);bad.Misc.Macro.extra=true;assert.throws(()=>validateConfig(bad,defaults));
  bad.Misc.Macro=structuredClone(macroDefaults);bad.Misc.Macro.Keybind[2]='fake';assert.throws(()=>validateConfig(bad,defaults));
});

test('old Da Hood macro controls migrate to the requested keybind-only table',()=>{
  const config=structuredClone(defaults);config.Misc.Macro={Enabled:true,Method:'First Person',Delay:0.01,Holding:true,Keybind:['V','MouseButton2','Keyboard']};
  const next=withWebDefaults(config);validateConfig(next,defaults);assert.deepEqual(next.Misc.Macro,{Keybind:['V','MouseButton2','Keyboard']});assert.equal(config.Misc.Macro.Enabled,true);
});

test('spread entries accept additional weapons and reject conflicting or unsafe blocks',()=>{
  const config=structuredClone(defaults);config['Gun Modifications']=structuredClone(gunModificationDefaults);
  const entries=config['Gun Modifications']['Spread Modifier'];entries['Custom Shotgun']={Enabled:true,Value:.4};validateConfig(config,defaults);
  assert.ok(exportLua(config).includes('["Custom Shotgun"]'));
  entries['[custom-shotgun]']={Enabled:false,Value:1};assert.throws(()=>validateConfig(config,defaults),/duplicate/);delete entries['[custom-shotgun]'];
  entries.Glock={Enabled:'true',Value:.2};assert.throws(()=>validateConfig(config,defaults));delete entries.Glock;
  const legacy=structuredClone(defaults);legacy['Gun Modifications']={'Spread Modifier':{Enabled:true,Value:.3}};
  const migrated=withWebDefaults(legacy);validateConfig(migrated,defaults);assert.equal(migrated['Gun Modifications']['Spread Modifier'].Revolver.Value,.3);
});
