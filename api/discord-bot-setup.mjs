import {botRuntime} from '../server/discord-bot-runtime.mjs';
import {createBotSetup} from '../server/discord-bot-setup.mjs';
import {webAlertHandler} from '../server/license-alerts.mjs';

const runtime=botRuntime(process.env);
export default {fetch:webAlertHandler(createBotSetup({...runtime,secret:process.env.DISCORD_BOT_SETUP_SECRET}))};
