import {Conflict} from './store.mjs';
import {botIds,botSetupPath,botHash,botFail,snowflake,text,escapeText,silent} from './discord-bot-api.mjs';
import {ticketButtons} from './discord-bot-views.mjs';

const day=86400000,view=1024n,send=2048n,history=65536n,attach=32768n;
const readWrite=view|send|history|attach;
export const ticketPermissions=(guildId,botId,userId,ownerId,closed=false)=>[
  {id:guildId,type:0,allow:'0',deny:String(view)},
  {id:botIds.supportRole,type:0,allow:String(readWrite),deny:'0'},
  {id:botId,type:1,allow:String(readWrite|16384n),deny:'0'},
  ...(ownerId&&ownerId!==userId&&ownerId!==botId?[{id:ownerId,type:1,allow:String(readWrite),deny:'0'}]:[]),
  {id:userId,type:1,allow:String(closed?view|history:readWrite),deny:closed?String(send|attach):'0'}
];

export function transcriptText(messages,{channelId,partial=false,at=Date.now()}){
  const redact=value=>text(value).replace(/\bscript_key\s*=\s*(["'])[^\r\n]*?\1/gi,'script_key="[redacted]"').replace(/https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi,'[webhook URL redacted]');
  const lines=['neoperro support transcript','Ticket: '+channelId,'Generated: '+new Date(at).toISOString(),partial?'Partial transcript: the most recent messages are included. Earlier history remains in the ticket.':'Messages available at export time.',''];
  const ordered=[...messages].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
  for(const m of ordered){
    const author=text(m.author?.global_name??m.author?.username??'Unknown user').replace(/[\r\n]/g,' ');
    lines.push('['+String(m.timestamp??'')+'] '+author+' ('+String(m.author?.id??'unknown')+')');
    if(m.content)lines.push(redact(m.content));
    for(const embed of (m.embeds??[]).slice(0,10)){
      if(embed.title)lines.push(redact(embed.title));if(embed.description)lines.push(redact(embed.description));
      for(const field of (embed.fields??[]).slice(0,25))lines.push(redact(field.name)+': '+redact(field.value));
    }
    for(const file of (m.attachments??[]).slice(0,10)){
      let url;try{url=new URL(file.url);}catch{continue;}
      if(url.protocol==='https:'&&['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)&&url.pathname.startsWith('/attachments/'))lines.push('Attachment: '+text(file.filename).replace(/[\r\n]/g,' ')+' '+url.href);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function createTicketService({store,secret,guildId,ownerId,api,now=Date.now,ensurePrivateTranscripts=async()=>{}}){
  const ticketPath=id=>'discord-ticket-v1/'+id+'.json';
  const indexPath=id=>'discord-ticket-index-v1/'+botHash(secret,guildId+'|'+id)+'.json';
  const staff=user=>user.id===ownerId||user.roles?.includes(botIds.supportRole);
  async function update(path,fn){
    for(let i=0;i<5;i++){
      const row=await store.read(path),data=row?.data??{};const result=fn(data);
      try{await store.write(path,data,row?.etag);return result;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    botFail(409,'This ticket changed. Try again.');
  }
  async function get(channelId,user){
    if(!snowflake(channelId))botFail(400,'Open this action inside a ticket.');
    const row=await store.read(ticketPath(channelId)),ticket=row?.data;
    if(!ticket||ticket.kind!=='discord-ticket'||ticket.guildId!==guildId||ticket.channelId!==channelId)botFail(404,'This is not a Neoperro ticket.');
    if(['deleted','removed'].includes(ticket.status))botFail(404,'This ticket has already been deleted.');
    if(user.id!==ticket.userId&&!staff(user))botFail(403,'This ticket belongs to another user.');
    return ticket;
  }
  async function lock(channelId,user){
    await get(channelId,user);
    const id=botHash(secret,'ticket-lock|'+channelId+'|'+now()+'|'+Math.random());
    const ticket=await update(ticketPath(channelId),data=>{
      if(data.lock?.until>now())botFail(409,'Another ticket action is running. Try again shortly.');
      data.lock={id,until:now()+90000};return structuredClone(data);
    });return {ticket,id};
  }
  async function unlock(channelId,id,fn=()=>{}){await update(ticketPath(channelId),data=>{if(data.lock?.id!==id)botFail(409,'This ticket action expired. Try again.');fn(data);delete data.lock;});}
  async function exportTranscript(ticket,nonce){
    await ensurePrivateTranscripts();
    const messages=[];let before,partial=false,bytes=0;const started=now();
    for(let page=0;page<10;page++){
      const rows=await api.request('/channels/'+ticket.channelId+'/messages?limit=100'+(before?'&before='+before:''));
      if(!Array.isArray(rows))botFail(503,'Discord returned an invalid message history.');
      for(const m of rows){if(!snowflake(m?.id))continue;bytes+=JSON.stringify(m).length;if(bytes>1800000){partial=true;break;}messages.push(m);}
      if(bytes>1800000)break;
      if(rows.length<100)break;
      before=rows.at(-1)?.id;
      if(page===9||now()-started>12000){partial=true;break;}
    }
    const content=transcriptText(messages,{channelId:ticket.channelId,partial,at:now()});
    const result=await api.upload(botIds.transcripts,content,'neoperro-ticket-'+ticket.channelId+'.txt',{embeds:[{title:'Ticket transcript',color:0xff0000,description:'Ticket <#'+ticket.channelId+'>\nOpened by ||'+ticket.userId+'||'+(partial?'\nPartial export; earlier history remains in the ticket.':''),timestamp:new Date(now()).toISOString()}]},nonce);
    if(!snowflake(result?.id))botFail(503,'The transcript upload could not be confirmed.');
    return result.id;
  }
  return {
    async open(user,{category,title,description,interactionId}){
      if(!snowflake(user.id)||!snowflake(interactionId)||!['general','license','bug'].includes(category)||typeof title!=='string'||title.trim().length<3||title.length>80||typeof description!=='string'||description.trim().length<10||description.length>1500)botFail(400,'Use a short title and describe the issue in 10–1500 characters.');
      const setup=(await store.read(botSetupPath))?.data;
      if(setup?.guildId!==guildId||!snowflake(setup.categoryId)||!snowflake(setup.botId))botFail(503,'Ticket setup is not complete yet.');
      const path=indexPath(user.id);
      for(let attempt=0;attempt<2;attempt++){
        const existing=await update(path,data=>{
          if(data.openChannelId)return data.openChannelId;
          if(data.creating)botFail(409,'Your ticket creation is being confirmed. Please contact support if it does not appear.');
          data.kind='discord-ticket-index';data.creating=interactionId;data.startedAt=now();delete data.expires;return null;
        });
        if(!existing)break;
        try{
          const channel=await api.request('/channels/'+existing);
          if(channel.guild_id!==guildId)botFail(403,'The saved ticket belongs to a different server.');
          return {channelId:existing,existing:true};
        }catch(e){
          if(e.upstreamStatus!==404||e.discordCode!==10003)throw e;
          await update(path,data=>{if(data.openChannelId===existing)delete data.openChannelId;});
          await update(ticketPath(existing),data=>{if(data.userId===user.id&&data.guildId===guildId){data.status='removed';data.removedAt=now();data.expires=now()+90*day;}});
          if(attempt===1)botFail(409,'Your ticket list changed. Try opening the ticket again.');
        }
      }
      let channel;
      try{
        channel=await api.request('/guilds/'+guildId+'/channels',{method:'POST',body:{name:'ticket-'+interactionId.slice(-8),type:0,parent_id:setup.categoryId,topic:'neoperro support ticket',permission_overwrites:ticketPermissions(guildId,setup.botId,user.id,ownerId)}});
        if(!snowflake(channel?.id)||channel.guild_id!==guildId)botFail(503,'Ticket creation could not be verified.');
        await store.write(ticketPath(channel.id),{kind:'discord-ticket',guildId,channelId:channel.id,userId:user.id,category,openedAt:now(),status:'open',claimedBy:null});
        await update(path,data=>{data.openChannelId=channel.id;delete data.creating;});
        const first=await api.post(channel.id,{content:'<@'+user.id+'> · <@&'+botIds.supportRole+'>',allowed_mentions:{parse:[],users:[user.id],roles:[botIds.supportRole]},embeds:[{title:escapeText(title.trim()),description:escapeText(description.trim()),color:0xff0000,fields:[{name:'Category',value:category}],footer:{text:'Do not post private keys. Transcripts are sent only when support chooses Transcript.'}}],components:ticketButtons()},interactionId);
        await update(ticketPath(channel.id),data=>{data.controlMessageId=first.id;data.controlsVersion=2;});
        return {channelId:channel.id,existing:false};
      }catch(e){
        if(!channel&&[400,401,403,404,429].includes(e.upstreamStatus))await update(path,data=>{delete data.creating;data.expires=now()+day;});
        throw e;
      }
    },
    async act(action,channelId,user,nonce,{beforeDelete=async()=>{}}={}){
      const {ticket,id}=await lock(channelId,user);
      try{
        if(['claim','reopen','transcript','delete'].includes(action)&&!staff(user))botFail(403,'Only the support team can use this action.');
        if(action==='delete'){
          const channel=await api.request('/channels/'+channelId);
          if(channel.guild_id!==guildId||channel.type!==0)botFail(403,'This channel is outside the allowed ticket server.');
          await beforeDelete();
          await api.request('/channels/'+channelId,{method:'DELETE'});
          await unlock(channelId,id,data=>{data.status='deleted';data.deletedAt=now();data.deletedBy=user.id;data.expires=now()+90*day;});
          await update(indexPath(ticket.userId),data=>{if(data.openChannelId===channelId)delete data.openChannelId;data.expires=now()+90*day;});
          return 'Ticket deleted. No transcript was created.';
        }
        if(action==='claim'){
          if(ticket.status!=='open')botFail(409,'Reopen this ticket before claiming it.');
          if(ticket.claimedBy&&ticket.claimedBy!==user.id)botFail(409,'This ticket is already claimed by another support member.');
          await api.post(channelId,{content:'Support member <@'+user.id+'> claimed this ticket.'},nonce);
          await unlock(channelId,id,data=>{data.claimedBy=user.id;});return 'Ticket claimed.';
        }
        if(action==='transcript'){
          const transcriptId=await exportTranscript(ticket,nonce);await unlock(channelId,id,data=>{data.transcriptId=transcriptId;data.transcriptAt=now();});return 'Transcript saved to the private transcripts channel.';
        }
        if(action==='close'){
          if(ticket.status==='closed'){await unlock(channelId,id);return 'This ticket is already closed.';}
          const setup=(await store.read(botSetupPath)).data;
          const {id:unused,...overwrite}=ticketPermissions(guildId,setup.botId,ticket.userId,ownerId,true).at(-1);
          await api.request('/channels/'+channelId+'/permissions/'+ticket.userId,{method:'PUT',body:overwrite});
          await api.request('/channels/'+channelId,{method:'PATCH',body:{name:'closed-'+channelId.slice(-8)}});
          await api.post(channelId,{content:'Ticket closed. Support can reopen or delete it. Use Transcript separately if you want to save a copy.',components:ticketButtons(true)},nonce);
          if(ticket.controlMessageId)await api.edit(channelId,ticket.controlMessageId,{components:ticketButtons(true)});
          await unlock(channelId,id,data=>{data.status='closed';data.closedAt=now();data.closedBy=user.id;data.expires=now()+90*day;});
          await update(indexPath(ticket.userId),data=>{if(data.openChannelId===channelId)delete data.openChannelId;data.expires=now()+90*day;});
          return 'Ticket closed. No transcript was created.';
        }
        if(action==='reopen'){
          if(ticket.status!=='closed')botFail(409,'This ticket is already open.');
          const setup=(await store.read(botSetupPath)).data;
          await update(indexPath(ticket.userId),data=>{if(data.openChannelId&&data.openChannelId!==channelId||data.creating)botFail(409,'This user already has another open ticket.');data.openChannelId=channelId;delete data.expires;});
          const {id:unused,...overwrite}=ticketPermissions(guildId,setup.botId,ticket.userId,ownerId,false).at(-1);
          await api.request('/channels/'+channelId+'/permissions/'+ticket.userId,{method:'PUT',body:overwrite});
          await api.request('/channels/'+channelId,{method:'PATCH',body:{name:'ticket-'+channelId.slice(-8)}});
          await api.post(channelId,{content:'Ticket reopened.',components:ticketButtons()},nonce);
          if(ticket.controlMessageId)await api.edit(channelId,ticket.controlMessageId,{components:ticketButtons()});
          await unlock(channelId,id,data=>{data.status='open';delete data.closedAt;delete data.expires;});return 'Ticket reopened.';
        }
        botFail(400,'Unsupported ticket action.');
      }catch(e){try{await unlock(channelId,id);}catch{}throw e;}
    }
  };
}
