export function mountAnnouncements(){
  const banner=document.createElement('aside'),label=document.createElement('span'),message=document.createElement('p');
  banner.className='site-announcement';banner.hidden=true;banner.setAttribute('aria-label','Site announcement');
  label.textContent='Notice';banner.append(label,message);document.body.prepend(banner);
  let loading=false,previous='';
  const size=()=>document.documentElement.style.setProperty('--announcement-height',banner.hidden?'0px':banner.getBoundingClientRect().height+'px');
  if('ResizeObserver'in window)new ResizeObserver(size).observe(banner);
  async function refresh(){
    if(loading||document.hidden)return;loading=true;
    try{
      const response=await fetch('/api/panel?action=announcements',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(7000)});
      if(!response.ok)return;
      const data=await response.json(),next=data.announcement;
      const value=next&&(!next.expiresAt||next.expiresAt>Date.now())&&typeof next.message==='string'?next.message.slice(0,240):'';
      if(value!==previous){previous=value;message.textContent=value;banner.hidden=!value;size();}
    }catch{}finally{loading=false;}
  }
  refresh();setInterval(refresh,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('neoperro-announcement-updated',refresh);
}
