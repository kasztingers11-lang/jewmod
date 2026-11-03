export function collectionRows(payload,kind){
  let visited=0;
  function walk(value,depth){
    if(++visited>100||depth>5)return null;
    if(Array.isArray(value))return value.slice(0,200);
    if(!value||typeof value!=='object')return null;
    for(const name of [kind,'items','results','records','entries','data']){
      if(Object.hasOwn(value,name)){const rows=walk(value[name],depth+1);if(rows)return rows;}
    }
    return null;
  }
  return walk(payload,0);
}

export async function providerJson(response,limit=2097152){
  if(Number(response.headers.get('content-length'))>limit)throw Error('Provider response too large.');
  const reader=response.body?.getReader();if(!reader)throw Error('Provider response is empty.');
  const parts=[];let bytes=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;
    if(bytes>limit){await reader.cancel();throw Error('Provider response too large.');}
    parts.push(value);
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}

export function advertisedOperations(contract){
  const found=[],seen=new Set();let budget=5000;
  function add(method,path,definition){
    method=typeof method==='string'?method.toUpperCase():'';
    if(method!=='GET'||typeof path!=='string'||!path.startsWith('/v1/')||path.length>180)return;
    const key=method+' '+path;if(seen.has(key))return;seen.add(key);found.push({method,path,definition});
  }
  function walk(value,depth){
    if(--budget<0||depth>8||!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const row of value)walk(row,depth+1);return;}
    add(value.method??value.http_method,value.path??value.endpoint,value);
    for(const [key,child]of Object.entries(value)){
      if(key.startsWith('/v1/')&&child&&typeof child==='object')for(const [method,definition]of Object.entries(child))add(method,key,definition);
      walk(child,depth+1);
    }
  }
  walk(contract,0);return found;
}

export function collectionRoute(contract,kind,projectId){
  if(!['keys','logs'].includes(kind))return null;
  const operations=advertisedOperations(contract);
  const scoped=operations.find(row=>new RegExp('^/v1/projects/(?:\\{[A-Za-z_][A-Za-z0-9_]*\\}|'+projectId+')/'+kind+'$').test(row.path));
  if(scoped)return scoped.path.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/,String(projectId));
  const global=operations.find(row=>row.path==='/v1/'+kind&&hasProjectQuery(row.definition));
  return global?global.path+'?project_id='+projectId:null;
}

function hasProjectQuery(value){
  if(!value||typeof value!=='object')return false;
  if(Array.isArray(value.parameters)&&value.parameters.some(row=>row?.in==='query'&&row.name==='project_id'))return true;
  for(const field of ['query','query_params','query_parameters']){
    const query=value[field];
    if(Array.isArray(query)&&query.some(row=>row==='project_id'||row?.name==='project_id'))return true;
    if(query&&typeof query==='object'&&!Array.isArray(query)&&(Object.hasOwn(query,'project_id')||Object.hasOwn(query.properties??{},'project_id')))return true;
  }
  return false;
}
