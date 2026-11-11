import {createWorkspaceStore} from '../server/redis-store.mjs';
import {createLicenseAlerts,createAlertHandler,webAlertHandler} from '../server/license-alerts.mjs';
import {recordWebhookTest} from '../server/license-alert-setup.mjs';
import {countryLookup} from '../server/country-lookup.mjs';
import {botRuntime} from '../server/discord-bot-runtime.mjs';

const store=createWorkspaceStore(process.env),secret=process.env.FLOWAUTH_WEBHOOK_SECRET;
const origin=process.env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
const transport=process.env.DISCORD_BOT_ALERTS==='true'?botRuntime(process.env).logs:undefined;
const alerts=createLicenseAlerts({store,secret,origin,webhookUrl:process.env.DISCORD_SECURITY_WEBHOOK_URL,countryLookup,transport});
export default {fetch:webAlertHandler(createAlertHandler({alerts,secret,onTest:()=>recordWebhookTest(store)}))};
