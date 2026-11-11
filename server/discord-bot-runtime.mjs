import {createWorkspaceStore} from './redis-store.mjs';
import {createLicenseService} from './licenses.mjs';
import {createBotAPI,botIds} from './discord-bot-api.mjs';
import {createBotLogs} from './discord-bot-logs.mjs';
import {createTicketService} from './discord-tickets.mjs';

export function botRuntime(env){
  const store=createWorkspaceStore(env),secret=env.NEOPERRO_SESSION_SECRET;
  const guildId=env.DISCORD_BOT_GUILD_ID===botIds.guild?botIds.guild:null,ownerId=env.NEOPERRO_OWNER_DISCORD_ID;
  const origin=env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
  const api=createBotAPI({token:env.DISCORD_BOT_TOKEN});
  const logs=createBotLogs({api,token:env.DISCORD_BOT_TOKEN,guildId,ownerId});
  const tickets=store&&secret?createTicketService({store,secret,guildId,ownerId,api,ensurePrivateLogs:logs.check}):null;
  const licenses=store&&secret?createLicenseService({store,secret,origin,token:env.FLOWAUTH_API_KEY}):null;
  return {store,secret,guildId,ownerId,origin,api,logs,tickets,licenses,alertsEnabled:env.DISCORD_BOT_ALERTS==='true'};
}
