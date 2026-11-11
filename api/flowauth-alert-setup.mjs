import {createWorkspaceStore} from '../server/redis-store.mjs';
import {createLicenseAlerts,webAlertHandler} from '../server/license-alerts.mjs';
import {createAlertSetup} from '../server/license-alert-setup.mjs';
import {countryLookup} from '../server/country-lookup.mjs';

const store=createWorkspaceStore(process.env),secret=process.env.FLOWAUTH_WEBHOOK_SECRET;
const origin=process.env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
const alerts=createLicenseAlerts({store,secret,origin,webhookUrl:process.env.DISCORD_SECURITY_WEBHOOK_URL});
export default {fetch:webAlertHandler(createAlertSetup({store,secret,origin,alerts,apiToken:process.env.FLOWAUTH_API_KEY,countryReady:()=>countryLookup('8.8.8.8')==='US'}))};
