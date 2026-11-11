import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {MemoryStore} from '../server/store.mjs';
import {botIds,botSetupPath,BotError,createBotAPI,verifyDiscord,channelPermissions,privateLogChannel} from '../server/discord-bot-api.mjs';
import {createBotInteractions} from '../server/discord-bot.mjs';
import {createTicketService,transcriptText,ticketPermissions} from '../server/discord-tickets.mjs';
import {createBotLogs} from '../server/discord-bot-logs.mjs';
import {createBotSetup} from '../server/discord-bot-setup.mjs';
import {createLicenseAlerts} from '../server/license-alerts.mjs';

const secret='SYNTHETIC-ONLY-BOT-SECRET-32-CHARACTERS',guild='222222222222222222',owner='1220900739325362328',userId='123456789012345678',other='123456789012345679',botRole='444444444444444444',categoryId='555555555555555555';
const now=1794410000000,keys=generateKeyPairSync('ed25519');
const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let next=700000000000000000n;
const id=()=>String(++next);
async function fixture({canLock=true,publicLogs=false}={}){
  const store=new MemoryStore(),calls=[],posts=[],replies=[],uploads=[],jobs=[];
  const roles=[{id:guild,permissions:'117760'},{id:botRole,permissions:String(117776n|(canLock?268435456n:0n)),managed:true},{id:botIds.supportRole,permissions:'117760'},{id:other,permissions:'1024'}];
  const permissions=[{id:guild,type:0,allow:'0',deny:publicLogs?'0':'1024'},{id:botIds.supportRole,type:0,allow:'117760',deny:'0'}];
  const channels=new Map([botIds.panel,botIds.support,botIds.logs,categoryId].map(channel=>[channel,{id:channel,guild_id:guild,type:channel===categoryId?4:0,permission_overwrites:permissions}]));
  const app={id:botIds.app,verify_key:botIds.publicKey,bot_public:false,flags:1<<19};
  let counter=0;
  const api={
    async request(path,options={}){
      calls.push({path,method:options.method??'GET',body:options.body});
      if(path==='/applications/@me'){if(options.method==='PATCH')Object.assign(app,options.body);return app;}
      if(path==='/users/@me')return {id:botIds.app};
      if(path==='/guilds/'+guild+'/roles')return roles;
      if(path==='/guilds/'+guild+'/members/'+botIds.app)return {user:{id:botIds.app},roles:[botRole]};
      if(path==='/applications/'+botIds.app+'/guilds/'+guild+'/commands')return options.body;
      if(path==='/guilds/'+guild+'/channels'&&options.method==='POST'){const channel={...options.body,id:id(),guild_id:guild};channels.set(channel.id,channel);counter++;return channel;}
      const match=path.match(/^\/channels\/(\d+)(?:\/(.*))?$/);
      if(match){
        const channel=channels.get(match[1]);if(!channel)throw new BotError(404,'Missing channel.');
        if(!match[2]){if(options.method==='PATCH')Object.assign(channel,options.body);return channel;}
        if(match[2].startsWith('permissions/')){if(!canLock)throw new BotError(503,'The bot is missing a Discord permission for this action.');return null;}
        if(match[2].startsWith('messages?'))return posts.filter(m=>m.channel===channel.id).map(m=>({...m.message,id:m.id,author:{id:botIds.app,username:'neoperro'},timestamp:new Date(now).toISOString()})).slice(-100).reverse();
      }
      throw Error('Unexpected mock API path '+path);
    },
    async post(channel,message,nonce){const result={id:id(),channel,message:structuredClone(message),nonce};posts.push(result);return {id:result.id};},
    async edit(channel,messageId,message){const existing=posts.find(m=>m.id===messageId&&m.channel===channel);if(existing)Object.assign(existing.message,message);return {id:messageId};},
    async reply(interaction,message){replies.push({interaction:interaction.id,message:structuredClone(message)});return {};},
    async upload(channel,contents,filename,message){uploads.push({channel,contents,filename,message});return {id:id()};}
  };
  await store.write(botSetupPath,{kind:'discord-bot-setup',guildId:guild,botId:botIds.app,categoryId});
  const logs=createBotLogs({api,token:'SYNTHETIC-ONLY-TOKEN',guildId:guild});
  const tickets=createTicketService({store,secret,guildId:guild,ownerId:owner,api,ensurePrivateLogs:logs.check,now:()=>now});
  const licenseCalls=[];
  const licenses={status:async user=>{licenseCalls.push(['status',user.id]);return {status:'active',hwidBound:true,resetEnabled:true,expiresAt:null};},link:async(user,key)=>{licenseCalls.push(['link',user.id,key]);},reveal:async user=>{licenseCalls.push(['reveal',user.id]);return {key:'SYNTHETIC-ONLY-PRIVATE-KEY'};},reset:async user=>{licenseCalls.push(['reset',user.id]);return {};},ownerLicense:async value=>{licenseCalls.push(['ownerLicense',value]);return {id:value,status:'active',discordId:userId,lifetime:true};}};
  const handler=createBotInteractions({store,secret,guildId:guild,ownerId:owner,api,licenses,tickets,publicKey,schedule:p=>jobs.push(p),now:()=>now});
  const payload=(action,{type=3,user=userId,channel=botIds.panel,roles:memberRoles=[],...rest}={})=>({id:id(),application_id:botIds.app,guild_id:guild,channel_id:channel,token:'SYNTHETIC_INTERACTION_TOKEN_'.repeat(3),type,member:{user:{id:user},roles:memberRoles},data:{custom_id:action},...rest});
  const run=async p=>{const result=await invoke(handler,p);await Promise.all(jobs.splice(0));return result;};
  return {store,calls,posts,replies,uploads,jobs,api,logs,tickets,licenses,licenseCalls,handler,payload,run,roles,channels,app,channelCount:()=>counter};
}
async function invoke(handler,p,{admin=false,bad=false}={}){
  const raw=Buffer.from(JSON.stringify(p)),timestamp=String(admin?now:Math.floor(now/1000));
  const signature=admin?'sha256='+createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex'):sign(null,Buffer.concat([Buffer.from(timestamp),raw]),keys.privateKey).toString('hex');
  const req=Readable.from([raw]);req.method='POST';req.headers=admin?{'x-neoperro-setup-timestamp':timestamp,'x-neoperro-setup-signature':bad?'bad':signature}:{'x-signature-timestamp':timestamp,'x-signature-ed25519':bad?'bad':signature};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};await handler(req,res);return res;
}

