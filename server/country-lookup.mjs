import geoip from 'geoip-country';

export const countryDataset='MaxMind GeoLite2 Country / geoip-country 5.0.202611110258';
export function countryLookup(ip){return geoip.lookup(ip)?.country??null;}
