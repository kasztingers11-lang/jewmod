import {BotError,botIds} from './discord-bot-api.mjs';
import {providerJson} from './provider-format.mjs';

export const gameRegistryOwner='1220900739325362328';
export const gameRegistryRepository='kasztingers11-lang/Neoperro';
export const gameRegistryPath='registry.json';
export const gameChoices=[['Da Strike','da-strike'],['Da Uphill','da-uphill'],['Da Uphill 2','da-uphill-2'],['Da Downhill','da-downhill'],['Da Hood','da-hood']];
const fail=(status,message)=>{throw new BotError(status,message);};
const id=value=>typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
const word=value=>typeof value==='string'&&value.length>0&&value.length<=80&&!/[\x00-\x1f\x7f]/.test(value);
const list=(value,limit=16)=>Array.isArray(value)&&value.length>0&&value.length<=limit&&value.every(word);

export function validateGameRegistry(value){
  if(!value||value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<1||!value.games||Array.isArray(value.games)||typeof value.games!=='object')fail(503,'The game registry is invalid; no changes were saved.');
  const entries=Object.entries(value.games),seen=new Set();
  if(!entries.length||entries.length>32)fail(503,'The game registry is invalid; no changes were saved.');
  for(const [slug,game] of entries){
    if(!/^[a-z][a-z0-9-]{0,39}$/.test(slug)||!game||!word(game.name)||!Array.isArray(game.placeIds)||!game.placeIds.length||game.placeIds.length>32)fail(503,'The game registry is invalid; no changes were saved.');
    for(const place of game.placeIds){if(!id(place)||seen.has(place))fail(503,'Place IDs must be unique in the game registry.');seen.add(place);}
    const transport=game.transport;
    if(!transport||!['mouse-remote','aim-module'].includes(transport.kind))fail(503,'Unknown game transport; no changes were saved.');
    if(transport.kind==='mouse-remote'&&(!list(transport.remoteNames)||!word(transport.action)))fail(503,'Invalid remote profile.');
    if(transport.kind==='aim-module'&&(!list(transport.modulePath,8)||!word(transport.method)))fail(503,'Invalid aim module profile.');
    const weapons=game.weapons,environment=game.environment;
    if(!weapons||!list(weapons.ammoNames)||!list(weapons.ignoredNames)||!weapons.aliases||typeof weapons.aliases!=='object'||Array.isArray(weapons.aliases)||Object.entries(weapons.aliases).length>128||!Object.entries(weapons.aliases).every(([key,value])=>word(key)&&word(value)))fail(503,'Invalid weapons profile.');
    if(!environment||!word(environment.effects)||!['koValues','deadValues','reloadValues','crewPath','animationPath'].every(key=>list(environment[key],8)))fail(503,'Invalid environment profile.');
  }
  return value;
}

export function gameCommandOptions(data){
  const options=data?.options;
  if(!Array.isArray(options)||options.length!==2||options.some(o=>!o||o.type!==3||!['game','id'].includes(o.name))||new Set(options.map(o=>o.name)).size!==2)fail(400,'Use /gameid game:<game> id:<place ID>.');
  const game=options.find(o=>o.name==='game').value,placeId=options.find(o=>o.name==='id').value;
  if(!gameChoices.some(([,slug])=>slug===game)||!id(placeId))fail(400,'Choose a supported game and enter a valid numeric place ID.');
  return {game,placeId};
}

export function createGameRegistryService({token,fetcher=fetch}){
  const credential=typeof token==='string'?token.trim():'';
  const url='https://api.github.com/repos/'+gameRegistryRepository+'/contents/'+gameRegistryPath;
  async function request(method,body){
    if(!credential)fail(503,'Game ID updates need NEOPERRO_GAME_REGISTRY_TOKEN configured on the server.');
    if(!/^[A-Za-z0-9_-]{20,255}$/.test(credential))fail(503,'The registry token has invalid formatting. Save only the generated token value in Vercel, without quotes or extra text.');
    let response;
    try{response=await fetcher(url+(method==='GET'?'?ref=main':''),{method,headers:{accept:'application/vnd.github+json',authorization:'Bearer '+credential,'x-github-api-version':'2022-11-28','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch(error){
      const name=['TypeError','TimeoutError','AbortError','Error'].includes(error?.name)?error.name:'Error';
      const rawCode=error?.cause?.code??error?.code;
      const code=typeof rawCode==='string'&&/^[A-Z_]{1,40}$/.test(rawCode)?rawCode:'UNKNOWN';
      console.warn('neoperro-registry-fetch',JSON.stringify({method,name,code}));
      fail(503,name==='TimeoutError'?'GitHub timed out. No update was confirmed.':method==='GET'?'GitHub connection failed ('+code+'). No changes were sent.':'GitHub could not confirm the write ('+code+'). Check the registry before retrying.');
    }
    if(response.status===409||response.status===422){await response.body?.cancel();return {conflict:true};}
    if(!response.ok){await response.body?.cancel();fail(503,[401,403].includes(response.status)?'The registry token needs Contents write access to the Neoperro repository.':'GitHub could not complete the registry request.');}
    try{return await providerJson(response,262144);}catch{fail(503,'GitHub returned an invalid registry response.');}
  }
  return {async update({userId,guildId,game,placeId}){
    if(userId!==gameRegistryOwner||guildId!==botIds.guild)fail(403,'Only the Neoperro owner can change game IDs.');
    if(!gameChoices.some(([,slug])=>slug===game)||!id(placeId))fail(400,'Choose a supported game and enter a valid numeric place ID.');
    for(let attempt=0;attempt<3;attempt++){
      const file=await request('GET');
      if(file.conflict||file.type!=='file'||file.path!==gameRegistryPath||file.encoding!=='base64'||typeof file.sha!=='string'||!/^[a-f0-9]{40}$/.test(file.sha)||typeof file.content!=='string'||file.content.length>180000)fail(503,'The game registry file could not be verified.');
      let registry;try{registry=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));}catch{fail(503,'The game registry could not be read.');}
      validateGameRegistry(registry);
      const profile=registry.games[game];if(!profile)fail(400,'This game has no profile in the registry.');
      for(const [slug,item] of Object.entries(registry.games))if(slug!==game&&item.placeIds.includes(placeId))fail(409,'That place ID already belongs to another game profile.');
      const previous=[...profile.placeIds];
      if(previous.length===1&&previous[0]===placeId)return {changed:false,name:profile.name,placeId,previous};
      profile.placeIds=[placeId];registry.revision++;
      validateGameRegistry(registry);
      const saved=await request('PUT',{message:'Update '+game+' place ID',branch:'main',sha:file.sha,content:Buffer.from(JSON.stringify(registry,null,2)+'\n').toString('base64')});
      if(saved.conflict)continue;
      if(!/^[a-f0-9]{40}$/.test(saved.commit?.sha??''))fail(503,'GitHub did not confirm a commit. Check the registry before retrying.');
      return {changed:true,name:profile.name,placeId,previous,commit:saved.commit.sha};
    }
    fail(409,'The registry changed while saving. Try again; other profiles were preserved.');
  }};
}

