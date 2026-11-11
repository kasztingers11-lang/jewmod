import {fileURLToPath} from 'node:url';

process.env.GEOIP_DATADIR=fileURLToPath(new URL('../.country-data/',import.meta.url));
let geoip;
try{geoip=(await import('geoip-country')).default;}catch{}

export const countryDataset='MaxMind GeoLite2 Country / geoip-country 5.0.202611110258';
export function countryLookup(ip){return geoip?.lookup(ip)?.country??null;}
