import {Conflict} from './store.mjs';
import {LicenseError} from './licenses.mjs';
import {BotError,botIds,botHash,snowflake,verifyDiscord,silent,responseMessage,escapeText} from './discord-bot-api.mjs';
import {readAlertBody} from './license-alerts.mjs';
import {licensePanel,linkModal,ticketModal,confirm} from './discord-bot-views.mjs';

function inputFields(data){
  const result=Object.create(null);
  for(const r of data.components??[])for(const input of r.components??[]){
    if(typeof input.custom_id!=='string'||typeof input.value!=='string'||Object.hasOwn(result,input.custom_id))throw new BotError(400,'Invalid form fields.');
    result[input.custom_id]=input.value;
  }
  return result;
}

export function createBotInteractions({store,secret,guildId,ownerId,api,licenses,tickets,publicKey=botIds.publicKey,schedule,onPing=async()=>{},now=Date.now}){
  const ephemeral=message=>({type:4,data:{flags:64,...responseMessage(message)}});
  async function reserve(interaction,user){
    const key='discord-bot-receipt-v1/'+botHash(secret,interaction.id)+'.json';
    try{await store.write(key,{kind:'discord-interaction',expires:now()+15*60000,action:String(interaction.data?.custom_id??interaction.data?.name??'').slice(0,100)});}catch(e){if(e instanceof Conflict)return false;throw e;}
    const path='discord-bot-rate-v1/'+botHash(secret,user.id)+'.json';
    for(let i=0;i<4;i++){
      const item=await store.read(path),data=item?.data.expires>now()?item.data:{kind:'discord-rate',count:0,expires:now()+60000};
      if(data.count>=20)throw new BotError(429,'Too many actions. Wait a minute and try again.');data.count++;
      try{await store.write(path,data,item?.etag);return true;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    throw new BotError(409,'Another action is being processed. Try again.');
  }
  async function work(interaction,user,action){
    try{
      if(!store||!secret||!licenses||!tickets)throw new BotError(503,'The bot is still being configured.');
      if(!await reserve(interaction,user))return;
      let result;
      if(action==='panel')result=licensePanel();
      else if(action==='license:link-submit'){
        const fields=inputFields(interaction.data);
        if(Object.keys(fields).length!==1||!Object.hasOwn(fields,'key'))throw new BotError(400,'Enter your license key in the form.');
        const existing=await licenses.status(user);
        if(existing.status==='active')result=responseMessage('Your license is already linked. Use My license or Get script.');
        else{await licenses.link(user,fields.key.trim());result=responseMessage('License linked to your Discord account. You can use the same account on the dashboard.');}
      }else if(action==='license:status'){
        const status=await licenses.status(user);
        if(status.status!=='active')result=responseMessage(status.message??'Link your license first.');
        else result={...silent,embeds:[{title:'Your license',color:0xff0000,fields:[{name:'Status',value:'Active',inline:true},{name:'Expires',value:status.expiresAt?'<t:'+Math.floor(status.expiresAt/1000)+':F>':'Lifetime',inline:true},{name:'Device',value:status.hwidBound?'Linked':'Not linked',inline:true},{name:'HWID reset',value:status.resetEnabled?status.resetAvailableAt&&status.resetAvailableAt>now()?'<t:'+Math.floor(status.resetAvailableAt/1000)+':R>':'Available':'Disabled'}]}]};
      }else if(action==='license:key'||action==='license:script'){
        const {key}=await licenses.reveal(user);
        if(!/^[A-Za-z0-9_-]{12,64}$/.test(key))throw new BotError(503,'The saved license could not be verified.');
        result=responseMessage(action==='license:key'?'Your private license key. Do not share it.\n```\n'+key+'\n```':'Put your settings table between the key and loader.\n```lua\nscript_key = "'+key+'";\n\nloadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()\n```');
      }else if(action==='license:reset-confirm'){
        await licenses.reset(user);result=responseMessage('Device binding reset. The next successful execution will bind the license again.');
      }else if(action.startsWith('owner:license:')){
        if(user.id!==ownerId)throw new BotError(403,'This action is restricted to the owner.');
        const id=Number(action.slice(14));if(!Number.isSafeInteger(id)||id<1)throw new BotError(400,'Invalid license ID.');
        const key=await licenses.ownerLicense(id);
        result={...silent,embeds:[{title:'License '+id,color:0xff0000,fields:[{name:'Status',value:escapeText(key.status)},{name:'Discord account',value:key.discordId?'||'+key.discordId+'||':'No Discord claim'},{name:'Expiry',value:key.lifetime?'Lifetime':key.expiresAt?'<t:'+Math.floor(key.expiresAt/1000)+':F>':'No expiry supplied'}]}]};
      }else if(action.startsWith('ticket:create:')){
        const fields=inputFields(interaction.data);
        if(Object.keys(fields).length!==2||!Object.hasOwn(fields,'title')||!Object.hasOwn(fields,'description'))throw new BotError(400,'Complete both ticket fields.');
        const ticket=await tickets.open(user,{...fields,category:action.slice(14),interactionId:interaction.id});
        result=responseMessage((ticket.existing?'You already have an open ticket: ':'Your ticket is ready: ')+'<#'+ticket.channelId+'>');
      }else if(action.startsWith('ticket:')){
        const method=action==='ticket:close-confirm'?'close':action==='ticket:delete-confirm'?'delete':action.slice(7);
        if(method==='delete'){
          await tickets.act('delete',interaction.channel_id,user,interaction.id,{beforeDelete:()=>api.reply(interaction,{...responseMessage('Deleting this ticket. No transcript will be created.'),components:[],embeds:[]})});return;
        }
        result=responseMessage(await tickets.act(method,interaction.channel_id,user,interaction.id));
      }else throw new BotError(400,'That action is not available.');
      await api.reply(interaction,{...result,components:result.components??[],embeds:result.embeds??[]});
    }catch(e){
      const message=e instanceof BotError||e instanceof LicenseError?e.message:'This action could not be completed. Try again shortly.';
      try{await api.reply(interaction,{...responseMessage(message),components:[],embeds:[]});}catch{}
    }
  }
  return async(req,res)=>{
    const end=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='POST')return end(405,{error:'POST required.'});
    let interaction;
    try{
      const raw=await readAlertBody(req,32768);
      if(!verifyDiscord(raw,req.headers['x-signature-timestamp'],req.headers['x-signature-ed25519'],publicKey,now()))return end(401,{error:'Invalid Discord signature.'});
      interaction=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }catch{return end(400,{error:'Invalid interaction body.'});}
    if(interaction.application_id&&interaction.application_id!==botIds.app)return end(401,{error:'Wrong application.'});
    if(interaction.type===1){schedule(Promise.resolve().then(onPing).catch(()=>{}));return end(200,{type:1});}
    if(![2,3,5].includes(interaction.type))return end(400,{error:'Unsupported interaction type.'});
    if(!snowflake(guildId)||interaction.guild_id!==guildId)return end(200,ephemeral('This bot is only available in the Neoperro server.'));
    const member=interaction.member,user={id:member?.user?.id,roles:member?.roles};
    if(!snowflake(user.id)||!Array.isArray(user.roles)||user.roles.some(id=>!snowflake(id))||!snowflake(interaction.id)||!snowflake(interaction.channel_id))return end(400,{error:'Invalid member context.'});
    let action=interaction.data?.custom_id;
    if(interaction.type===2){
      if(interaction.data?.name==='neoperro')action='panel';
      else if(interaction.data?.name==='ticket'){
        const method=interaction.data.options?.[0]?.name??'open';
        action=method==='open'?'ticket:open':'ticket:'+method;
      }else return end(200,ephemeral('Unknown command.'));
    }
    if(typeof action!=='string'||action.length>100)return end(400,{error:'Invalid action.'});
    if(interaction.type===3&&action==='license:link')return end(200,linkModal());
    if(action==='ticket:open'&&interaction.type===2)return end(200,ticketModal());
    if(interaction.type===3&&action==='ticket:category'){
      const category=interaction.data.values?.[0];
      if(!['general','license','bug'].includes(category)||interaction.data.values.length!==1)return end(400,{error:'Invalid ticket category.'});
      return end(200,ticketModal(category));
    }
    if(['ticket:delete','ticket:delete-confirm'].includes(action)&&user.id!==ownerId&&!user.roles.includes(botIds.supportRole))return end(200,ephemeral('Only the support team can delete tickets.'));
    if(interaction.type!==5&&['license:reset','ticket:close','ticket:delete'].includes(action))return end(200,{type:4,data:{flags:64,...confirm(action==='license:reset'?'reset':action==='ticket:delete'?'delete':'close')}});
    const valid=action==='panel'||['license:status','license:key','license:script','license:reset-confirm','ticket:claim','ticket:reopen','ticket:transcript','ticket:close-confirm','ticket:delete-confirm'].includes(action)||interaction.type===5&&['license:link-submit','ticket:create:general','ticket:create:license','ticket:create:bug'].includes(action)||/^owner:license:\d{1,16}$/.test(action);
    if(!valid)return end(200,ephemeral('That action is not available.'));
    if(action.startsWith('owner:')&&user.id!==ownerId)return end(200,ephemeral('This action is restricted to the owner.'));
    schedule(work(interaction,user,action));
    return end(200,{type:5,data:{flags:64}});
  };
}
