import {waitUntil} from '@vercel/functions';
import {botRuntime} from '../server/discord-bot-runtime.mjs';
import {createBotInteractions} from '../server/discord-bot.mjs';
import {webAlertHandler} from '../server/license-alerts.mjs';

const runtime=botRuntime(process.env);
export default {fetch:webAlertHandler(createBotInteractions({...runtime,schedule:promise=>waitUntil(promise)}))};