test('Discord Ed25519 verifies exact bytes and freshness before any action',()=>{
  const raw=Buffer.from('{"type":1}'),ts=String(Math.floor(now/1000)),sig=sign(null,Buffer.concat([Buffer.from(ts),raw]),keys.privateKey).toString('hex');
  assert.equal(verifyDiscord(raw,ts,sig,publicKey,now),true);assert.equal(verifyDiscord(Buffer.concat([raw,Buffer.from(' ')]),ts,sig,publicKey,now),false);assert.equal(verifyDiscord(raw,ts,sig,publicKey,now+300001),false);
});

test('signed PING works, invalid signatures fail and foreign servers cannot schedule work',async()=>{
  const f=await fixture();assert.deepEqual((await f.run({type:1,application_id:botIds.app})).data,{type:1});
  assert.equal((await invoke(f.handler,f.payload('license:key'),{bad:true})).statusCode,401);
  const foreign=f.payload('license:key');foreign.guild_id=other;const result=await f.run(foreign);assert.equal(result.data.type,4);assert.equal(result.data.data.flags,64);assert.equal(f.licenseCalls.length,0);
});

test('license actions use signed Discord identity and private deferred replies',async()=>{
  const f=await fixture();const p=f.payload('license:script');const r=await f.run(p);assert.deepEqual(r.data,{type:5,data:{flags:64}});assert.deepEqual(f.licenseCalls,[['reveal',userId]]);
  assert.match(f.replies[0].message.content,/SYNTHETIC-ONLY-PRIVATE-KEY/);assert.ok(!JSON.stringify([...f.store.entries]).includes('PRIVATE-KEY'));
  await f.run(p);assert.equal(f.licenseCalls.length,1);assert.equal(f.replies.length,1);
  const modal=await f.run(f.payload('license:link'));assert.equal(modal.data.type,9);assert.equal(f.licenseCalls.length,1);
});

test('HWID reset requires the explicit confirm action and delegates policy to license service',async()=>{
  const f=await fixture();const prompt=await f.run(f.payload('license:reset'));assert.equal(prompt.data.data.flags,64);assert.equal(f.licenseCalls.length,0);
  await f.run(f.payload('license:reset-confirm'));assert.deepEqual(f.licenseCalls,[['reset',userId]]);
});

