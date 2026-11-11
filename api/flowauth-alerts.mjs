import {createWorkspaceStore} from '../server/redis-store.mjs';
import {createLicenseAlerts,createAlertHandler,webAlertHandler} from '../server/license-alerts.mjs';
import {recordWebhookTest} from '../server/license-alert-setup.mjs';
import {countryLookup} from '../server/country-lookup.mjs';

const store=createWorkspaceStore(process.env),secret=process.env.FLOWAUTH_WEBHOOK_SECRET;
const origin=process.env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
const alerts=createLicenseAlerts({store,secret,origin,webhookUrl:process.env.DISCORD_SECURITY_WEBHOOK_URL,countryLookup});
export default {fetch:webAlertHandler(createAlertHandler({alerts,secret,onTest:()=>recordWebhookTest(store)}))};
