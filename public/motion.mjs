const preference=matchMedia('(prefers-reduced-motion: reduce)');
const targets=document.querySelectorAll('[data-reveal]');
if(!preference.matches&&'IntersectionObserver' in window){
  document.documentElement.classList.add('motion-ready');
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  },{threshold:.08});
  for(const target of targets)observer.observe(target);
  preference.addEventListener('change',()=>{
    if(preference.matches){observer.disconnect();document.documentElement.classList.remove('motion-ready');}
  });
}
