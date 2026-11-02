import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportLua,withWebDefaults,validateConfig,loaderLine} from '../public/config.mjs';

const defaults=JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url))).defaults;
test('old check names, vertical method and weapon dimensions migrate without changing their values',()=>{
  const old=structuredClone(defaults);delete old.Intro;delete old['Gun Specifications'].Ranges.Enabled;
  old.Checks.Dead=[true,false,false];old.Checks.Knocked=[false,true,false];delete old.Checks['Dead Check'];
  old.Checks.GroundShotCheck=old.Checks['Ground Shot Check'];delete old.Checks['Ground Shot Check'];
  old['Y-Axis'].Method='Auto';old['Y-Axis'].Offset=.6;
  old['Gun Specifications'].Revolver.Far.BoxSize=[5,4.5];
  const next=withWebDefaults(old);validateConfig(next,defaults);
  assert.deepEqual(next.Checks['Dead Check'],[true,true,false]);assert.equal(next['Y-Axis'].Offset,.6);
  assert.equal(next['Y-Axis'].Method,undefined);assert.deepEqual(next['Gun Specifications'].Revolver.Far.BoxSize,{Width:5,Height:4.5});
  assert.equal(next.Intro,true);assert.equal(next['Gun Specifications'].Ranges.Enabled,true);assert.equal(old['Y-Axis'].Method,'Auto');
});
test('legacy configs gain opt-in web switches at the top without changing the original settings',()=>{
  const legacy=structuredClone(defaults);delete legacy['Web connect'];delete legacy['Web configs'];
  const merged=withWebDefaults(legacy);validateConfig(merged,defaults);
  assert.deepEqual(Object.keys(merged).slice(0,3),['Intro','Web connect','Web configs']);assert.equal(merged['Web connect'],false);assert.equal(merged['Web configs'],false);
  assert.equal(Object.hasOwn(legacy,'Web connect'),false);
  const source=exportLua(legacy);
  assert.ok(source.indexOf('["Web connect"] = false;')<source.indexOf('["Silent Aim"]'));
  assert.ok(source.includes('-- Connect this client to your panel.'));assert.ok(source.includes('-- Let the panel change your settings.'));
  assert.equal(source.includes('__neoperroPanelToken'),false);assert.equal(source.split(loaderLine).length,2);
});
test('connected exports carry only the scoped token and a key placeholder and reject token injection or disabled opt-in',()=>{
  const config=structuredClone(defaults),token='SYNTHETIC_TOKEN_'+'.'.repeat(100);config['Web connect']=true;
  const source=exportLua(config,token);
  assert.ok(source.startsWith('script_key = "YOUR-SCRIPT-KEY";'));assert.ok(source.includes('getgenv().__neoperroPanelToken = "'+token+'";'));
  assert.equal(source.indexOf('__neoperroPanelToken')<source.indexOf(loaderLine),true);
  for(const value of ['short','x'.repeat(80),'x'.repeat(400),'x'.repeat(80)+'"; injected()'])assert.throws(()=>exportLua(config,value),/Invalid private/);
  assert.throws(()=>exportLua(defaults,token),/Invalid private/);
});
