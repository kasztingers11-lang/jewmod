import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {Conflict} from './store.mjs';

const day=86400000,fields=['hwid','ip','country','executor'];
export const alertEvents=['script.executed','key.hwid_reset','auth.failed'];
export class AlertError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new AlertError(status,message);};
const clean=(v,max=100)=>typeof v==='string'&&v.trim()?v.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,max):null;
const digest=(secret,v)=>createHmac('sha256',secret).update(v).digest('hex');

export function verifyFlowAuth(raw,timestamp,signature,secret,now=Date.now()){
  if(!Buffer.isBuffer(raw)||typeof secret!=='string'||secret.length<32||secret.length>512)return false;
  if(typeof timestamp!=='string'||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000)return false;
  if(typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const expected=createHmac('sha256',secret).update(timestamp).update('.').update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}

export function discordWebhook(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,200}$/.test(url.pathname))return null;
    url.searchParams.set('wait','true');return url.href;
  }catch{return null;}
}

export function normalizeAlert(envelope,{secret,projectId=6147,countryLookup=()=>null,now=Date.now()}){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||envelope.project_id!==projectId)return null;
  if(!alertEvents.includes(envelope.event))return null;
  const data=envelope.data;
  if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.key_id)||data.key_id<1)return null;
  if(!Number.isSafeInteger(envelope.timestamp)||envelope.timestamp<0||envelope.timestamp>now+300000)return null;
  if(envelope.event==='auth.failed'&&data.reason!=='hwid_mismatch')return null;
  let ip=null;
  if(typeof data.ip==='string'){
    if(isIP(data.ip)===4)ip=data.ip;
    if(isIP(data.ip)===6){
      ip=new URL('http://['+data.ip+']/').hostname.slice(1,-1);
      if(ip.startsWith('::ffff:')){
        const pair=ip.slice(7).split(':');
        if(pair.length===2){const a=parseInt(pair[0],16),b=parseInt(pair[1],16);ip=[a>>8,a&255,b>>8,b&255].join('.');}
      }
    }
  }
  const supplied=clean(data.country_code??data.country??data.geo?.country_code,80);
  const country=supplied&&/^[A-Za-z]{2}$/.test(supplied)?supplied.toUpperCase():ip?countryLookup(ip):null;
  const rawDevice=clean(data.hwid,1024),executor=clean(typeof data.executor==='object'?data.executor?.name:data.executor,80);
  return {event:envelope.event,at:envelope.timestamp,licenseId:data.key_id,
    hwid:rawDevice?'Device '+digest(secret,'license-alert-device|'+rawDevice).slice(0,16):null,
    ip,country:typeof country==='string'&&/^[A-Z]{2}$/.test(country)?country:null,executor,
    player:clean(data.player_name,40),playerId:/^\d{1,20}$/.test(String(data.player_id??''))?String(data.player_id):null,
    discordId:/^\d{17,20}$/.test(String(data.claimed_by??''))?String(data.claimed_by):null,
    forced:typeof data.forced==='boolean'?data.forced:null};
}

