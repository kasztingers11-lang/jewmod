import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../public/config.mjs';
import { Conflict } from './store.mjs';

const schema = JSON.parse(readFileSync(new URL('../public/config-schema.json',import.meta.url)));
const TTL = 12*60*60*1000;
const cookieName = '__Host-neoperro';
class Failure extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = (status,message) => {throw new Failure(status,message);};
const safeEqual = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cleanObject = (obj,keys) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k=>!keys.includes(k))) fail(400,'Unsupported request.');
};

export function createApp({store, secret, origin='https://www.fosternya.xyz', now=Date.now, local=false}) {
  const counters = new Map();
  const mac = (purpose,value) => createHmac('sha256',secret).update(origin+'|'+purpose+'|'+value).digest('base64url');
  const sign = (purpose,value) => value+'.'+mac(purpose,value);
  function verify(purpose,token) {
    if (typeof token !== 'string' || token.length > 400) fail(401,'Session expired.');
    const parts=token.split('.'),signature=parts.pop(),value=parts.join('.');
    if(!safeEqual(signature,mac(purpose,value))) fail(401,'Session expired.');
    if(!/^[A-Za-z0-9_-]{32}$/.test(parts[0]) || !/^\d{13}$/.test(parts[1]) || Number(parts[1])<=now()) fail(401,'Session expired.');
    return {id:parts[0],expires:Number(parts[1]),token};
  }
  const keyFor = session => 'panel-v1/'+session.expires+'-'+mac('storage',session.id)+'.json';
  function json(data,status=200,headers={}) {
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  }
  const cookie = (token, maxAge=43200) => `${local?'neoperro_dev':cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local?'':'; Secure'}`;
  function sessionFrom(req) {
    const name=local?'neoperro_dev':cookieName;
    const raw=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
    return verify('session',raw?.slice(name.length+1));
  }
  async function load(session) {
    const item=await store.read(keyFor(session));
    if (!item || item.data.expires !== session.expires || item.data.expires<=now()) fail(401,'Session expired.');
    return item;
  }
  async function change(session,update) {
    for(let attempt=0;attempt<3;attempt++) {
      const item=await load(session); const output=update(item.data);
      try { await store.write(keyFor(session),item.data,item.etag); return output; }
      catch(e) {if(!(e instanceof Conflict))throw e;}
    }
    fail(409,'Workspace changed. Refresh and try again.');
  }
  function sameOrigin(req) {
    const incoming=req.headers.get('origin');
    const allowed=new Set([origin]);
    if(origin==='https://www.fosternya.xyz')allowed.add('https://fosternya.xyz');
    if(!allowed.has(incoming))fail(403,'Request origin rejected.');
    if(req.headers.get('sec-fetch-site')==='cross-site')fail(403,'Cross-site request rejected.');
  }
  function rate(req,action) {
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const key=mac('rate',ip)+(action==='session'&&req.method==='POST'?':start':':api');
    const window=key.endsWith(':start')?600000:60000,limit=key.endsWith(':start')?8:150;
    const previous=counters.get(key);const row=previous&&previous.until>now()?previous:{until:now()+window,count:0};
    if(++row.count>limit)fail(429,'Too many requests. Try again shortly.');
    if(counters.size>5000)for(const [k,v] of counters)if(v.until<=now())counters.delete(k);
    if(counters.size>10000)fail(503,'Please try again shortly.');
    counters.set(key,row);
  }
  async function body(req) {
    if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use application/json.');
    if(Number(req.headers.get('content-length'))>65536)fail(413,'Request too large.');
    const reader=req.body?.getReader();let size=0,parts=[];
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();fail(413,'Request too large.');}parts.push(value);}
    try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'Invalid JSON.');}
  }
  function view(data) {
    const r=data.runtime;
    return {expiresAt:data.expires,csrf:mac('csrf',data.id),profile:data.profile,
      revision:data.revision,stats:data.stats,
      runtime:{paired:!!r,online:!!r&&now()-r.seenAt<35000,seenAt:r?.seenAt??null,version:r?.version??null,game:r?.game??null,
        deliveredRevision:r?.deliveredRevision??0,appliedRevision:r?.appliedRevision??0,rejectedRevision:r?.rejectedRevision??0,errorCode:r?.errorCode??null},
      license:{status:'unlinked',source:'No license identity linked to this test workspace.'}};
  }
  return async function app(req) {
    try {
      if(!secret||secret.length<32||!store)fail(503,'Workspace service is not configured.');
      const action=new URL(req.url).searchParams.get('action')||'session';
      if(!['GET','POST','DELETE'].includes(req.method))return json({error:'Method not allowed.'},405,{'Allow':'GET, POST, DELETE'});
      rate(req,action);
      if(action==='session'&&req.method==='POST') {
        sameOrigin(req);const input=await body(req);cleanObject(input,[]);
        try {const existing=sessionFrom(req);return json(view((await load(existing)).data));}catch(e){if(e.status!==401)throw e;}
        const id=randomBytes(24).toString('base64url'),expires=now()+TTL;
        const session={id,expires},data={id,expires,revision:0,profile:null,runtime:null,stats:{executions:0,games:{},daily:{}}};
        await store.write(keyFor(session),data);
        return json(view(data),201,{'Set-Cookie':cookie(sign('session',id+'.'+expires))});
      }
      if(action==='runtime'&&req.method==='POST') {
        const header=req.headers.get('authorization')||'';
        const session=verify('runtime',header.startsWith('Bearer ')?header.slice(7):'');
        const input=await body(req);cleanObject(input,['version','game','appliedRevision','rejectedRevision','errorCode']);
        if(typeof input.version!=='string'||input.version.length>20||!/^\d+\.\d+\.\d+$/.test(input.version)||!['Da Strike','Da Uphill','Da Downhill','Other'].includes(input.game))fail(400,'Invalid runtime metadata.');
        if(!Number.isSafeInteger(input.appliedRevision)||input.appliedRevision<0||!Number.isSafeInteger(input.rejectedRevision)||input.rejectedRevision<0)fail(400,'Invalid revision.');
        input.errorCode??=null;
        if(![null,'runtime-unavailable','apply-failed','invalid-config'].includes(input.errorCode))fail(400,'Invalid runtime status.');
        const item=await load(session),data=item.data,r=data.runtime;
        if(!r||!safeEqual(r.tokenHash,mac('runtime-hash',session.token)))fail(401,'Pairing expired.');
        if(input.appliedRevision>r.deliveredRevision||input.rejectedRevision>r.deliveredRevision)fail(400,'Unknown delivered revision.');
        const nextRevision=data.revision;
        const deliver=data.profile&&nextRevision>input.appliedRevision&&nextRevision!==input.rejectedRevision;
        const shouldWrite=!r.claimed||now()-r.seenAt>=15000||input.appliedRevision!==r.appliedRevision||input.rejectedRevision!==r.rejectedRevision||deliver&&r.deliveredRevision!==nextRevision;
        if(shouldWrite)await change(session,d=>{
          const current=d.runtime;
          if(!current||!safeEqual(current.tokenHash,mac('runtime-hash',session.token)))fail(401,'Pairing expired.');
          if(input.appliedRevision>current.deliveredRevision||input.rejectedRevision>current.deliveredRevision)fail(400,'Unknown delivered revision.');
          if(!current.claimed){d.stats.executions++;current.claimed=true;}
          const seconds=current.seenAt?Math.max(0,Math.min(30,(now()-current.seenAt)/1000)):0;
          const day=new Date(now()).toISOString().slice(0,10);
          d.stats.games[input.game]=(d.stats.games[input.game]||0)+seconds;
          d.stats.daily[day]=(d.stats.daily[day]||0)+seconds;
          current.seenAt=now();current.version=input.version;current.game=input.game;
          current.appliedRevision=Math.max(current.appliedRevision,input.appliedRevision);
          current.rejectedRevision=input.rejectedRevision;current.errorCode=input.errorCode;
          if(deliver)current.deliveredRevision=Math.max(current.deliveredRevision,nextRevision);
        });
        return json({revision:nextRevision,config:deliver?data.profile.config:null,pollSeconds:3,expiresAt:session.expires});
      }
      const session=sessionFrom(req);
      if(req.method!=='GET') {
        sameOrigin(req);
        if(!safeEqual(req.headers.get('x-neoperro-csrf'),mac('csrf',session.id)))fail(403,'Request token rejected.');
      }else if(req.headers.get('sec-fetch-site')==='cross-site')fail(403,'Cross-site request rejected.');
      if(action==='session'&&req.method==='GET')return json(view((await load(session)).data));
      if(action==='session'&&req.method==='DELETE'){
        const item=await load(session);await store.remove(keyFor(session),item.etag);
        return json({ok:true},200,{'Set-Cookie':cookie('',0)});
      }
      if(action==='profile'&&req.method==='POST'){
        const input=await body(req);cleanObject(input,['config','name','revision']);
        if(typeof input.name!=='string'||input.name.trim().length<1||input.name.length>32||/[\x00-\x1f]/.test(input.name))fail(400,'Use a profile name of 1–32 characters.');
        try{validateConfig(input.config,schema.defaults);}catch(e){fail(400,e.message);}
        await change(session,d=>{
          if(input.revision!==d.revision)fail(409,'A newer config exists. Refresh before saving.');
          d.revision++;d.profile={name:input.name.trim(),config:input.config,savedAt:now()};
        });
        return json(view((await load(session)).data));
      }
      if(action==='pair'&&req.method==='POST'){
        const input=await body(req);cleanObject(input,[]);
        const token=sign('runtime',session.id+'.'+session.expires+'.'+randomBytes(24).toString('base64url'));
        await change(session,d=>{d.runtime={tokenHash:mac('runtime-hash',token),seenAt:0,claimed:false,deliveredRevision:0,appliedRevision:0,rejectedRevision:0,errorCode:null};});
        return json({token,expiresAt:session.expires});
      }
      if(action==='pair'&&req.method==='DELETE'){
        await change(session,d=>{d.runtime=null;});return json({ok:true});
      }
      fail(404,'Unknown action.');
    }catch(e){
      if(e instanceof Failure)return json({error:e.message},e.status,e.status===429?{'Retry-After':'60'}:{});
      return json({error:'Workspace temporarily unavailable. Please retry.'},503);
    }
  };
}
