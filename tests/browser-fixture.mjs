import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';

const origin='http://127.0.0.1:4174',root=resolve('public');
const key={id:101,project_id:6147,status:'active',effective_status:'active',claimed_by:null,tier:'premium',paused_at:null,blacklist_id:null,hwidless:false,max_devices:1,hwid_bound:true,hwid_lock:{enabled:true,reset_enabled:true,reset_cooldown_ms:86400000,reset_available_at:null},duration:{state:'lifetime',remaining_ms:null,is_lifetime:true,evaluated_at:Date.now()}};
const identityFetch=async url=>String(url).endsWith('/token')?Response.json({access_token:'mock-only-access',token_type:'Bearer',expires_in:60,scope:'identify'}):String(url).endsWith('/users/@me')?Response.json({id:'123456789012345678',username:'test.account',global_name:'Local Test Account'}):new Response(null,{status:200});
const licenseFetch=async(url,options)=>{
  if(String(url).endsWith('/lookup')&&JSON.parse(options.body).key_value!=='TEST-ONLY-NOT-A-REAL-LICENSE')return Response.json({error:'not found'},{status:404});
  if(String(url).endsWith('/claim'))key.claimed_by=JSON.parse(options.body).discord_user_id;
  if(String(url).endsWith('/reset-hwid')){key.hwid_bound=false;key.hwid_lock.reset_available_at=Date.now()+86400000;}
  return Response.json(key);
};
const app=createApp({store:new MemoryStore(),secret:'local-fixture-only-not-a-production-secret',origin,local:true,discord:{clientId:'1565654517804957776',clientSecret:'mock-client-secret'},identityFetch,licenseToken:'mock-account-token',licenseFetch});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.lua':'text/plain; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await app(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}));
      const headers=Object.fromEntries(response.headers);headers['set-cookie']=response.headers.getSetCookie();
      if(url.pathname==='/api/auth/login'&&response.status===303){const next=new URL(headers.location);headers.location='/api/auth/callback?'+new URLSearchParams({state:next.searchParams.get('state'),code:'local-fixture-code',iss:'https://discord.com'});}
      res.writeHead(response.status,headers);res.end(await response.text());return;
    }
    const path=url.pathname==='/'?'/index.html':['/dashboard','/terms','/privacy'].includes(url.pathname)?url.pathname+'.html':decodeURIComponent(url.pathname);
    const file=resolve(root,'.'+path);if(!file.startsWith(root+'\\')&&!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(500);res.end('Local test fixture failed');}
});
server.listen(4174,'127.0.0.1',()=>console.log('Local auth fixture: '+origin+' — synthetic identity and license; no external requests or production data.'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close());
