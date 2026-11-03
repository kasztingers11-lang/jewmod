import {createHmac} from 'node:crypto';
import {Conflict} from './store.mjs';
import {isIP} from 'node:net';

const day=86400000;
export class OwnerError extends Error{constructor(status,message){super(message);this.status=status;}}
const deny=(status,message)=>{throw new OwnerError(status,message);};
export function createOwnerService({store,secret,origin,now=Date.now}){
  const key='owner-v1/'+createHmac('sha256',secret).update(origin+'|owner-state').digest('base64url')+'.json';
  const empty=()=>({revision:0,announcement:{enabled:false,message:'',expiresAt:null},audit:[]});
  let cached=null;
  const prune=rows=>rows.filter(row=>row.at>now()-30*day).slice(-100);
  async function read(){return await store.read(key);}
  async function update(fn){
    for(let attempt=0;attempt<3;attempt++){
      const item=await read(),data=item?.data??empty();
      data.audit=prune(data.audit??[]);fn(data);data.audit=prune(data.audit);
      try{await store.write(key,data,item?.etag);cached=null;return data;}catch(error){if(!(error instanceof Conflict))throw error;}
    }
    deny(409,'Owner settings changed. Refresh and try again.');
  }
  function publicView(data){
    const a=data.announcement;
    return {revision:data.revision,announcement:a.enabled&&(!a.expiresAt||a.expiresAt>now())?{message:a.message,expiresAt:a.expiresAt}:null};
  }
  return {
    async announcement(){
      if(!cached||cached.until<=now())cached={until:now()+10000,data:(await read())?.data??empty()};
      return publicView(cached.data);
    },
    async state(){const data=(await read())?.data??empty();return {...publicView(data),draft:data.announcement,audit:prune(data.audit??[]).reverse()};},
    async publish(actor,input){
      if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.enabled!=='boolean'||typeof input.message!=='string'||input.message.length>240||/[\x00-\x1f\x7f]/.test(input.message)||input.enabled&&!input.message.trim())deny(400,'Use a plain announcement of 1–240 characters.');
      if(input.hours!==null&&(!Number.isInteger(input.hours)||input.hours<1||input.hours>168))deny(400,'Announcement expiry must be 1–168 hours, or no expiry.');
      const data=await update(data=>{
        if(data.revision!==input.revision)deny(409,'A newer announcement exists. Refresh first.');
        data.revision++;data.announcement={enabled:input.enabled,message:input.message.trim(),expiresAt:input.enabled&&input.hours?now()+input.hours*3600000:null};
        data.audit.push({at:now(),actor:actor.id,action:input.enabled?'announcement-published':'announcement-hidden',licenseId:null});
      });return {...publicView(data),draft:data.announcement};
    },
    async audit(actor,action,licenseId){
      await update(data=>{data.audit.push({at:now(),actor:actor.id,action,licenseId});});
    }
  };
}

export function executionView(rows,{secret,licenseId,projectId=6147}){
  const text=(value,max=64)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').slice(0,max):null;
  const executorName=row=>{
    let details=row.details;
    if(typeof details==='string'&&details.length<16384){try{details=JSON.parse(details);}catch{details=null;}}
    for(const value of [row.executor,row.executor_name,row.executorName,row.metadata?.executor,row.client?.executor,details?.executor,details?.executor_name]){
      const name=text(typeof value==='object'&&value!==null?value.name??value.Name:value);
      if(name?.trim())return name.trim();
    }
    return null;
  };
  const normalized=[];
  for(const row of rows.slice(0,200)){
    if(!row||typeof row!=='object'||Array.isArray(row))continue;
    if(row.project_id!==undefined&&Number(row.project_id)!==projectId)continue;
    const id=Number(row.key_id??row.license_id??row.key?.id);
    if(!Number.isSafeInteger(id)||id<1||licenseId!==undefined&&id!==licenseId)continue;
    const rawTime=row.created_at??row.timestamp??row.at??row.createdAt;
    const at=typeof rawTime==='number'?rawTime:typeof rawTime==='string'?Date.parse(rawTime):NaN;
    if(!Number.isFinite(at)||at<0||at>8640000000000000)continue;
    const rawDevice=row.hwid??row.device_id??row.hwid_hash;
    const device=typeof rawDevice==='string'&&rawDevice.length&&rawDevice.length<1024?'Device '+createHmac('sha256',secret).update('owner-device|'+rawDevice).digest('hex').slice(0,16):null;
    const suppliedCountry=text(row.country_code??row.country??row.geo?.country_code,40);
    const country=suppliedCountry?.length===2?suppliedCountry.toUpperCase():suppliedCountry;
    const rawIp=row.ip_address??row.ip;
    const ip=typeof rawIp==='string'&&isIP(rawIp)?isIP(rawIp)===6?new URL('http://['+rawIp+']/').hostname.slice(1,-1):rawIp:null;
    const executor=executorName(row);
    const event=text(row.event??row.event_type??row.action??row.type??row.status,48)??'Execution';
    const eventId=createHmac('sha256',secret).update(JSON.stringify([id,row.id===undefined?null:String(row.id),at,device,country,ip,executor,event])).digest('hex').slice(0,32);
    normalized.push({id:eventId,licenseId:id,at,device,country,ip,executor,event,changes:[]});
  }
  normalized.sort((a,b)=>a.at-b.at);
  const previous=new Map(),unique=new Map();
  for(const row of normalized){
    if(unique.has(row.id))continue;
    const before=previous.get(row.licenseId)??{};
    for(const field of ['device','country','ip','executor'])if(row[field]){
      if(before[field]&&before[field]!==row[field])row.changes.push(field);before[field]=row[field];
    }
    previous.set(row.licenseId,before);unique.set(row.id,row);
  }
  return [...unique.values()].slice(-100).reverse();
}
