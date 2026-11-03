import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionRows,collectionRoute,providerJson} from '../server/provider-format.mjs';

test('provider collection parsing supports arrays and nested pages but rejects unrelated objects',()=>{
  const rows=[{id:101}];
  for(const value of [rows,{keys:rows},{data:rows},{data:{items:rows}},{data:{records:rows}},{results:rows}])assert.deepEqual(collectionRows(value,'keys'),rows);
  assert.equal(collectionRows({unexpected:{id:101}},'keys'),null);
  assert.equal(collectionRows({data:{data:{data:{data:{data:{data:rows}}}}}},'keys'),null);
});

test('provider routes remain on the fixed project and reject unadvertised or external destinations',()=>{
  assert.equal(collectionRoute({operations:[{method:'get',path:'/v1/projects/{projectId}/keys'}]},'keys',6147),'/v1/projects/6147/keys');
  assert.equal(collectionRoute({paths:{'/v1/logs':{get:{parameters:[{in:'query',name:'project_id'}]}}}},'logs',6147),'/v1/logs?project_id=6147');
  for(const path of ['https://attacker.invalid/v1/logs','/v1/logs','/v1/projects/7/logs','/v1/projects/{project_id}/logs/../../secrets'])assert.equal(collectionRoute({operations:[{method:'GET',path}]},'logs',6147),null);
  assert.equal(collectionRoute({operations:[{method:'POST',path:'/v1/projects/{project_id}/logs'}]},'logs',6147),null);
});

test('provider JSON is bounded even without a content-length header',async()=>{
  assert.deepEqual(await providerJson(Response.json({keys:[]}),64),{keys:[]});
  await assert.rejects(providerJson(new Response('x'.repeat(100)),32),/too large/);
  await assert.rejects(providerJson(new Response('{}',{headers:{'content-length':'100'}}),32),/too large/);
});
