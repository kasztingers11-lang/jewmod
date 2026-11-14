import {createHmac,hkdfSync,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {Conflict} from './store.mjs';
import {executionView} from './owner.mjs';
import {collectionRows,collectionRoute,advertisedOperations,providerJson} from './provider-format.mjs';

export class LicenseError extends Error {
  constructor(status,message,code){super(message);this.status=status;this.code=code;}
}
const projectId=6147,day=86400000;
const reject=(status,message,code)=>{throw new LicenseError(status,message,code);};

export function createLicenseService({store,secret,origin,token,fetcher=fetch,now=Date.now,revokeWorkspace=async()=>{}}){
  const configured=typeof token==='string'&&token.length>0;
  const encryptionKey=hkdfSync('sha256',secret,'neoperro-license-v1',origin,32);
  const cache=new Map();
  const collectionCache=new Map();let contractCache=null;
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
    if(!/^\/v1\/(automation|projects\/6147\/(keys(?:\/lookup)?|logs)|(?:keys|logs)\?project_id=6147|keys\/\d+(\/(claim|reset-hwid))?)$/.test(path))reject(503,'Unsupported license operation.');
    let response;
    try{response=await fetcher('https://flowauth.net'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(8000)});}catch{reject(503,'License service unavailable. Refresh before trying again.');}
    if(!response.ok){
      const errors={401:[503,'The site’s license-service credential was rejected. Contact support.'],403:[503,'The license service denied this action. Contact support.'],404:[400,'License not found.'],409:[409,'This license cannot be linked or reset. Refresh to check its current status.'],429:[429,'Please wait before trying this license action again.']};
      const [status,message]=errors[response.status]??[503,'License service could not confirm this request. Refresh before retrying.'];reject(status,message);
    }
    let payload;try{payload=await providerJson(response);}catch{reject(503,'License service returned an invalid or oversized response.');}
    if(!payload||typeof payload!=='object')reject(503,'License service returned an invalid response.');
    const collection=/^\/v1\/(?:projects\/6147\/(?:keys|logs)$|(?:keys|logs)\?project_id=6147$)/.test(path);
    if(collection)return payload;
    if(Array.isArray(payload))reject(503,'License service returned an invalid response.');
    const data=payload.data??payload;
    if(!data||typeof data!=='object'||Array.isArray(data))reject(503,'License service returned an invalid response.');
    const key=data.key??data;
    if(!key||typeof key!=='object'||Array.isArray(key))reject(503,'License service returned an invalid response.');
    if(path==='/v1/automation')return data;
    const fields=['id','project_id','status','effective_status','claimed_by','tier','paused_at','blacklist_id','stacked_into_key_id','hwidless','max_devices','hwid_bound','hwid_lock','duration'];
    return Object.fromEntries(fields.filter(name=>Object.hasOwn(key,name)).map(name=>[name,key[name]]));
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
    if(record.data.webBlocked)reject(403,'Website access for this license is blocked. Contact support.');
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
    async rememberWorkspace(user,session,force=false,verified=false){
      if(!verified)await linked(user);
      const path=accountKey(user);
      for(let attempt=0;attempt<3;attempt++){
        const item=await store.read(path);
        if(!item||item.data.kind!=='license')reject(403,'Link your license first.');
        if(!force&&item.data.workspace?.expires>now())return;
        item.data.workspace={id:session.id,expires:session.expires};
        try{await store.write(path,item.data,item.etag);return;}catch(e){if(!(e instanceof Conflict))throw e;}
      }
      reject(409,'Connection changed. Refresh and try again.');
    },
    async blockWorkspace(user,session){
      const path=accountKey(user);
      for(let attempt=0;attempt<3;attempt++){
        const item=await store.read(path);
        if(!item||item.data.workspace?.id!==session.id)return;
        item.data.workspace={...item.data.workspace,blocked:true};
        try{await store.write(path,item.data,item.etag);return;}catch(e){if(!(e instanceof Conflict))throw e;}
      }
      reject(409,'Connection changed. Refresh and try again.');
    },
    async runtimeWorkspace(value){
      if(typeof value!=='string'||!/^[A-Za-z0-9_-]{12,64}$/.test(value))reject(403,'Client connection could not be verified.','key-rejected');
      let key;
      try{key=await request('/v1/projects/'+projectId+'/keys/lookup','POST',{key_value:value});}
      catch(e){if(e instanceof LicenseError&&e.status===400)e.code='key-rejected';throw e;}
      const user={id:String(key.claimed_by??'')};
      if(!/^\d{17,20}$/.test(user.id))reject(403,'Link this license in the dashboard first.','key-unlinked');
      try{validate(key,user);}catch(e){if(e instanceof LicenseError)e.code='key-rejected';throw e;}
      const path=accountKey(user),record=await store.read(path);
      if(record?.data.kind!=='license'||record.data.licenseId!==key.id)reject(403,'Link this license in the dashboard first.');
      if(record.data.webBlocked)reject(403,'Website access for this license is blocked. Contact support.');
      const stored=Buffer.from(open(record.data.ciphertext,path)),incoming=Buffer.from(value);
      if(stored.length!==incoming.length||!timingSafeEqual(stored,incoming))reject(403,'Client connection could not be verified.');
      const session=record.data.workspace;
      if(!session||session.blocked||session.expires<=now())reject(403,'Open the dashboard and enable client connection.',
        !session||session.expires<=now()?'session-unavailable':'connection-disabled');
      return {user,session:{id:session.id,expires:session.expires}};
    },
    async ownerContract(){
      const contract=await request('/v1/automation');
      return {operations:advertisedOperations(contract).filter(x=>/logs|blacklist|revoke/.test(x.definition?.id??x.path)).slice(0,30).map(({method,path,definition})=>({id:definition?.id??path,method,path}))};
    },
    async ownerLicense(id){
      if(typeof id==='string')id=id.trim();
      if(typeof id==='string'&&/^\d{17,20}$/.test(id)){
        const record=await store.read(accountKey({id}));
        if(record?.data.kind!=='license')reject(404,'No website license is linked to that Discord account.');
        id=record.data.licenseId;
      }
      let key;
      if(typeof id==='string'&&/^[A-Za-z0-9_-]{12,64}$/.test(id)&&(!/^\d+$/.test(id)||id.length>20)){
        key=await request('/v1/projects/'+projectId+'/keys/lookup','POST',{key_value:id});
        id=Number(key.id);
      }else if(typeof id==='string'&&/^\d{1,16}$/.test(id))id=Number(id);
      if(!Number.isSafeInteger(id)||id<1)reject(400,'Enter a key, license ID or linked Discord ID.');
      key??=await request('/v1/keys/'+id);
      if(Number(key.project_id)!==projectId||Number(key.id)!==id)reject(403,'This license does not belong to Neoperro.');
      const user={id:String(key.claimed_by??'')};
      const record=/^\d{17,20}$/.test(user.id)?await store.read(accountKey(user)):null;
      const linked=record?.data.kind==='license'&&record.data.licenseId===id;
      return {id,status:String(key.effective_status??key.status??'unknown').slice(0,40),discordId:/^\d{17,20}$/.test(user.id)?user.id:null,
        expiresAt:key.duration?.is_lifetime?null:Number.isFinite(key.duration?.evaluated_at)&&Number.isFinite(key.duration?.remaining_ms)?key.duration.evaluated_at+key.duration.remaining_ms:null,
        lifetime:key.duration?.is_lifetime===true,hwidBound:key.hwid_bound===true,websiteLinked:!!linked,webBlocked:!!linked&&record.data.webBlocked===true,
        resetEnabled:!!key.hwid_lock?.reset_enabled&&key.hwid_lock.reset_cooldown_ms>=day,resetAvailableAt:key.hwid_lock?.reset_available_at??null};
    },
    async ownerCollection(kind){
      if(!['keys','logs'].includes(kind))reject(400,'Unsupported owner view.');
      if(collectionCache.get(kind)?.until>now())return collectionCache.get(kind).rows;
      if(!contractCache||contractCache.until<=now())contractCache={data:await request('/v1/automation'),until:now()+300000};
      const route=collectionRoute(contractCache.data,kind,projectId);
      if(!route)reject(503,'The provider has not advertised a supported project-scoped '+kind+' endpoint. Its API contract needs verification.');
      const data=await request(route);
      const rows=collectionRows(data,kind);
      if(!rows)reject(503,'The provider returned an unsupported '+kind+' format.');
      collectionCache.set(kind,{until:now()+10000,rows});return rows;
    },
    async ownerList(){
      const rows=await this.ownerCollection('keys');
      return {licenses:rows.filter(row=>row&&(row.project_id===undefined||Number(row.project_id)===projectId)&&Number.isSafeInteger(Number(row.id))).slice(0,100).map(row=>({id:Number(row.id),status:String(row.effective_status??row.status??'unknown').slice(0,40),discordId:/^\d{17,20}$/.test(String(row.claimed_by??''))?String(row.claimed_by):null})),limit:100};
    },
    async ownerLogs(id){
      await this.ownerLicense(id);
      const rows=await this.ownerCollection('logs');
      return {events:executionView(rows,{secret,licenseId:id}),limit:100,scope:'Available provider records only; missing fields and earlier history are not reconstructed.'};
    },
    async ownerFeed(){
      const rows=await this.ownerCollection('logs');
      return {events:executionView(rows,{secret}),pollSeconds:20,scope:'Recent provider records; not a complete execution history.'};
    },
    async ownerCommand(id,command){
      const key=await this.ownerLicense(id);
      if(command==='reset-hwid'){
        if(!key.resetEnabled||!key.hwidBound)reject(409,'This license has no eligible device reset.');
        if(key.resetAvailableAt&&key.resetAvailableAt>now())reject(429,'HWID resets are available once every 24 hours.');
        await request('/v1/keys/'+id+'/reset-hwid','POST',{});
        for(const [path,row]of cache)if(row.id===id)cache.delete(path);
      }else if(['disconnect-web','block-web','unblock-web'].includes(command)){
        if(!key.websiteLinked)reject(409,'This license has not been linked on the website.');
        const path=accountKey({id:key.discordId});
        for(let attempt=0;attempt<3;attempt++){
          const record=await store.read(path);
          if(record?.data.kind!=='license'||record.data.licenseId!==id)reject(409,'The website license association changed.');
          if(command!=='unblock-web'&&record.data.workspace)record.data.workspace={...record.data.workspace,blocked:true};
          if(command==='block-web')record.data.webBlocked=true;
          if(command==='unblock-web')delete record.data.webBlocked;
          try{await store.write(path,record.data,record.etag);}catch(error){if(!(error instanceof Conflict))throw error;if(attempt===2)reject(409,'License changed. Refresh first.');continue;}
          cache.delete(path);
          if(command!=='unblock-web')await revokeWorkspace(record.data.workspace);
          break;
        }
      }else reject(400,'Unsupported owner command.');
      return this.ownerLicense(id);
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
      if(record?.data.webBlocked)reject(403,'Website access for this license is blocked. Contact support.');
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
      cache.set(path,{id:key.id,key,until:now()+30000});return publicStatus(key);
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
