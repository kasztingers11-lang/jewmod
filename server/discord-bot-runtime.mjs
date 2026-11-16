import {createWorkspaceStore} from './redis-store.mjs';
import {createLicenseService} from './licenses.mjs';
import {createBotAPI,botIds} from './discord-bot-api.mjs';
import {createBotLogs} from './discord-bot-logs.mjs';
import {createTicketService} from './discord-tickets.mjs';
import {createGameRegistryService} from './game-registry.mjs';
import {commands} from './discord-bot-views.mjs';

export function botRuntime(env){
  const store=createWorkspaceStore(env),secret=env.NEOPERRO_SESSION_SECRET;
  const guildId=env.DISCORD_BOT_GUILD_ID===botIds.guild?botIds.guild:null,ownerId=env.NEOPERRO_OWNER_DISCORD_ID;
  const origin=env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
  const api=createBotAPI({token:env.DISCORD_BOT_TOKEN});
  const logs=createBotLogs({api,token:env.DISCORD_BOT_TOKEN,guildId,ownerId});
  const transcripts=createBotLogs({api,token:env.DISCORD_BOT_TOKEN,guildId,ownerId,channelId:botIds.transcripts,label:'transcripts'});
  const tickets=store&&secret?createTicketService({store,secret,guildId,ownerId,api,ensurePrivateTranscripts:transcripts.check}):null;
  const licenses=store&&secret?createLicenseService({store,secret,origin,token:env.FLOWAUTH_API_KEY}):null;
  const gameRegistry=createGameRegistryService({token:env.NEOPERRO_GAME_REGISTRY_TOKEN});
  async function onOwnerAction(){
    if(!store||guildId!==botIds.guild)return;
    const path='discord-bot-v1/game-command.json',saved=await store.read(path);
    if(saved?.data.version===1&&saved.data.guildId===guildId)return;
    const command=commands.find(item=>item.name==='gameid');
    const result=await api.request('/applications/'+botIds.app+'/guilds/'+guildId+'/commands',{method:'POST',body:command});
    if(result?.name==='gameid')await store.write(path,{version:1,guildId},saved?.etag);
  }
  return {store,secret,guildId,ownerId,origin,api,logs,transcripts,tickets,licenses,gameRegistry,onOwnerAction,alertsEnabled:env.DISCORD_BOT_ALERTS==='true'};
}