export function alertMessage(alert){
  const escape=value=>String(value).replace(/[@`*_~|<>\[\]\\]/g,'\\$&').slice(0,200);
  const names={hwid:'HWID',ip:'IP address',country:'Approximate country',executor:'Executor'};
  const items=[{name:'License / User ID',value:'License: ||'+alert.licenseId+'||'+(alert.playerId?'\nRoblox: ||'+alert.playerId+'||':'')+(alert.discordId?'\nDiscord: ||'+alert.discordId+'||':''),inline:false}];
  if(alert.player)items.push({name:'Player',value:escape(alert.player),inline:true});
  const reset=alert.event==='key.hwid_reset',rejected=alert.event==='auth.failed';
  for(const field of ['country','ip','hwid','executor']){
    const change=alert.changes.find(row=>row.field===field),value=alert.values[field];
    items.push({name:names[field],value:reset&&field==='hwid'?'❌ — '+escape(value??'Previously linked device')+' → Binding reset':change?'❌ — '+escape(change.before)+' → '+escape(change.after):value?'✅ — '+escape(value)+(alert.unobserved.includes(field)?' (last observed)':''):'— Not supplied',inline:false});
  }
  items.push({name:'Time (UTC)',value:new Date(alert.at).toISOString(),inline:false});
  if(reset)items.push({name:'Reset',value:alert.forced===true?'Operator reset':alert.forced===false?'Player reset':'Source not supplied',inline:true});
  return {username:'neoperro',allowed_mentions:{parse:[]},embeds:[{
    title:reset?'HWID reset':rejected?'HWID mismatch — run rejected':'License details changed',color:0xff0000,
    description:reset?'FlowAuth confirmed a device-binding reset.':rejected?'FlowAuth rejected this attempt. The last successful device remains the baseline.':'Changes compared with the last observed successful run. A network change alone does not establish sharing.',
    fields:items,timestamp:new Date(alert.at).toISOString(),footer:{text:'Event '+alert.id.slice(0,16)}}]};
}

export function createLicenseAlerts({store,secret,origin,webhookUrl,countryLookup,fetcher=fetch,now=Date.now}){
  const destination=discordWebhook(webhookUrl);
  const configured=!!store&&typeof secret==='string'&&secret.length>=32&&secret.length<=512&&!!destination;
  const key=id=>'license-alert-v1/'+digest(secret,origin+'|'+id)+'.json';
  const empty=()=>({kind:'license-alert',expires:now()+30*day,values:{},clocks:{},seen:[],pending:[],attempts:[]});
  async function update(path,fn){
    for(let attempt=0;attempt<6;attempt++){
      const row=await store.read(path),data=row?.data.expires>now()?row.data:empty();
      const result=fn(data);
      if(result?.skipWrite)return result;
      data.expires=now()+30*day;
      try{await store.write(path,data,row?.etag);return result;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    fail(503,'Concurrent license updates; retry delivery.');
  }
  async function drain(path){
    const owner=randomBytes(16).toString('hex');
    const claim=await update(path,data=>{
      if(!data.pending.length)return {skipWrite:true,empty:true};
      if(data.lease?.until>now()||data.retryAt>now())return {skipWrite:true,busy:true};
      data.lease={id:owner,until:now()+25000};return {alerts:data.pending.slice(0,3)};
    });
    if(claim.empty)return;
    if(claim.busy)fail(503,'A pending alert is being delivered; retry delivery.');
    for(const alert of claim.alerts){
      let response;
      try{response=await fetcher(destination,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(alertMessage(alert)),redirect:'error',signal:AbortSignal.timeout(5000)});}catch{}
      if(!response?.ok){
        const retry=Number(response?.headers.get('retry-after'));
        await update(path,data=>{if(data.lease?.id===owner){delete data.lease;data.retryAt=now()+Math.min(300000,Math.max(1000,Number.isFinite(retry)?retry*1000:5000));}return {};});
        fail(503,'Alert delivery unavailable; retry delivery.');
      }
      await response.body?.cancel();
      await update(path,data=>{
        if(data.lease?.id!==owner)fail(503,'Alert delivery lease expired; retry delivery.');
        data.pending=data.pending.filter(row=>row.id!==alert.id);data.lease.until=now()+25000;delete data.retryAt;return {};
      });
    }
    const result=await update(path,data=>{if(data.lease?.id===owner)delete data.lease;return {remaining:data.pending.length};});
    if(result.remaining)fail(503,'More alerts remain queued; retry delivery.');
  }
  return {configured,
    async checkDestination(){
      if(!configured)fail(503,'License alerts are not configured.');
      let response;
      try{response=await fetcher(destination,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)});}catch{}
      if(!response?.ok)fail(503,'Discord webhook verification failed.');
      await response.body?.cancel();return true;
    },
    async receive(envelope,delivery){
      if(!configured)fail(503,'License alerts are not configured.');
      const event=normalizeAlert(envelope,{secret,countryLookup,now:now()});
      if(!event)return {accepted:true,ignored:true};
      const path=key(event.licenseId),fingerprint=digest(secret,JSON.stringify(envelope));
      const result=await update(path,data=>{
        data.seen=data.seen.filter(row=>row.at>now()-30*day).slice(-255);
        const prior=data.seen.find(row=>row.delivery===delivery);
        if(prior&&prior.fingerprint!==fingerprint)fail(409,'Delivery ID reused with a different payload.');
        if(prior||data.seen.some(row=>row.fingerprint===fingerprint))return {skipWrite:true,duplicate:true};
        if(data.pending.length>=32)fail(503,'Alert backlog is full; retry delivery.');
        const changes=[];
        for(const field of fields){
          if(!event[field]||event.at<=(data.clocks[field]??-1))continue;
          const before=data.values[field],after=event[field];
          const changed=before&&(field==='executor'?before.toLowerCase()!==after.toLowerCase():before!==after);
          if(changed)changes.push({field,before,after});
          if(event.event==='script.executed'){data.values[field]=after;data.clocks[field]=event.at;}
        }
        let alert=event.event==='key.hwid_reset'||changes.length>0;
        if(event.event==='auth.failed'){
          const attempt=digest(secret,JSON.stringify(fields.map(field=>event[field])));
          data.attempts=data.attempts.filter(row=>row.at>now()-day).slice(-63);
          alert=!data.attempts.some(row=>row.id===attempt)&&event.at>(data.resetAt??0);
          if(alert)data.attempts.push({id:attempt,at:now()});
        }
        if(event.event==='key.hwid_reset'){
          alert=event.at>(data.resetAt??-1);
          if(alert)data.resetAt=event.at;
        }
        data.seen.push({delivery,fingerprint,at:now()});
        if(alert)data.pending.push({...event,id:fingerprint,changes,
          values:Object.fromEntries(fields.map(field=>[field,event[field]??data.values[field]??null])),
          unobserved:fields.filter(field=>!event[field])});
        return {duplicate:false,queued:!!alert};
      });
      await drain(path);
      return {accepted:true,duplicate:result.duplicate===true,queued:result.queued===true};
    }
  };
}

export async function readAlertBody(req,limit=32768){
  if(Number(req.headers?.['content-length'])>limit)fail(413,'Webhook body too large.');
  if(req.body!==undefined&&!Buffer.isBuffer(req.body)&&typeof req.body!=='string')fail(400,'Raw request body required.');
  if(Buffer.isBuffer(req.body)||typeof req.body==='string'){
    const raw=Buffer.from(req.body);if(raw.length>limit)fail(413,'Webhook body too large.');return raw;
  }
  const parts=[];let bytes=0;
  for await(const chunk of req){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>limit)fail(413,'Webhook body too large.');parts.push(buffer);}
  return Buffer.concat(parts);
}

export function webAlertHandler(handler){
  return async request=>{
    const req={method:request.method,headers:Object.fromEntries(request.headers),
      async *[Symbol.asyncIterator](){if(request.body)yield* request.body;}};
    const headers=new Headers();let body,status=500;
    await handler(req,{set statusCode(value){status=value;},setHeader(name,value){headers.set(name,value);},end(value){body=value;}});
    return new Response(body,{status,headers});
  };
}

export function createAlertHandler({alerts,secret,projectId=6147,now=Date.now,onTest=async()=>{}}){
  return async(req,res)=>{
    const end=(status,body)=>{res.statusCode=status;res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');if(status===503)res.setHeader('retry-after','30');res.end(JSON.stringify(body));};
    if(req.method!=='POST')return end(405,{error:'POST required.'});
    try{
      const raw=await readAlertBody(req);
      if(!verifyFlowAuth(raw,req.headers['x-flowauth-timestamp'],req.headers['x-flowauth-signature'],secret,now()))return end(401,{error:'Invalid webhook signature.'});
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))return end(415,{error:'JSON required.'});
      const delivery=req.headers['x-flowauth-delivery'];
      if(typeof delivery!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(delivery))return end(400,{error:'Invalid delivery ID.'});
      let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return end(400,{error:'Invalid JSON.'});}
      if(!event||typeof event!=='object'||event.event!==req.headers['x-flowauth-event']||event.project_id!==projectId)return end(400,{error:'Invalid event envelope.'});
      if(event.event==='webhook.test'){await onTest();return end(200,{accepted:true,test:true});}
      return end(200,await alerts.receive(event,delivery));
    }catch(e){return end(e instanceof AlertError?e.status:503,{error:e instanceof AlertError?e.message:'Webhook processing unavailable; retry delivery.'});}
  };
}
