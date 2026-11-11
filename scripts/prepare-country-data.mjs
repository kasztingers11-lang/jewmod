import {copyFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const source=resolve(dirname(require.resolve('geoip-country')),'../data');
const target=fileURLToPath(new URL('../.country-data/',import.meta.url));
mkdirSync(target,{recursive:true});
for(const file of readdirSync(source))copyFileSync(join(source,file),join(target,file));
console.log('Prepared private country database assets.');
