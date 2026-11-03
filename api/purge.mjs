import { timingSafeEqual } from 'node:crypto';

export default async function handler(req,res) {
  const expected='Bearer '+(process.env.CRON_SECRET||'');
  const actual=req.headers.authorization||'';
  if(!process.env.CRON_SECRET||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){res.statusCode=401;res.end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({expiry:'redis-ttl',legacy:'preserved'}));
}
