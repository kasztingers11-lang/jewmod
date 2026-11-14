import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../server/store.mjs';
import {botIds} from '../server/discord-bot-api.mjs';
import {createReleasePublisher,releaseMessage} from '../server/discord-releases.mjs';

const release={version:'3.0.2',changes:['Improved targeting','Refined prediction']};
function fixture({store=new MemoryStore(),guild=botIds.guild,channelGuild=botIds.guild}={}){
  let time=1000000;
  const posts=[],requests=[];
  const api={async request(path){
    requests.push(path);
    if(path==='/channels/'+botIds.updates)return {id:botIds.updates,guild_id:channelGuild,type:0};
    if(path==='/users/@me')return {id:botIds.app};
    if(path==='/channels/'+botIds.updates+'/messages?limit=100')return posts.map(p=>({...p.message,id:p.id,author:{id:botIds.app}}));
    throw Error('Unexpected API operation');
  },async post(channel,message,nonce){assert.equal(channel,'1566228045440884868');const id=String(1570000000000000000n+BigInt(posts.length));posts.push({id,message,nonce});return {id};}};
  return {store,posts,requests,make:()=>createReleasePublisher({store,api,guildId:guild,release,now:()=>time}),advance:ms=>time+=ms};
}

test('release notes contain only two-word bullets with no mentions',()=>{
  const message=releaseMessage(release);
  assert.equal(message.embeds[0].description,'- Improved targeting\n- Refined prediction');
  assert.deepEqual(message.allowed_mentions,{parse:[]});
  for(const changes of [['one'],['three word bullet'],['@everyone hello'],['hello\nworld']])assert.throws(()=>releaseMessage({...release,changes}));
});

test('concurrent instances announce once and durable receipts survive restarts',async()=>{
  const f=fixture();await Promise.all([f.make().publish(),f.make().publish(),f.make().publish()]);
  assert.equal(f.posts.length,1);
  assert.equal((await f.make().publish()).status,'already-announced');assert.equal(f.posts.length,1);
  assert.equal((await f.store.read('discord-release-v1/3.0.2.json')).data.messageId,f.posts[0].id);
});

test('a successful Discord post with a failed receipt is recovered from message history',async()=>{
  const store=new MemoryStore(),write=store.write.bind(store);let fail=true;
  store.write=async(key,data,etag)=>{if(data.messageId&&fail){fail=false;throw Error('Synthetic storage failure');}return write(key,data,etag);};
  const f=fixture({store});await assert.rejects(f.make().publish());assert.equal(f.posts.length,1);
  assert.equal((await f.make().publish()).status,'busy');f.advance(90001);
  assert.equal((await f.make().publish()).status,'already-announced');assert.equal(f.posts.length,1);
});

test('foreign server and channel destinations fail before any message is posted',async()=>{
  for(const options of [{guild:'1570000000000000001'},{channelGuild:'1570000000000000001'}]){
    const f=fixture(options);await assert.rejects(f.make().publish());assert.equal(f.posts.length,0);
  }
});
