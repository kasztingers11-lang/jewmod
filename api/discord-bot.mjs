import {waitUntil} from '@vercel/functions';
import {botRuntime} from '../server/discord-bot-runtime.mjs';
import {createBotInteractions} from '../server/discord-bot.mjs';
import {webAlertHandler} from '../server/license-alerts.mjs';
import {botSetupPath} from '../server/discord-bot-api.mjs';
import {Conflict} from '../server/store.mjs';

const runtime=botRuntime(process.env);
async function onPing(){
  if(!runtime.store)return;
  for(let i=0;i<4;i++){
    const row=await runtime.store.read(botSetupPath),data=row?.data??{kind:'discord-bot-setup'};data.lastVerifiedPingAt=Date.now();
    try{await runtime.store.write(botSetupPath,data,row?.etag);return;}catch(e){if(!(e instanceof Conflict))throw e;}
  }
}
export default {fetch:webAlertHandler(createBotInteractions({...runtime,onPing,schedule:promise=>waitUntil(promise)}))};
