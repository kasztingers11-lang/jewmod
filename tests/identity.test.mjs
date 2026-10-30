import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {MemoryStore} from '../server/store.mjs';

const origin='https://www.fosternya.xyz',clientId='1565654517804957776';
function fixture({licenseToken,licenseFetch,ownerId}={}){
  let time=1793306400000,calls=[];
  const store=new MemoryStore();
  const identityFetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/token'))return Response.json({access_token:'mock-access-token',token_type:'Bearer',expires_in:60,scope:'identify',refresh_token:'mock-refresh-token'});
    if(String(url).endsWith('/users/@me'))return Response.json({id:'123456789012345678',username:'sample',global_name:'Sample User',avatar:'a'.repeat(32),email:'must-not-retain@example.invalid'});
    if(String(url).endsWith('/revoke'))return new Response(null,{status:200});
    throw Error('Unexpected endpoint');
  };
  const app=createApp({store,secret:'test-only-signing-secret-with-adequate-length',origin,now:()=>time,discord:{clientId,clientSecret:'mock-client-secret'},identityFetch,licenseToken,licenseFetch,ownerId});
  const call=async(path,{cookie,method='GET',body,headers={}}={})=>{
    const h=new Headers(headers);if(cookie)h.set('cookie',cookie);
    if(method!=='GET'&&!h.has('origin'))h.set('origin',origin);if(body)h.set('content-type','application/json');
    return app(new Request(origin+path,{method,headers:h,body:body?JSON.stringify(body):undefined}));
  };
  const login=async()=>{const response=await call('/api/auth/login');assert.equal(response.status,303);const url=new URL(response.headers.get('location')),cookie=response.headers.getSetCookie()[0].split(';')[0];return{response,url,cookie};};
  const callback=(login,query={})=>call('/api/auth/callback?'+new URLSearchParams({state:login.url.searchParams.get('state'),code:'mock-code',iss:'https://discord.com',...query}),{cookie:login.cookie});
  return {app,store,calls,call,login,callback,advance:ms=>{time+=ms;}};
}

test('production defaults reject anonymous session creation and profile operations',async()=>{
  const f=fixture();
  assert.equal((await f.call('/api/panel?action=session',{method:'POST',body:{}})).status,401);
  assert.equal((await f.call('/api/panel?action=profile',{method:'POST',body:{}})).status,401);
  const r=await f.call('/api/panel?action=auth');assert.deepEqual(await r.json(),{provider:'discord',configured:true,preview:false});
});

