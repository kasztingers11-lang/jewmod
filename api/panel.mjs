import { createApp } from '../server/app.mjs';
import { BlobStore } from '../server/store.mjs';
import { createRedisStore } from '../server/redis-store.mjs';

const origin=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:process.env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
const store=process.env.KV_REST_API_URL&&process.env.KV_REST_API_TOKEN?createRedisStore(process.env.KV_REST_API_URL,process.env.KV_REST_API_TOKEN):new BlobStore();
const app=createApp({store,secret:process.env.NEOPERRO_SESSION_SECRET,origin,discord:{clientId:process.env.DISCORD_CLIENT_ID,clientSecret:process.env.DISCORD_CLIENT_SECRET},licenseToken:process.env.FLOWAUTH_API_KEY,ownerId:process.env.NEOPERRO_OWNER_DISCORD_ID,onFault:fault=>console.error('neoperro-workspace-fault',JSON.stringify(fault))});
export default async function handler(req,res) {
  const method=req.method||'GET';
  const body=['GET','HEAD'].includes(method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
  if(body&&Buffer.byteLength(body)>65536){res.statusCode=413;res.end();return;}
  const request=new Request(origin+req.url,{method,headers:req.headers,body});
  const response=await app(request);
  res.statusCode=response.status;
  for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.end(await response.text());
}
