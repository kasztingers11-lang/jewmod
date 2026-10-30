import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { MemoryStore } from '../server/store.mjs';

const port=Number(process.env.PORT||4173),origin='http://127.0.0.1:'+port;
const app=createApp({store:new MemoryStore(),secret:randomBytes(48).toString('base64url'),origin,local:true,allowPreview:true});
const root=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.lua':'text/plain; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname==='/api/panel'||url.pathname.startsWith('/api/auth/')){
      const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>65536){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
      const response=await app(request);const headers=Object.fromEntries(response.headers);const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;res.writeHead(response.status,headers);res.end(await response.text());return;
    }
    const path=url.pathname==='/'?'/index.html':url.pathname==='/dashboard'?'/dashboard.html':url.pathname==='/terms'?'/terms.html':url.pathname==='/privacy'?'/privacy.html':decodeURIComponent(url.pathname);
    const file=resolve(root,'.'+path);if(!file.startsWith(root+'\\')&&!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local: '+origin+' — in-memory development workspace; no production data.'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close());
