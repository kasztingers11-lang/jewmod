export function mountAnnouncements(){
  const banner=document.createElement('aside'),content=document.createElement('div'),label=document.createElement('span'),message=document.createElement('p'),close=document.createElement('button');
  banner.className='site-announcement';banner.hidden=true;banner.setAttribute('aria-label','Site announcement');
  content.className='announcement-content';label.className='announcement-mark';label.textContent='neoperro';
  close.type='button';close.className='announcement-close';close.textContent='×';close.setAttribute('aria-label','Dismiss announcement');
  content.append(label,message,close);banner.append(content);document.body.prepend(banner);
  let loading=false,previous='',dismissed=null,revision=null;
  const size=()=>document.documentElement.style.setProperty('--announcement-height',banner.hidden?'0px':banner.getBoundingClientRect().height+'px');
  if('ResizeObserver'in window)new ResizeObserver(size).observe(banner);
  async function refresh(){
    if(loading||document.hidden)return;loading=true;
    try{
      const response=await fetch('/api/panel?action=announcements',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(7000)});
      if(!response.ok)return;
      const data=await response.json(),next=data.announcement;
      const value=next&&(!next.expiresAt||next.expiresAt>Date.now())&&typeof next.message==='string'?next.message.slice(0,240):'';
      if(value!==previous||revision!==data.revision){previous=value;revision=data.revision;message.textContent=value;banner.hidden=!value||dismissed===revision;size();}
    }catch{}finally{loading=false;}
  }
  close.addEventListener('click',()=>{dismissed=revision;banner.hidden=true;size();});
  refresh();setInterval(refresh,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('neoperro-announcement-updated',refresh);
}
