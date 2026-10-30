import * as oauth from 'oauth4webapi';

const issuer='https://discord.com';
const server={issuer,authorization_endpoint:issuer+'/oauth2/authorize',token_endpoint:issuer+'/api/oauth2/token',revocation_endpoint:issuer+'/api/oauth2/token/revoke'};

export function createDiscordProvider({clientId,clientSecret,fetcher=fetch}) {
  const client={client_id:clientId};
  const authentication=oauth.ClientSecretPost(clientSecret);
  const transport=async(url,options)=>{
    if(![server.token_endpoint,server.revocation_endpoint,issuer+'/api/v10/users/@me'].includes(String(url)))throw Error('Unexpected identity endpoint.');
    return fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(String(url)===server.revocation_endpoint?3000:8000)});
  };
  const options={[oauth.customFetch]:transport};
  return {
    async authorizationURL(state,verifier,redirectUri){
      const url=new URL(server.authorization_endpoint);
      url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:'identify',state,code_challenge:await oauth.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
      return url.href;
    },
    async exchange(url,state,verifier,redirectUri){
      const params=oauth.validateAuthResponse(server,client,url,state);
      const response=await oauth.authorizationCodeGrantRequest(server,client,authentication,params,redirectUri,verifier,options);
      const tokens=await oauth.processAuthorizationCodeResponse(server,client,response);
      try{
        if(tokens.scope&&tokens.scope!=='identify')throw Error('Unexpected identity permissions.');
        const response=await transport(issuer+'/api/v10/users/@me',{headers:{Authorization:'Bearer '+tokens.access_token}});
        if(!response.ok||Number(response.headers.get('content-length'))>16384)throw Error('Identity unavailable.');
        const user=await response.json();
        if(!/^\d{17,20}$/.test(user.id)||typeof user.username!=='string'||!user.username.length||user.username.length>32||user.bot||/[\x00-\x1f]/.test(user.username))throw Error('Invalid identity.');
        const displayName=typeof user.global_name==='string'&&user.global_name.length&&user.global_name.length<=64?user.global_name:user.username;
        const avatarUrl=typeof user.avatar==='string'&&/^(a_)?[a-f0-9]{32}$/.test(user.avatar)?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=80`:`https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id)>>22n)%6n)}.png`;
        return {id:user.id,username:user.username,displayName,avatarUrl};
      }finally{
        try{await oauth.revocationRequest(server,client,authentication,tokens.access_token,options);}catch{}
      }
    }
  };
}
