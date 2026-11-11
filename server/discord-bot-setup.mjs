import {Conflict} from './store.mjs';
import {BotError,botIds,botSetupPath,snowflake,botFail,channelPermissions,privateLogChannel} from './discord-bot-api.mjs';
import {readAlertBody,verifyFlowAuth} from './license-alerts.mjs';
import {commands,licensePanel,supportPanel} from './discord-bot-views.mjs';

export function createBotSetup({store,secret,api,origin,guildId,ownerId,tickets,now=Date.now}){
  async function update(fn){
    for(let i=0;i<5;i++){
      const row=await store.read(botSetupPath),data=row?.data??{kind:'discord-bot-setup'};const result=fn(data);
      try{await store.write(botSetupPath,data,row?.etag);return result;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    botFail(409,'Bot setup changed. Try again.');
  }
  async function inspect(){
    const [app,bot,panel,support,logs]=await Promise.all([api.request('/applications/@me'),api.request('/users/@me'),api.request('/channels/'+botIds.panel),api.request('/channels/'+botIds.support),api.request('/channels/'+botIds.logs)]);
    if(app.id!==botIds.app||app.verify_key!==botIds.publicKey)botFail(503,'The bot token does not match the supplied Neoperro application and public key.');
    const allowed=panel.guild_id;
    if(!snowflake(allowed)||support.guild_id!==allowed||logs.guild_id!==allowed||guildId&&guildId!==allowed)botFail(503,'The configured channels do not belong to the allowed server.');
    if(![0,5].includes(panel.type)||support.type!==0||![0,5].includes(logs.type))botFail(503,'Panel, support and logs must be text channels.');
    const [roles,member]=await Promise.all([api.request('/guilds/'+allowed+'/roles'),api.request('/guilds/'+allowed+'/members/'+bot.id)]);
    if(!roles.some(r=>r.id===botIds.supportRole))botFail(503,'The support role is not in this server.');
    const saved=(await store.read(botSetupPath))?.data;
    const category=saved?.categoryId?await api.request('/channels/'+saved.categoryId):null;
    const permissions=channelPermissions(roles,member,category??support,allowed);
    return {app,bot,roles,member,allowed,category,
      public:{appId:app.id,botId:bot.id,guildId:allowed,publicBot:app.bot_public,messageContentEnabled:!!(app.flags&((1<<18)|(1<<19))),
        logsPrivate:privateLogChannel(roles,logs,allowed,botIds.supportRole,member.roles,[bot.id,ownerId]),
        categoryId:category?.id??null,canManageTickets:!!(permissions&16n),canLockTickets:!!(permissions&268435456n),
        interactionsConfigured:app.interactions_endpoint_url===origin+'/api/discord-bot',panelPosted:!!saved?.panelMessageId,supportPosted:!!saved?.supportMessageId}};
  }
  async function panelMessage(channelId,message,id,botId,marker,nonce){
    if(!id){
      const recent=await api.request('/channels/'+channelId+'/messages?limit=100');
      id=recent.find(m=>m.author?.id===botId&&(m.components??[]).some(r=>(r.components??[]).some(c=>c.custom_id===marker)))?.id;
    }
    if(id){await api.edit(channelId,id,message);return id;}
    const posted=await api.post(channelId,message,nonce);if(!snowflake(posted?.id))botFail(503,'Panel message could not be confirmed.');return posted.id;
  }
  return async(req,res)=>{
    const end=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='POST')return end(405,{error:'POST required.'});
    try{
      const raw=await readAlertBody(req,1024);
      if(!verifyFlowAuth(raw,req.headers['x-neoperro-setup-timestamp'],req.headers['x-neoperro-setup-signature'],secret,now()))return end(401,{error:'Invalid setup signature.'});
      let input;try{input=JSON.parse(raw.toString('utf8'));}catch{return end(400,{error:'Invalid JSON.'});}
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['inspect','configure','test-ticket'].includes(input.action))return end(400,{error:'Invalid setup action.'});
      if(!store||!snowflake(ownerId))botFail(503,'Private storage or owner identity is not configured.');
      const info=await inspect();
      if(input.action==='inspect')return end(200,info.public);
      if(info.app.bot_public!==false)botFail(409,'Turn Public Bot off in the Developer Portal before finishing setup.');
      if(guildId!==info.allowed)botFail(409,'Set DISCORD_BOT_GUILD_ID to the inspected server ID and redeploy first.');
      if(input.action==='test-ticket'){
        if(!info.public.canLockTickets)botFail(409,'Grant the bot Manage Permissions in the ticket category before the close/reopen test.');
        const interactionId=String((BigInt(now())-1420070400000n)<<22n);
        const user={id:ownerId,roles:[]};
        const ticket=await tickets.open(user,{category:'general',title:'Bot setup test',description:'Controlled setup test. No customer data is included.',interactionId});
        if(ticket.existing)return end(409,{error:'The owner already has an open ticket. It was left unchanged.',channelId:ticket.channelId});
        await tickets.act('claim',ticket.channelId,user,String(BigInt(interactionId)+1n));
        await tickets.act('close',ticket.channelId,user,String(BigInt(interactionId)+2n));
        return end(200,{created:true,claimed:true,closed:true,transcriptSaved:true,channelId:ticket.channelId});
      }
      if(!info.public.logsPrivate)botFail(409,'Restrict the logs channel to staff before enabling transcripts and alerts.');
      let saved=(await store.read(botSetupPath))?.data;
      let categoryId=saved?.categoryId;
      if(!categoryId){
        await update(data=>{if(data.categoryId){categoryId=data.categoryId;return;}if(data.creatingCategory)botFail(409,'Category creation was already attempted. Inspect Discord before retrying.');data.creatingCategory=true;});
        if(!categoryId){
          const category=await api.request('/guilds/'+guildId+'/channels',{method:'POST',body:{name:'neoperro tickets',type:4,permission_overwrites:[{id:guildId,type:0,allow:'0',deny:'1024'},{id:botIds.supportRole,type:0,allow:'117760',deny:'0'},{id:info.bot.id,type:1,allow:'117776',deny:'0'}]}});
          if(!snowflake(category?.id)||category.guild_id!==guildId)botFail(503,'The ticket category could not be verified.');
          categoryId=category.id;await update(data=>{data.categoryId=categoryId;data.botId=info.bot.id;data.guildId=guildId;delete data.creatingCategory;});
        }
      }
      await api.request('/applications/'+botIds.app+'/guilds/'+guildId+'/commands',{method:'PUT',body:commands});
      await api.request('/applications/@me',{method:'PATCH',body:{interactions_endpoint_url:origin+'/api/discord-bot',custom_install_url:'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:botIds.app,scope:'bot applications.commands',permissions:'117776',guild_id:guildId,disable_guild_select:'true'}),integration_types_config:{'0':{oauth2_install_params:{scopes:['bot','applications.commands'],permissions:'117776'}}}}});
      saved=(await store.read(botSetupPath))?.data;
      const panelId=await panelMessage(botIds.panel,licensePanel(),saved?.panelMessageId,info.bot.id,'license:link','neoperro-license-panel');
      await update(data=>{data.panelMessageId=panelId;});
      const supportId=await panelMessage(botIds.support,supportPanel(),saved?.supportMessageId,info.bot.id,'ticket:category','neoperro-support-panel');
      await update(data=>{data.supportMessageId=supportId;data.configuredAt=now();});
      return end(200,{configured:true,guildId,categoryId,panelMessageId:panelId,supportMessageId:supportId,interactionsEndpoint:origin+'/api/discord-bot'});
    }catch(e){return end(e instanceof BotError?e.status:503,{error:e instanceof BotError?e.message:'Bot setup is temporarily unavailable.'});}
  };
}
