import panel from './panel.mjs';

export default async function handler(req,res){
  const url=new URL(req.url,'https://www.fosternya.xyz');
  const route=url.searchParams.get('route')||url.pathname.split('/').at(-1);
  url.searchParams.delete('route');
  return panel({method:req.method,headers:req.headers,body:req.body,url:'/api/auth/'+route+url.search},res);
}
