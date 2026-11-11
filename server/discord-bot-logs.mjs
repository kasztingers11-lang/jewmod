import {botIds,botFail,snowflake,privateLogChannel} from './discord-bot-api.mjs';
import {row} from './discord-bot-views.mjs';

export function createBotLogs({api,token,guildId,ownerId,channelId=botIds.logs,label='logs'}){
  const configured=typeof token==='string'&&token.length>0&&snowflake(guildId)&&snowflake(channelId);
  async function check(){
    if(!configured)botFail(503,'The bot log destination is not configured.');
    const [channel,roles,bot]=await Promise.all([api.request('/channels/'+channelId),api.request('/guilds/'+guildId+'/roles'),api.request('/users/@me')]);
    if(channel.guild_id!==guildId||!Array.isArray(roles))botFail(503,'The log channel is outside the allowed server.');
    const member=await api.request('/guilds/'+guildId+'/members/'+bot.id);
    if(!privateLogChannel(roles,channel,guildId,botIds.supportRole,member.roles,[bot.id,ownerId]))botFail(503,'Make the '+label+' channel private to staff before sending data.');
    return true;
  }
  return {configured,check,
    async send(message,alert){
      await check();const {username,...body}=message;
      if(Number.isSafeInteger(alert?.licenseId)&&alert.licenseId>0)body.components=[row([{type:2,style:2,label:'License details · owner',custom_id:'owner:license:'+alert.licenseId}])];
      await api.post(channelId,body,alert?.id?.slice(0,25));return new Response(null,{status:204});
    }
  };
}
