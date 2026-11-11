import {randomBytes} from 'node:crypto';
import {Redis} from '@upstash/redis';
import {BlobStore,Conflict} from './store.mjs';

export const writeScript=`
local raw=redis.call('GET',KEYS[1])
if raw then
  local row=cjson.decode(raw)
  if row.etag==ARGV[3] then return 1 end
  if not row.deleted and (ARGV[1]=='' or row.etag~=ARGV[1]) then return 0 end
  if row.deleted and ARGV[1]~='' then return 0 end
elseif ARGV[1]~='' then return 0 end
if tonumber(ARGV[4])>0 then redis.call('SET',KEYS[1],ARGV[2],'PX',ARGV[4])
else redis.call('SET',KEYS[1],ARGV[2]) end
return 1`;

export const removeScript=`
local raw=redis.call('GET',KEYS[1])
if not raw then return 0 end
local row=cjson.decode(raw)
if row.deleted==ARGV[2] then return 1 end
if row.deleted or row.etag~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[3],'PX',60000)
return 1`;

export class RedisStore {
  constructor(client,{now=Date.now,prefix='neoperro:store-v1:'}={}){
    this.client=client;this.now=now;this.prefix=prefix;
  }
  async read(key){
    const raw=await this.client.get(this.prefix+key);
    if(raw===null)return null;
    const row=typeof raw==='string'?JSON.parse(raw):raw;
    if(row?.deleted)return null;
    if(!row||typeof row.etag!=='string'||!row.data||typeof row.data!=='object'||Array.isArray(row.data))throw Error('Invalid private storage record.');
    return structuredClone({data:row.data,etag:row.etag});
  }
  async write(key,data,etag){
    const next=randomBytes(16).toString('base64url');
    const serialized=JSON.stringify({data,etag:next});
    if(Buffer.byteLength(serialized)>524288)throw Error('Private storage record exceeds its limit.');
    const ephemeral=['panel-v1/','license-alert-v1/','discord-bot-receipt-v1/','discord-bot-rate-v1/','discord-ticket-v1/','discord-ticket-index-v1/'].some(prefix=>key.startsWith(prefix));
    const expires=Number.isFinite(data.expires)&&(ephemeral||data.kind==='license-pairing')?data.expires:0;
    const ttl=expires?Math.max(1,Math.ceil(expires-this.now())):0;
    const result=await this.client.eval(writeScript,[this.prefix+key],[etag??'',serialized,next,String(ttl)]);
    if(Number(result)!==1)throw new Conflict();
    return {etag:next};
  }
  async remove(key,etag){
    if(typeof etag!=='string'||!etag)throw new Conflict();
    const id=randomBytes(16).toString('base64url');
    const result=await this.client.eval(removeScript,[this.prefix+key],[etag,id,JSON.stringify({deleted:id})]);
    if(Number(result)!==1)throw new Conflict();
  }
}

export function createRedisStore(url,token){
  const endpoint=new URL(url);
  if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.upstash.io')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['','/'].includes(endpoint.pathname))throw Error('Invalid private storage endpoint.');
  return new RedisStore(new Redis({url:endpoint.origin,token,automaticDeserialization:false,enableTelemetry:false,
    retry:{retries:1,backoff:()=>100},signal:()=>AbortSignal.timeout(5000)}));
}

export function createWorkspaceStore(env){
  const url=env.KV_REST_API_URL,token=env.KV_REST_API_TOKEN;
  if(url||token){
    if(!url||!token)return null;
    try{return createRedisStore(url,token);}catch{return null;}
  }
  return env.VERCEL_ENV==='production'?null:new BlobStore();
}