test('owner license lookup is unavailable to regular users and support roles',async()=>{
  const f=await fixture();await f.run(f.payload('owner:license:101',{roles:[botIds.supportRole]}));assert.equal(f.licenseCalls.length,0);
  await f.run(f.payload('owner:license:101',{user:owner}));assert.deepEqual(f.licenseCalls,[['ownerLicense',101]]);
});

test('ticket selector and slash command open forms without a database or slow request',async()=>{
  const f=await fixture();let p=f.payload('ticket:category');p.data.values=['bug'];const r=await f.run(p);assert.equal(r.data.type,9);assert.equal(r.data.data.custom_id,'ticket:create:bug');assert.equal(f.calls.length,0);
  p=f.payload('',{type:2});p.data={name:'ticket',options:[{name:'open'}]};assert.equal((await f.run(p)).data.type,9);
});

test('one open ticket per user uses isolated permission overwrites and no public secrets',async()=>{
  const f=await fixture(),user={id:userId,roles:[]};const input={category:'bug',title:'A test issue',description:'This is a synthetic support issue.',interactionId:id()};
  const first=await f.tickets.open(user,input),again=await f.tickets.open(user,{...input,interactionId:id()});assert.equal(first.channelId,again.channelId);assert.equal(f.channelCount(),1);
  const channel=f.channels.get(first.channelId);assert.equal(channel.permission_overwrites.find(x=>x.id===guild).deny,'1024');assert.ok(channel.permission_overwrites.some(x=>x.id===userId&&x.type===1));assert.ok(channel.permission_overwrites.some(x=>x.id===botIds.supportRole));
  await assert.rejects(()=>f.tickets.act('claim',first.channelId,{id:other,roles:[]},id()),{status:403});
  await assert.rejects(()=>f.tickets.act('claim',first.channelId,user,id()),{status:403});
});

test('staff can claim, export, close and reopen; closure preserves the channel',async()=>{
  const f=await fixture(),user={id:userId,roles:[]},staff={id:other,roles:[botIds.supportRole]};
  const ticket=await f.tickets.open(user,{category:'general',title:'A test ticket',description:'A synthetic ticket for checking the workflow.',interactionId:id()});
  await f.tickets.act('claim',ticket.channelId,staff,id());await f.tickets.act('close',ticket.channelId,user,id());assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].channel,botIds.logs);assert.ok(f.channels.has(ticket.channelId));
  let saved=(await f.store.read('discord-ticket-v1/'+ticket.channelId+'.json')).data;assert.equal(saved.status,'closed');assert.ok(saved.expires>now);
  await assert.rejects(()=>f.tickets.act('reopen',ticket.channelId,user,id()),{status:403});
  await f.tickets.act('reopen',ticket.channelId,staff,id());saved=(await f.store.read('discord-ticket-v1/'+ticket.channelId+'.json')).data;assert.equal(saved.status,'open');assert.equal(saved.expires,undefined);
});

test('failed close never claims success or deletes ticket history',async()=>{
  const f=await fixture({canLock:false});const t=await f.tickets.open({id:userId,roles:[]},{category:'general',title:'Test permissions',description:'A synthetic permission failure case.',interactionId:id()});
  await assert.rejects(()=>f.tickets.act('close',t.channelId,{id:userId,roles:[]},id()),{status:503});assert.equal((await f.store.read('discord-ticket-v1/'+t.channelId+'.json')).data.status,'open');assert.ok(f.channels.has(t.channelId));
});

test('concurrent ticket submissions cannot create two channels',async()=>{
  const f=await fixture(),input={category:'general',title:'Concurrent test',description:'A synthetic simultaneous submission.',interactionId:id()};
  const result=await Promise.allSettled([f.tickets.open({id:userId,roles:[]},input),f.tickets.open({id:userId,roles:[]},{...input,interactionId:id()})]);assert.ok(result.some(x=>x.status==='fulfilled'));assert.equal(f.channelCount(),1);
});

