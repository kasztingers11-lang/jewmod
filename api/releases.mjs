import release from '../public/release.json' with {type:'json'};
import {createWorkspaceStore} from '../server/redis-store.mjs';
import {createBotAPI,botIds} from '../server/discord-bot-api.mjs';
import {createReleasePublisher} from '../server/discord-releases.mjs';

let publisher;
export default async function handler(req,res){
  const end=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
  if(process.env.VERCEL_ENV!=='production')return end(404,{error:'Not found.'});
  if(req.method!=='POST')return end(405,{error:'POST required.'});
  if(!String(req.headers['content-type']??'').startsWith('application/json'))return end(415,{error:'JSON required.'});
  if(req.headers.origin&&req.headers.origin!=='https://www.fosternya.xyz'&&req.headers.origin!=='https://fosternya.xyz')return end(403,{error:'Origin rejected.'});
  let body;
  try{
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
    if(Buffer.byteLength(raw)>256)throw Error();
    body=JSON.parse(raw);
    if(!body||Object.keys(body).length!==1||typeof body.version!=='string')throw Error();
  }catch{return end(400,{error:'Supply only the published version.'});}
  if(body.version!==release.version)return end(409,{error:'The requested release is not live yet.'});
  try{
    publisher??=createReleasePublisher({store:createWorkspaceStore(process.env),
      api:createBotAPI({token:process.env.DISCORD_BOT_TOKEN}),
      guildId:process.env.DISCORD_BOT_GUILD_ID===botIds.guild?botIds.guild:null,release});
    const result=await publisher.publish();
    return end(result.status==='busy'?409:200,result);
  }catch{return end(503,{error:'The update announcement could not be confirmed. Retry shortly.'});}
}
