import test from 'node:test';
import assert from 'node:assert/strict';
import {RedisStore,writeScript,removeScript,createRedisStore,createWorkspaceStore} from '../server/redis-store.mjs';
import {Conflict,BlobStore} from '../server/store.mjs';

test('Redis adapter preserves private records and isolates its namespace',async()=>{
  const row={data:{revision:2,profile:{name:'Private'}},etag:'test-etag'};
  const calls=[];
  const store=new RedisStore({get:async key=>{calls.push(key);return JSON.stringify(row);}});
  const value=await store.read('profile-v1/account.json');
  assert.deepEqual(value,row);value.data.profile.name='Changed';assert.equal(row.data.profile.name,'Private');
  assert.deepEqual(calls,['neoperro:store-v1:profile-v1/account.json']);
  assert.equal(await new RedisStore({get:async()=>null}).read('missing'),null);
  assert.equal(await new RedisStore({get:async()=>JSON.stringify({deleted:'owned-operation'})}).read('removed'),null);
  await assert.rejects(()=>new RedisStore({get:async()=>'{bad'}).read('bad'));
});

test('Redis writes request atomic CAS with TTL only for ephemeral records',async()=>{
  const calls=[];const store=new RedisStore({eval:async(...args)=>{calls.push(args);return 1;}},{now:()=>1000});
  const result=await store.write('panel-v1/session.json',{expires:31000,revision:0});
  const [script,keys,args]=calls[0];assert.equal(script,writeScript);
  assert.deepEqual(keys,['neoperro:store-v1:panel-v1/session.json']);assert.equal(args[0],'');assert.equal(args[3],'30000');
  assert.equal(JSON.parse(args[1]).etag,result.etag);assert.equal(args[2],result.etag);
  await store.write('profile-v1/account.json',{expires:31000,profile:{name:'Saved'}},'prior-etag');
  assert.equal(calls[1][2][0],'prior-etag');assert.equal(calls[1][2][3],'0');
  await store.write('license-v1/account.json',{kind:'license-pairing',expires:6000});assert.equal(calls[2][2][3],'5000');
  await store.write('license-v1/account.json',{kind:'license',workspace:{expires:6000}});assert.equal(calls[3][2][3],'0');
});

test('Redis CAS conflicts, deletes and endpoint validation fail closed',async()=>{
  const conflict=new RedisStore({eval:async()=>0});
  await assert.rejects(()=>conflict.write('x',{revision:0}),Conflict);
  await assert.rejects(()=>conflict.remove('x','etag'),Conflict);
  await assert.rejects(()=>conflict.remove('x'),Conflict);
  const calls=[];const store=new RedisStore({eval:async(...args)=>{calls.push(args);return 1;}});
  await store.remove('panel-v1/session.json','expected-etag');
  assert.equal(calls[0][0],removeScript);assert.equal(calls[0][2][0],'expected-etag');
  assert.equal(JSON.parse(calls[0][2][2]).deleted,calls[0][2][1]);
  for(const url of ['http://db.upstash.io','https://example.com','https://db.upstash.io/elsewhere','https://user:pass@db.upstash.io'])assert.throws(()=>createRedisStore(url,'mock-only-token'));
});

test('Production never silently falls back to the legacy archive on missing or invalid Redis settings',()=>{
  assert.equal(createWorkspaceStore({VERCEL_ENV:'production'}),null);
  assert.equal(createWorkspaceStore({KV_REST_API_URL:'https://db.upstash.io'}),null);
  assert.equal(createWorkspaceStore({KV_REST_API_TOKEN:'mock-only-token'}),null);
  assert.equal(createWorkspaceStore({VERCEL_ENV:'production',KV_REST_API_URL:'https://example.com',KV_REST_API_TOKEN:'mock-only-token'}),null);
  assert.ok(createWorkspaceStore({VERCEL_ENV:'preview'})instanceof BlobStore);
});
