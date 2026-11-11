import {Conflict} from './store.mjs';
import {BotError,botIds,botSetupPath,snowflake,botFail,botHash,channelPermissions,privateLogChannel} from './discord-bot-api.mjs';
import {readAlertBody,verifyFlowAuth} from './license-alerts.mjs';
import {commands,licensePanel,supportPanel,ticketButtons} from './discord-bot-views.mjs';

export function createBotSetup({store,secret,api,origin,guildId,ownerId,tickets,logs,alertsEnabled=false,now=Date.now}){
  async function update(fn){
    for(let i=0;i<5;i++){
      const row=await store.read(botSetupPath),data=row?.data??{kind:'discord-bot-setup'};const result=fn(data);
      try{await store.write(botSetupPath,data,row?.etag);return result;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    botFail(409,'Bot setup changed. Try again.');
  }
  async function inspect(){
    const [app,bot,panel,support,logs,transcriptChannel]=await Promise.all([api.request('/applications/@me'),api.request('/users/@me'),api.request('/channels/'+botIds.panel),api.request('/channels/'+botIds.support),api.request('/channels/'+botIds.logs),api.request('/channels/'+botIds.transcripts)]);
    if(app.id!==botIds.app||app.verify_key!==botIds.publicKey)botFail(503,'The bot token does not match the supplied Neoperro application and public key.');
    const allowed=panel.guild_id;
    if(!snowflake(allowed)||support.guild_id!==allowed||logs.guild_id!==allowed||transcriptChannel.guild_id!==allowed||guildId&&guildId!==allowed)botFail(503,'The configured channels do not belong to the allowed server.');
    if(![0,5].includes(panel.type)||support.type!==0||![0,5].includes(logs.type)||![0,5].includes(transcriptChannel.type))botFail(503,'Panel, support, logs and transcripts must be text channels.');
    const [roles,member]=await Promise.all([api.request('/guilds/'+allowed+'/roles'),api.request('/guilds/'+allowed+'/members/'+bot.id)]);
    if(!roles.some(r=>r.id===botIds.supportRole))botFail(503,'The support role is not in this server.');
    const saved=(await store.read(botSetupPath))?.data;
    const category=saved?.categoryId?await api.request('/channels/'+saved.categoryId):null;
    const permissions=channelPermissions(roles,member,category??support,allowed);
    return {app,bot,roles,member,allowed,category,
      public:{appId:app.id,botId:bot.id,guildId:allowed,publicBot:app.bot_public,messageContentEnabled:!!(app.flags&((1<<18)|(1<<19))),
        logsPrivate:privateLogChannel(roles,logs,allowed,botIds.supportRole,member.roles,[bot.id,ownerId]),
        transcriptsChannelId:botIds.transcripts,transcriptsPrivate:privateLogChannel(roles,transcriptChannel,allowed,botIds.supportRole,member.roles,[bot.id,ownerId]),transcriptsLastMessageId:transcriptChannel.last_message_id??null,
        categoryId:category?.id??null,canManageTickets:!!(permissions&16n),canLockTickets:!!(permissions&268435456n),
        interactionsConfigured:app.interactions_endpoint_url===origin+'/api/discord-bot',lastVerifiedPingAt:saved?.lastVerifiedPingAt??null,panelPosted:!!saved?.panelMessageId,supportPosted:!!saved?.supportMessageId,alertsViaBot:alertsEnabled}};
  }
  async function panelMessage(channelId,message,id,botId,marker,nonce){
    if(!id){
      const recent=await api.request('/channels/'+channelId+'/messages?limit=100');
      id=recent.find(m=>m.author?.id===botId&&(m.components??[]).some(r=>(r.components??[]).some(c=>c.custom_id===marker)))?.id;
    }
    if(id){await api.edit(channelId,id,message);return id;}
    const posted=await api.post(channelId,message,nonce);if(!snowflake(posted?.id))botFail(503,'Panel message could not be confirmed.');return posted.id;
  }
  async function refreshTickets(info){
    if(!info.category)return {updated:0,remaining:false};
    const channels=await api.request('/guilds/'+guildId+'/channels');
    if(!Array.isArray(channels))botFail(503,'Discord returned an invalid ticket channel list.');
    let updated=0,remaining=false;const started=now();
    for(const channel of channels.filter(c=>c.parent_id===info.category.id&&c.type===0)){
      const path='discord-ticket-v1/'+channel.id+'.json',record=await store.read(path),ticket=record?.data;
      if(ticket?.kind!=='discord-ticket'||ticket.guildId!==guildId||!['open','closed'].includes(ticket.status)||ticket.controlsVersion===2)continue;
      if(updated>=20||now()-started>20000){remaining=true;break;}
      if(ticket.lock?.until>now()){remaining=true;continue;}
      const lease=botHash(secret,'refresh-controls|'+channel.id+'|'+now()+'|'+Math.random());
      ticket.lock={id:lease,until:now()+90000};
      try{await store.write(path,ticket,record.etag);}catch(e){if(!(e instanceof Conflict))throw e;remaining=true;continue;}
      let complete=false;
      try{
      const messages=await api.request('/channels/'+channel.id+'/messages?limit=100');
      if(!Array.isArray(messages))botFail(503,'Discord returned an invalid ticket message list.');
      if(ticket.controlMessageId&&!messages.some(m=>m.id===ticket.controlMessageId)){
        try{messages.push(await api.request('/channels/'+channel.id+'/messages/'+ticket.controlMessageId));}catch(e){if(e.upstreamStatus!==404)throw e;}
      }
      for(const message of messages){
        if(message.author?.id!==info.bot.id||!message.components?.some(r=>r.components?.some(c=>['ticket:claim','ticket:close','ticket:reopen','ticket:transcript','ticket:delete'].includes(c.custom_id))))continue;
        const patch={components:ticketButtons(ticket.status==='closed')};
        if(message.id===ticket.controlMessageId&&message.embeds?.length)patch.embeds=message.embeds.map(e=>({...e,footer:{text:'Do not post private keys. Transcripts are sent only when support chooses Transcript.'}}));
        await api.edit(channel.id,message.id,patch);
      }
      complete=true;
      }finally{
        for(let attempt=0;attempt<5;attempt++){
          const latest=await store.read(path);
          if(latest?.data.lock?.id!==lease){remaining=true;break;}
          if(complete)latest.data.controlsVersion=2;
          delete latest.data.lock;
          try{await store.write(path,latest.data,latest.etag);break;}catch(e){if(!(e instanceof Conflict))throw e;if(attempt===4)remaining=true;}
        }
      }
      updated++;
    }
    return {updated,remaining};
  }
  return async(req,res)=>{
    const end=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='POST')return end(405,{error:'POST required.'});
    try{
      const raw=await readAlertBody(req,1024);
      if(!verifyFlowAuth(raw,req.headers['x-neoperro-setup-timestamp'],req.headers['x-neoperro-setup-signature'],secret,now()))return end(401,{error:'Invalid setup signature.'});
      let input;try{input=JSON.parse(raw.toString('utf8'));}catch{return end(400,{error:'Invalid JSON.'});}
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['inspect','configure','refresh-tickets','test-ticket','test-alert'].includes(input.action))return end(400,{error:'Invalid setup action.'});
      if(!store||!snowflake(ownerId))botFail(503,'Private storage or owner identity is not configured.');
      const info=await inspect();
      if(input.action==='inspect')return end(200,info.public);
      if(guildId!==info.allowed)botFail(409,'Set DISCORD_BOT_GUILD_ID to the inspected server ID and redeploy first.');
      if(input.action==='refresh-tickets')return end(200,await refreshTickets(info));
      if(input.action==='test-alert'){
        await logs.send({allowed_mentions:{parse:[]},embeds:[{title:'neoperro bot connected',description:'Setup delivery test. No license changed and no customer data is included.',color:0xff0000,timestamp:new Date(now()).toISOString()}]},{id:botHash(secret,'bot-test|'+now())});
        return end(200,{botAlertPosted:true,channelId:botIds.logs});
      }
      if(input.action==='test-ticket'){
        if(!info.public.canLockTickets)botFail(409,'Grant the bot Manage Permissions in the ticket category before the close/reopen test.');
        const interactionId=String((BigInt(now())-1420070400000n)<<22n);
        const user={id:ownerId,roles:[]};
        const ticket=await tickets.open(user,{category:'general',title:'Bot setup test',description:'Controlled setup test. No customer data is included.',interactionId});
        if(ticket.existing){
          const record=(await store.read('discord-ticket-v1/'+ticket.channelId+'.json'))?.data;
          const messages=await api.request('/channels/'+ticket.channelId+'/messages?limit=100');
          const synthetic=record?.userId===ownerId&&record.openedAt>now()-3600000&&Array.isArray(messages)&&messages.length>0&&messages.every(m=>m.author?.id===info.bot.id)&&messages.some(m=>m.embeds?.some(e=>e.title==='Bot setup test'&&e.description==='Controlled setup test. No customer data is included.'));
          if(!synthetic)return end(409,{error:'The owner already has an open ticket. It was left unchanged.',channelId:ticket.channelId});
        }
        await tickets.act('claim',ticket.channelId,user,String(BigInt(interactionId)+1n));
        await tickets.act('close',ticket.channelId,user,String(BigInt(interactionId)+2n));
        return end(200,{created:true,claimed:true,closed:true,transcriptSaved:false,channelId:ticket.channelId});
      }
      if(!info.public.logsPrivate)botFail(409,'Restrict the logs channel to staff before enabling alerts.');
      if(!info.public.transcriptsPrivate)botFail(409,'Restrict the transcripts channel to staff before enabling transcript export.');
      let saved=(await store.read(botSetupPath))?.data;
      let categoryId=saved?.categoryId;
      if(!categoryId){
        await update(data=>{if(data.categoryId){categoryId=data.categoryId;return;}if(data.creatingCategory)botFail(409,'Category creation was already attempted. Inspect Discord before retrying.');data.creatingCategory=true;});
        if(!categoryId){
          let category;
          try{category=await api.request('/guilds/'+guildId+'/channels',{method:'POST',body:{name:'neoperro tickets',type:4,permission_overwrites:[{id:guildId,type:0,allow:'0',deny:'1024'},{id:botIds.supportRole,type:0,allow:'117760',deny:'0'},{id:info.bot.id,type:1,allow:'117776',deny:'0'}]}});}
          catch(e){if([400,401,403,404,429].includes(e.upstreamStatus))await update(data=>{delete data.creatingCategory;});throw e;}
          if(!snowflake(category?.id)||category.guild_id!==guildId)botFail(503,'The ticket category could not be verified.');
          categoryId=category.id;await update(data=>{data.categoryId=categoryId;data.botId=info.bot.id;data.guildId=guildId;delete data.creatingCategory;});
        }
      }
      await api.request('/applications/'+botIds.app+'/guilds/'+guildId+'/commands',{method:'PUT',body:commands});
      await api.request('/applications/@me',{method:'PATCH',body:{interactions_endpoint_url:origin+'/api/discord-bot'}});
      saved=(await store.read(botSetupPath))?.data;
      const panelId=await panelMessage(botIds.panel,licensePanel(),saved?.panelMessageId,info.bot.id,'license:link','neoperro-license-panel');
      await update(data=>{data.panelMessageId=panelId;});
      const supportId=await panelMessage(botIds.support,supportPanel(),saved?.supportMessageId,info.bot.id,'ticket:category','neoperro-support-panel');
      await update(data=>{data.supportMessageId=supportId;data.configuredAt=now();});
      return end(200,{configured:true,guildId,categoryId,panelMessageId:panelId,supportMessageId:supportId,interactionsEndpoint:origin+'/api/discord-bot'});
    }catch(e){return end(e instanceof BotError?e.status:503,{error:e instanceof BotError?e.message:'Bot setup is temporarily unavailable.',...(e instanceof BotError&&e.operation?{operation:e.operation,upstreamStatus:e.upstreamStatus,discordCode:e.discordCode,errorFields:e.errorFields}:{})});}
  };
}
