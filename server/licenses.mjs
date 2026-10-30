import {createHmac,hkdfSync,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Conflict} from './store.mjs';

export class LicenseError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const projectId=6147,day=86400000;
const reject=(status,message)=>{throw new LicenseError(status,message);};

export function createLicenseService({store,secret,origin,token,fetcher=fetch,now=Date.now}){
  const configured=typeof token==='string'&&token.length>0;
  const encryptionKey=hkdfSync('sha256',secret,'neoperro-license-v1',origin,32);
  const cache=new Map();
  const accountKey=user=>'account-v1/'+createHmac('sha256',secret).update(origin+'|license-account|'+user.id).digest('base64url')+'.json';
  const seal=(value,path)=>{
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);cipher.setAAD(Buffer.from(path));
    const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  };
  const open=(value,path)=>{
    const b=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',encryptionKey,b.subarray(0,12));
    cipher.setAAD(Buffer.from(path));cipher.setAuthTag(b.subarray(12,28));
    return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8');
  };
  async function request(path,method='GET',body){
    if(!configured)reject(503,'License service is not configured.');
    if(!/^\/v1\/(automation|projects\/6147\/keys\/lookup|keys\/\d+(\/(claim|reset-hwid))?)$/.test(path))reject(503,'Unsupported license operation.');
    let response;
    try{response=await fetcher('https://flowauth.net'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(8000)});}catch{reject(503,'License service unavailable. Refresh before trying again.');}
    if(!response.ok)reject(response.status===404?400:response.status===409?409:response.status===429?429:503,response.status===404?'License not found.':response.status===409?'This license cannot be linked or reset.':response.status===429?'Please wait before trying this license action again.':'License service could not confirm this request. Refresh before retrying.');
    let payload;try{payload=await response.json();}catch{reject(503,'License service returned an invalid response.');}
    const data=payload.data??payload;return data.key??data;
  }
  function validate(key,user,unclaimed=false){
    if(!Number.isSafeInteger(key?.id)||key.project_id!==projectId)reject(403,'This license does not belong to Neoperro.');
    if(key.status!=='active'||key.effective_status!=='active'||key.paused_at!=null||key.blacklist_id||key.stacked_into_key_id)reject(403,'This license is not active.');
    if(key.claimed_by&&String(key.claimed_by)!==user.id)reject(403,'This license is linked to a different Discord account.');
    if(!unclaimed&&String(key.claimed_by)!==user.id)reject(403,'Link your license to this Discord account first.');
    if(key.hwidless||key.max_devices!==1||!key.hwid_lock?.enabled)reject(403,'This license needs single-device HWID protection before it can be linked.');
    if(!key.duration||!['active','pending','lifetime'].includes(key.duration.state)||!key.duration.is_lifetime&&(!Number.isFinite(key.duration.remaining_ms)||key.duration.remaining_ms<=0||!Number.isFinite(key.duration.evaluated_at)||key.duration.evaluated_at+key.duration.remaining_ms<=now()))reject(403,'This license has expired or is paused.');
    return key;
  }
  function publicStatus(key){
    const lock=key.hwid_lock;
    return {status:'active',configured:true,discordLocked:true,expiresAt:key.duration.is_lifetime?null:key.duration.evaluated_at+key.duration.remaining_ms,
      hwidBound:!!key.hwid_bound,resetEnabled:!!lock.reset_enabled&&lock.reset_cooldown_ms>=day,resetAvailableAt:lock.reset_available_at??null,resetCooldownHours:lock.reset_cooldown_ms/3600000};
  }
  async function linked(user,fresh=false){
    const path=accountKey(user),record=await store.read(path);
    if(record?.data.kind!=='license')reject(403,'Link your license first.');
    let row=cache.get(path);
    if(fresh||!row||row.id!==record.data.licenseId||row.until<=now()){
      const key=validate(await request('/v1/keys/'+record.data.licenseId),user);
      row={id:key.id,key,until:now()+30000};
      if(cache.size>=1000){for(const [k,v] of cache)if(v.until<=now())cache.delete(k);if(cache.size>=1000)cache.delete(cache.keys().next().value);}
      cache.set(path,row);
    }
    validate(row.key,user);
    return {path,record,key:row.key};
  }
  return {
    configured,
    async ownerContract(){
      const contract=await request('/v1/automation');
      return {operations:(Array.isArray(contract.operations)?contract.operations:[]).filter(x=>typeof x.id==='string'&&/logs|blacklist|revoke/.test(x.id)).slice(0,30).map(({id,method,path,body,description})=>({id,method,path,body,description}))};
    },
    async status(user){
      if(!configured)return {status:'unavailable',configured:false};
      try{return publicStatus((await linked(user)).key);}catch(e){if(e instanceof LicenseError)return {status:e.status===503?'unavailable':e.message==='Link your license first.'?'unlinked':'inactive',configured:true,message:e.message};throw e;}
    },
    async assertActive(user){return linked(user);},
    async link(user,value){
      if(typeof value!=='string'||!/^[A-Za-z0-9_-]{12,64}$/.test(value))reject(400,'Enter your complete license key.');
      let key=validate(await request('/v1/projects/'+projectId+'/keys/lookup','POST',{key_value:value}),user,true);
      const path=accountKey(user);let record=await store.read(path);
      if(record&&record.data.licenseId!==key.id&&(record.data.kind==='license'||record.data.expires>now()))reject(409,'This Discord account already has a different linked license.');
      if(record?.data.kind!=='license'){
        try{await store.write(path,{kind:'license-pairing',licenseId:key.id,expires:now()+600000},record?.etag);}catch(e){if(e instanceof Conflict)reject(409,'Another pairing is in progress. Refresh first.');throw e;}
        record=await store.read(path);
      }
      if(!key.claimed_by){
        if(key.tier!=='premium')reject(403,'This license does not support Discord linking.');
        await request('/v1/keys/'+key.id+'/claim','POST',{discord_user_id:user.id});
      }
      key=validate(await request('/v1/keys/'+key.id),user);
      const current=await store.read(path);
      if(!current||current.data.licenseId!==key.id)reject(409,'Pairing changed. Refresh first.');
      try{await store.write(path,{kind:'license',licenseId:key.id,projectId,ciphertext:seal(value,path)},current.etag);}catch(e){if(e instanceof Conflict)reject(409,'Pairing changed. Refresh first.');throw e;}
      cache.delete(path);return publicStatus(key);
    },
    async reveal(user){const {path,record}=await linked(user,true);return {key:open(record.data.ciphertext,path)};},
    async reset(user){
      const {path,key}=await linked(user,true),lock=key.hwid_lock;
      if(!lock.reset_enabled||lock.reset_cooldown_ms<day)reject(403,'HWID reset is not enabled under the 24-hour policy.');
      if(!key.hwid_bound)reject(409,'This license has no linked device to reset.');
      if(lock.reset_available_at&&lock.reset_available_at>now())reject(429,'HWID resets are available once every 24 hours.');
      await request('/v1/keys/'+key.id+'/reset-hwid','POST',{});cache.delete(path);
      return publicStatus((await linked(user,true)).key);
    }
  };
}
