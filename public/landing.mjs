const intro=document.querySelector('#intro');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let dismissed=false;
function dismiss(){if(dismissed)return;dismissed=true;intro.classList.add('dismissed');document.body.classList.add('intro-complete');setTimeout(()=>intro.remove(),700);}
document.querySelector('#skip-intro').addEventListener('click',dismiss);
document.addEventListener('keydown',event=>{if(event.key==='Escape'||event.key==='Enter')dismiss();},{once:true});
if(reduced)dismiss();else setTimeout(dismiss,2900);