test('Discord login requests identify only, fresh state, S256 PKCE and a host-only ten-minute cookie',async()=>{
  const f=fixture(),a=await f.login(),b=await f.login(),u=a.url;
  assert.equal(u.origin,'https://discord.com');assert.equal(u.searchParams.get('scope'),'identify');
  assert.equal(u.searchParams.get('client_id'),clientId);assert.equal(u.searchParams.get('redirect_uri'),origin+'/api/auth/callback');
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.notEqual(u.searchParams.get('state'),b.url.searchParams.get('state'));
  const c=a.response.headers.getSetCookie()[0];for(const part of ['__Host-neoperro_oauth=','SameSite=Lax','HttpOnly','Secure','Max-Age=600','Path=/'])assert.ok(c.includes(part));
  assert.equal((await f.call('/api/auth/login',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
});

test('callback creates a new 12-hour identity session, keeps only necessary identity fields and discards OAuth tokens',async()=>{
  const f=fixture(),login=await f.login(),res=await f.callback(login);
  assert.equal(res.headers.get('location'),'/dashboard');const cookies=res.headers.getSetCookie();assert.equal(cookies.length,2);
  const cookie=cookies.find(x=>x.startsWith('__Host-neoperro=')).split(';')[0];
  const state=await (await f.call('/api/panel?action=session',{cookie})).json();
  assert.deepEqual(state.user,{id:'123456789012345678',username:'sample',displayName:'Sample User',avatarUrl:'https://cdn.discordapp.com/avatars/123456789012345678/'+ 'a'.repeat(32)+'.png?size=80'});
  const stored=JSON.stringify([...f.store.entries]);for(const value of ['mock-code','mock-access-token','mock-refresh-token','mock-client-secret','must-not-retain'])assert.ok(!stored.includes(value));
  assert.equal(f.calls.length,3);const payload=f.calls[0].options.body;assert.ok(String(payload).includes('code_verifier='));
  assert.equal((await f.callback(login)).headers.get('location'),'/dashboard?auth=failed');
  f.advance(12*3600000);assert.equal((await f.call('/api/panel?action=session',{cookie})).status,401);
});

test('missing, swapped, expired, duplicate and wrong-issuer callbacks cannot create a session',async()=>{
  for(const kind of ['missing','swapped','expired','duplicate','issuer','denied']){
    const f=fixture(),a=await f.login();let res;
    if(kind==='missing')res=await f.call('/api/auth/callback?state='+a.url.searchParams.get('state')+'&code=mock-code');
    if(kind==='swapped'){const b=await f.login();res=await f.call('/api/auth/callback?state='+b.url.searchParams.get('state')+'&code=mock-code',{cookie:a.cookie});}
    if(kind==='expired'){f.advance(600001);res=await f.callback(a);}
    if(kind==='duplicate')res=await f.call('/api/auth/callback?state='+a.url.searchParams.get('state')+'&state=duplicate&code=mock-code',{cookie:a.cookie});
    if(kind==='issuer')res=await f.callback(a,{iss:'https://attacker.invalid'});
    if(kind==='denied')res=await f.callback(a,{error:'access_denied'});
    assert.equal(res.headers.get('location'),'/dashboard?auth=failed',kind);
    assert.ok(!res.headers.getSetCookie().some(x=>x.startsWith('__Host-neoperro=')),kind);
    assert.equal(f.calls.length,0,kind);
  }
});

test('only one concurrent callback consumes a login transaction',async()=>{
  const f=fixture(),a=await f.login(),responses=await Promise.all([f.callback(a),f.callback(a)]);
  assert.equal(responses.filter(x=>x.headers.get('location')==='/dashboard').length,1);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/token')).length,1);
});

test('verified Discord is required but does not bypass license checks or CSRF protections',async()=>{
  const key={id:101,project_id:6147,status:'active',effective_status:'active',claimed_by:null,tier:'premium',paused_at:null,blacklist_id:null,hwidless:false,max_devices:1,hwid_bound:false,hwid_lock:{enabled:true,reset_enabled:true,reset_cooldown_ms:86400000,reset_available_at:null},duration:{state:'lifetime',remaining_ms:null,is_lifetime:true,evaluated_at:1793306400000}};
  const licenseFetch=async(url,options)=>{if(String(url).endsWith('/claim'))key.claimed_by=JSON.parse(options.body).discord_user_id;return Response.json(key);};
  const f=fixture({licenseToken:'mock-license-account-token',licenseFetch}),login=await f.login(),callback=await f.callback(login);
  const cookie=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-neoperro=')).split(';')[0];
  const session=await (await f.call('/api/panel?action=session',{cookie})).json();assert.equal(session.license.status,'unlinked');
  const headers={'x-neoperro-csrf':session.csrf};
  assert.equal((await f.call('/api/panel?action=pair',{cookie,method:'POST',body:{},headers})).status,403);
  assert.equal((await f.call('/api/panel?action=license',{cookie,method:'POST',body:{key:'TEST-ONLY-LICENSE-KEY'}})).status,403);
  assert.equal((await f.call('/api/panel?action=license',{cookie,method:'POST',body:{key:'TEST-ONLY-LICENSE-KEY',discord_user_id:'987654321098765432'},headers})).status,400);
  assert.equal((await f.call('/api/panel?action=license',{cookie,method:'POST',body:{key:'TEST-ONLY-LICENSE-KEY'},headers})).status,200);
  assert.equal(key.claimed_by,session.user.id);
  assert.equal((await f.call('/api/panel?action=pair',{cookie,method:'POST',body:{},headers})).status,200);
  const reveal=await f.call('/api/panel?action=license-reveal',{cookie,method:'POST',body:{},headers});assert.deepEqual(await reveal.json(),{key:'TEST-ONLY-LICENSE-KEY'});
  assert.equal((await f.call('/api/panel?action=license-reveal',{cookie,method:'POST',body:{},headers:{...headers,origin:'https://attacker.invalid'}})).status,403);
  const logout=await f.call('/api/panel?action=session',{cookie,method:'DELETE',headers});assert.equal(logout.status,200);
  assert.equal((await f.call('/api/panel?action=license-reveal',{cookie,method:'POST',body:{},headers})).status,401);
});

test('owner access is bound to the configured Discord ID and cannot be chosen by the client',async()=>{
  for(const ownerId of [undefined,'987654321098765432','123456789012345678']){
    const f=fixture({ownerId,licenseToken:'mock-only-api-token',licenseFetch:async()=>Response.json({operations:[{id:'logs.list',method:'GET',path:'/v1/projects/{project_id}/logs'},{id:'scripts.read',method:'GET',path:'/v1/scripts/{id}'}]})});
    const login=await f.login(),response=await f.callback(login),cookie=response.headers.getSetCookie().find(x=>x.startsWith('__Host-neoperro=')).split(';')[0];
    const result=await f.call('/api/panel?action=owner-contract&ownerId=123456789012345678',{cookie});
    assert.equal(result.status,ownerId==='123456789012345678'?200:403);
    if(result.status===200)assert.deepEqual((await result.json()).operations.map(x=>x.id),['logs.list']);
  }
});
