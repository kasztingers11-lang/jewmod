import {createPublicKey,verify,createHmac} from 'node:crypto';
import {providerJson} from './provider-format.mjs';

export const botIds={app:'1570090774283026572',publicKey:'ae24182c539b475793d9d79e94cc2e593c29d1ae69244c8641daaaeca5e2824d',support:'1566227727537799168',panel:'1566231744221413537',logs:'1570034199610658916',supportRole:'1570062039630610542'};
export const botSetupPath='discord-bot-v1/setup.json';
export const snowflake=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
export class BotError extends Error{constructor(status,message){super(message);this.status=status;}}
export const botFail=(status,message)=>{throw new BotError(status,message);};
export const botHash=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex');
export const text=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
export const escapeText=value=>text(value).replace(/[@`*_~|<>\[\]\\]/g,'\\$&');
export const silent={allowed_mentions:{parse:[]}};
export const responseMessage=content=>({content,...silent});

export function verifyDiscord(raw,timestamp,signature,publicKey=botIds.publicKey,now=Date.now()){
  if(!Buffer.isBuffer(raw)||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||typeof signature!=='string'||!/^[a-f0-9]{128}$/i.test(signature)||!/^[a-f0-9]{64}$/i.test(publicKey))return false;
  try{
    const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey,'hex')]),format:'der',type:'spki'});
    return verify(null,Buffer.concat([Buffer.from(timestamp),raw]),key,Buffer.from(signature,'hex'));
  }catch{return false;}
}

export function createBotAPI({token,fetcher=fetch}){
  async function request(path,{method='GET',body,form,interaction=false}={}){
    if(typeof token!=='string'||!token)botFail(503,'The Discord bot is not configured.');
    if(typeof path!=='string'||!/^\/(?:users\/@me|applications\/@me|applications\/\d{17,20}\/guilds\/\d{17,20}\/commands|guilds\/\d{17,20}(?:\/(?:channels|roles|members\/\d{17,20}))?|channels\/\d{17,20}(?:\/(?:messages(?:\/\d{17,20})?|permissions\/\d{17,20}))?(?:\?limit=100(?:&before=\d{17,20})?)?|webhooks\/\d{17,20}\/[A-Za-z0-9_.-]{20,300}\/messages\/@original)$/.test(path))botFail(400,'Unsupported Discord operation.');
    const webhook=path.startsWith('/webhooks/');if(webhook!==interaction)botFail(400,'Invalid Discord credential scope.');
    let result;
    try{result=await fetcher('https://discord.com/api/v10'+path,{method,headers:{...(!interaction?{authorization:'Bot '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:form??(body?JSON.stringify(body):undefined),redirect:'error',signal:AbortSignal.timeout(6000)});}catch{botFail(503,'Discord could not confirm the request. Try again shortly.');}
    if(!result.ok){
      await result.body?.cancel();const messages={401:'The Discord bot token was rejected.',403:'The bot is missing a Discord permission for this action.',404:'This Discord channel or message is no longer available.',429:'Discord is busy. Wait a moment before retrying.'};
      const error=new BotError(result.status===429?429:503,messages[result.status]??'Discord could not complete this action.');
      error.operation=interaction?'Private interaction response':method+' '+path;throw error;
    }
    if(result.status===204){await result.body?.cancel();return null;}
    try{return await providerJson(result,4194304);}catch{botFail(503,'Discord returned an invalid or oversized response.');}
  }
  return {request,
    async post(channelId,message,nonce){
      if(!snowflake(channelId))botFail(400,'Invalid channel.');
      return request('/channels/'+channelId+'/messages',{method:'POST',body:{...silent,...message,...(nonce?{nonce,enforce_nonce:true}:{})}});
    },
    async edit(channelId,messageId,message){return request('/channels/'+channelId+'/messages/'+messageId,{method:'PATCH',body:{...silent,...message}});},
    async reply(interaction,message){
      if(!snowflake(interaction.id)||!snowflake(interaction.application_id)||typeof interaction.token!=='string'||!/^[A-Za-z0-9_.-]{20,300}$/.test(interaction.token))botFail(400,'Invalid response token.');
      return request('/webhooks/'+interaction.application_id+'/'+interaction.token+'/messages/@original',{method:'PATCH',body:{...silent,...message},interaction:true});
    },
    async upload(channelId,contents,filename,message,nonce){
      const form=new FormData();form.set('payload_json',JSON.stringify({...silent,...message,attachments:[{id:0,filename}],...(nonce?{nonce,enforce_nonce:true}:{})}));form.set('files[0]',new Blob([contents],{type:'text/plain;charset=utf-8'}),filename);
      return request('/channels/'+channelId+'/messages',{method:'POST',form});
    }
  };
}

export function channelPermissions(roles,member,channel,guildId){
  const selected=new Set([guildId,...(member.roles??[])]);
  let permissions=roles.filter(role=>selected.has(role.id)).reduce((p,role)=>p|BigInt(role.permissions??'0'),0n);
  if(permissions&8n)return (1n<<55n)-1n;
  const overwrites=channel.permission_overwrites??[];
  const apply=row=>{permissions=(permissions&~BigInt(row.deny??'0'))|BigInt(row.allow??'0');};
  const everyone=overwrites.find(row=>row.type===0&&row.id===guildId);if(everyone)apply(everyone);
  let allow=0n,deny=0n;
  for(const row of overwrites)if(row.type===0&&row.id!==guildId&&selected.has(row.id)){allow|=BigInt(row.allow??'0');deny|=BigInt(row.deny??'0');}
  permissions=(permissions&~deny)|allow;
  const own=overwrites.find(row=>row.type===1&&row.id===member.user?.id);if(own)apply(own);
  return permissions;
}

export function privateLogChannel(roles,channel,guildId,supportRole,botRoles=[],allowedUsers=[]){
  if((channel.permission_overwrites??[]).some(row=>row.type===1&&(BigInt(row.allow??'0')&1024n)&&!allowedUsers.includes(row.id)))return false;
  return roles.every(role=>{
    if(role.id===supportRole||role.managed&&botRoles.includes(role.id)||BigInt(role.permissions??'0')&8n)return true;
    return !(channelPermissions(roles,{roles:role.id===guildId?[]:[role.id]},channel,guildId)&1024n);
  });
}