test('transcripts are plain text, redact recognizable secrets and do not fetch attachments',()=>{
  const transcript=transcriptText([{id:'700000000000000003',timestamp:'now',author:{id:userId,username:'Test'},content:'script_key = "PRIVATE_KEY"; https://discord.com/api/webhooks/123456789012345678/PRIVATE_TOKEN\n<script>text</script>',attachments:[{filename:'file.txt',url:'https://attacker.invalid/file'}]}],{channelId:categoryId,partial:true,at:now});
  assert.ok(transcript.includes('Partial transcript'));assert.ok(!transcript.includes('PRIVATE_KEY'));assert.ok(!transcript.includes('PRIVATE_TOKEN'));assert.ok(!transcript.includes('attacker.invalid'));assert.ok(transcript.includes('<script>text</script>'));
});

test('bot log transport rejects public channels and attaches owner-only lookup controls',async()=>{
  const unsafe=await fixture({publicLogs:true});await assert.rejects(()=>unsafe.logs.check(),{status:503});assert.equal(unsafe.posts.length,0);
  const f=await fixture();await f.logs.send({username:'neoperro',embeds:[{title:'Test'}],allowed_mentions:{parse:[]}},{licenseId:101,id:'a'.repeat(64)});const posted=f.posts[0];assert.equal(posted.channel,botIds.logs);assert.equal(posted.message.username,undefined);assert.equal(posted.message.components[0].components[0].custom_id,'owner:license:101');
});

test('permission checks include role overwrites and never exempt unrelated bot integrations',()=>{
  const roles=[{id:guild,permissions:'1024'},{id:other,permissions:'0',managed:true}];const c={permission_overwrites:[{id:guild,type:0,allow:'0',deny:'1024'},{id:other,type:0,allow:'1024',deny:'0'}]};
  assert.equal(channelPermissions(roles,{roles:[]},c,guild)&1024n,0n);assert.equal(privateLogChannel(roles,c,guild,botIds.supportRole,[]),false);
});

test('setup authentication is separate, discovers the server and creates idempotent guild panels',async()=>{
  const f=await fixture();const handler=createBotSetup({store:f.store,secret,api:f.api,origin:'https://www.fosternya.xyz',guildId:guild,ownerId:owner,tickets:f.tickets,now:()=>now});
  assert.equal((await invoke(handler,{action:'inspect'},{admin:true,bad:true})).statusCode,401);
  const inspect=await invoke(handler,{action:'inspect'},{admin:true});assert.equal(inspect.statusCode,200);assert.equal(inspect.data.guildId,guild);assert.equal(inspect.data.publicBot,false);
  assert.equal((await invoke(handler,{action:'configure'},{admin:true})).statusCode,200);const count=f.posts.length;assert.equal(count,2);
  assert.equal((await invoke(handler,{action:'configure'},{admin:true})).statusCode,200);assert.equal(f.posts.length,count);
  assert.ok(f.calls.some(x=>x.path.includes('/guilds/'+guild+'/commands')));assert.ok(!f.calls.some(x=>/^\/applications\/\d+\/commands$/.test(x.path)));
});

test('signed FlowAuth change detection can use bot delivery with no Discord webhook URL',async()=>{
  const f=await fixture();const alerts=createLicenseAlerts({store:f.store,secret,origin:'https://www.fosternya.xyz',transport:f.logs,now:()=>now});assert.equal(alerts.configured,true);
  const e=(time,executor)=>({project_id:6147,event:'script.executed',timestamp:time,data:{key_id:101,executor}});
  await alerts.receive(e(now-1,'REAL'),'first');assert.equal(f.posts.length,0);await alerts.receive(e(now,'Wave'),'next');assert.equal(f.posts.length,1);assert.equal(f.posts[0].channel,botIds.logs);
});

test('REST client keeps bot token off interaction responses and rejects arbitrary destinations',async()=>{
  const calls=[];const api=createBotAPI({token:'SYNTHETIC_ONLY_BOT_TOKEN',fetcher:async(url,opts)=>{calls.push({url,opts});return Response.json({id:id()});}});
  await api.post(botIds.logs,{content:'Synthetic test'});assert.equal(calls[0].opts.headers.authorization,'Bot SYNTHETIC_ONLY_BOT_TOKEN');
  await api.reply({id:id(),application_id:botIds.app,token:'SYNTHETIC_ONLY_INTERACTION_TOKEN_123456'},{content:'Private reply'});assert.equal(calls[1].opts.headers.authorization,undefined);
  await assert.rejects(()=>api.request('https://attacker.invalid'),{status:400});await assert.rejects(()=>api.request('/webhooks/'+botIds.app+'/SYNTHETIC_ONLY_INTERACTION_TOKEN_123456/messages/@original'),{status:400});
});
