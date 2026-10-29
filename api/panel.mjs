import { createApp } from '../server/app.mjs';
import { BlobStore } from '../server/store.mjs';

const origin=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:process.env.NEOPERRO_ORIGIN||'https://www.fosternya.xyz';
const app=createApp({store:new BlobStore(),secret:process.env.NEOPERRO_SESSION_SECRET,origin});
export default async function handler(req,res) {
  const method=req.method||'GET';
  const body=['GET','HEAD'].includes(method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
  if(body&&Buffer.byteLength(body)>65536){res.statusCode=413;res.end();return;}
  const request=new Request('https://www.fosternya.xyz'+req.url,{method,headers:req.headers,body});
  const response=await app(request);
  res.statusCode=response.status;
  for(const [key,value]of response.headers)res.setHeader(key,value);
  res.end(await response.text());
}
