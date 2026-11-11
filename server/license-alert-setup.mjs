import {Conflict} from './store.mjs';
import {AlertError,alertEvents,verifyFlowAuth,readAlertBody} from './license-alerts.mjs';
import {providerJson} from './provider-format.mjs';

const path='license-alert-setup-v1/6147.json';
export async function recordWebhookTest(store,now=Date.now){
  for(let i=0;i<5;i++){
    const row=await store.read(path),data=row?.data??{kind:'license-alert-setup'};
    data.testReceivedAt=now();
    try{await store.write(path,data,row?.etag);return;}catch(e){if(!(e instanceof Conflict))throw e;}
  }
  throw new AlertError(503,'Webhook test storage unavailable.');
}

export function createAlertSetup({store,secret,apiToken,origin,alerts,countryReady=()=>true,fetcher=fetch,now=Date.now}){
  async function request(route,body){
    let response;
    try{response=await fetcher('https://flowauth.net'+route,{method:'POST',headers:{authorization:'Bearer '+apiToken,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new AlertError(503,'Provider request outcome is unknown; inspect existing webhooks before retrying.');}
    if(!response.ok){await response.body?.cancel();throw new AlertError(response.status===429?429:503,'FlowAuth webhook request failed (HTTP '+response.status+').');}
    try{return await providerJson(response,65536);}catch{throw new AlertError(503,'Provider webhook response could not be verified.');}
  }
  return async(req,res)=>{
    const end=(status,body)=>{res.statusCode=status;res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
    if(req.method!=='POST')return end(405,{error:'POST required.'});
    try{
      const raw=await readAlertBody(req,1024);
      if(!verifyFlowAuth(raw,req.headers['x-neoperro-setup-timestamp'],req.headers['x-neoperro-setup-signature'],secret,now()))return end(401,{error:'Invalid setup signature.'});
      let input;try{input=JSON.parse(raw.toString('utf8'));}catch{return end(400,{error:'Invalid JSON.'});}
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['status','configure','test'].includes(input.action))return end(400,{error:'Unsupported setup action.'});
      if(!alerts.configured||!store||typeof apiToken!=='string'||!apiToken)return end(503,{error:'Server-only alert settings are incomplete.'});
      let row=await store.read(path);
      if(input.action==='status')return end(200,{registered:!!row?.data.webhookId,webhookId:row?.data.webhookId??null,testReceivedAt:row?.data.testReceivedAt??null,deliveryConfigured:true,countryLookupReady:countryReady(),baseline:'First successful run per license',events:alertEvents});
      if(input.action==='configure'&&!row?.data.webhookId){
        if(row?.data.provisioning)return end(409,{error:'Registration was already attempted. Check FlowAuth before creating another webhook.'});
        try{await store.write(path,{kind:'license-alert-setup',provisioning:true,attemptedAt:now(),testReceivedAt:row?.data.testReceivedAt??null},row?.etag);}catch(e){if(e instanceof Conflict)return end(409,{error:'Another registration is in progress.'});throw e;}
        const result=await request('/v1/projects/6147/webhooks',{url:origin+'/api/flowauth-alerts',signing_secret:secret,events:alertEvents,enabled:true});
        const details=result?.data?.webhook??result?.webhook??result?.data??result;
        const webhookId=Number(details?.id);
        if(!Number.isSafeInteger(webhookId)||webhookId<1)throw new AlertError(503,'Registration response is unrecognized. Inspect FlowAuth before retrying.');
        for(let i=0;i<5;i++){
          row=await store.read(path);
          try{await store.write(path,{...row.data,provisioning:false,webhookId,registeredAt:now()},row.etag);break;}catch(e){if(!(e instanceof Conflict)||i===4)throw e;}
        }
        return end(200,{registered:true,webhookId});
      }
      if(!row?.data.webhookId)return end(409,{error:'Configure the webhook first.'});
      if(input.action==='test'){
        await alerts.checkDestination();
        await request('/v1/webhooks/'+row.data.webhookId+'/test',{});
        return end(200,{testRequested:true,discordVerified:true,webhookId:row.data.webhookId});
      }
      return end(200,{registered:true,webhookId:row.data.webhookId});
    }catch(e){return end(e instanceof AlertError?e.status:503,{error:e instanceof AlertError?e.message:'Webhook setup unavailable.'});}
  };
}
