import {createHmac} from 'node:crypto';
import {Conflict} from './store.mjs';

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
  const normalized=[];
  for(const row of rows.slice(0,200)){
    if(!row||typeof row!=='object'||Array.isArray(row))continue;
    if(row.project_id!==undefined&&Number(row.project_id)!==projectId)continue;
    if(Number(row.key_id??row.license_id)!==licenseId)continue;
    const rawTime=row.created_at??row.timestamp??row.at;
    const at=typeof rawTime==='number'?rawTime:typeof rawTime==='string'?Date.parse(rawTime):NaN;
    if(!Number.isFinite(at)||at<0)continue;
    const rawDevice=row.hwid??row.device_id??row.hwid_hash;
    const device=typeof rawDevice==='string'&&rawDevice.length&&rawDevice.length<1024?'Device '+createHmac('sha256',secret).update('owner-device|'+rawDevice).digest('hex').slice(0,16):null;
    const country=text(row.country_code??row.country,40);
    normalized.push({at,device,country,executor:text(row.executor??row.executor_name),event:text(row.event??row.type??row.status,48)??'Execution',changes:[]});
  }
  normalized.sort((a,b)=>a.at-b.at);
  const previous={};
  for(const row of normalized)for(const field of ['device','country','executor']){
    if(row[field]){if(previous[field]&&previous[field]!==row[field])row.changes.push(field);previous[field]=row[field];}
  }
  return normalized.slice(-100).reverse();
}
