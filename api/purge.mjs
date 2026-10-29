import { list, del } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

export default async function handler(req,res) {
  const expected='Bearer '+(process.env.CRON_SECRET||'');
  const actual=req.headers.authorization||'';
  if(!process.env.CRON_SECRET||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){res.statusCode=401;res.end();return;}
  let cursor,deleted=0;
  const now=Date.now();
  for(let page=0;page<10;page++){
    const result=await list({prefix:'panel-v1/',limit:1000,cursor});
    const expired=result.blobs.filter(blob=>/^panel-v1\/\d{13}-[A-Za-z0-9_-]{43}\.json$/.test(blob.pathname)&&Number(blob.pathname.slice(9,22))<=now);
    if(expired.length){await del(expired.map(blob=>blob.url));deleted+=expired.length;}
    if(!result.hasMore)break;cursor=result.cursor;
  }
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({deleted}));
}
