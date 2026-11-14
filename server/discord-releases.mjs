import {createHash,randomUUID} from 'node:crypto';
import {Conflict} from './store.mjs';
import {botIds,BotError,snowflake} from './discord-bot-api.mjs';

export function releaseMessage(release){
  if(!release||!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(release.version??'')||release.version.length>40
    ||!Array.isArray(release.changes)||release.changes.length<1||release.changes.length>16
    ||release.changes.some(line=>typeof line!=='string'||!/^[A-Za-z][A-Za-z0-9-]* [A-Za-z][A-Za-z0-9-]*$/.test(line)))throw new BotError(503,'Invalid release notes.');
  return {allowed_mentions:{parse:[]},embeds:[{title:'neoperro '+release.version,color:0xff0000,
    description:release.changes.map(line=>'- '+line).join('\n'),footer:{text:'neoperro-release:'+release.version}}]};
}

export function createReleasePublisher({store,api,guildId,release,now=Date.now}){
  const message=releaseMessage(release),marker=message.embeds[0].footer.text;
  const path='discord-release-v1/'+release.version+'.json';
  const digest=createHash('sha256').update(JSON.stringify(message)).digest('hex');
  let pending,complete;
  async function publish(){
    if(!store||guildId!==botIds.guild)throw new BotError(503,'Release posting is unavailable.');
    const lease=randomUUID();let current;
    for(let attempt=0;attempt<4;attempt++){
      const row=await store.read(path);
      if(row?.data.messageId&&row.data.channelId===botIds.updates)return {status:'already-announced',version:release.version};
      if(row?.data.until>now())return {status:'busy',version:release.version};
      current={kind:'discord-release',version:release.version,channelId:botIds.updates,digest,lease,until:now()+90000};
      try{await store.write(path,current,row?.etag);break;}catch(error){if(!(error instanceof Conflict)||attempt===3)throw error;}
    }
    async function save(messageId){
      for(let attempt=0;attempt<4;attempt++){
        const row=await store.read(path);
        if(row?.data.messageId)return;
        if(row?.data.lease!==lease)throw new BotError(503,'Release posting could not be confirmed.');
        try{await store.write(path,{...current,messageId,announcedAt:now(),until:0},row.etag);return;}
        catch(error){if(!(error instanceof Conflict)||attempt===3)throw error;}
      }
    }
    const channel=await api.request('/channels/'+botIds.updates);
    if(channel?.id!==botIds.updates||channel.guild_id!==guildId||![0,5].includes(channel.type))throw new BotError(503,'The updates channel is outside the allowed server.');
    const bot=await api.request('/users/@me');
    if(bot?.id!==botIds.app)throw new BotError(503,'The configured bot identity is incorrect.');
    const recent=await api.request('/channels/'+botIds.updates+'/messages?limit=100');
    if(!Array.isArray(recent))throw new BotError(503,'Release history could not be checked.');
    const existing=recent.find(item=>item.author?.id===bot.id&&item.embeds?.some(embed=>embed.footer?.text===marker));
    if(existing&&snowflake(existing.id)){await save(existing.id);return {status:'already-announced',version:release.version};}
    const sent=await api.post(botIds.updates,message,marker);
    if(!snowflake(sent?.id))throw new BotError(503,'Release posting could not be confirmed.');
    await save(sent.id);
    return {status:'announced',version:release.version};
  }
  return {async publish(){
    if(complete)return complete;
    if(pending)return pending;
    pending=publish().then(result=>{if(result.status!=='busy')complete=result;return result;}).finally(()=>{pending=null;});
    return pending;
  }};
}
