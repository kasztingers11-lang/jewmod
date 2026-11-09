import {mountAnnouncements} from './announcements.mjs';
mountAnnouncements();
const intro=document.querySelector('#intro');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let dismissed=false;
function dismiss(){if(dismissed)return;dismissed=true;intro.classList.add('dismissed');document.body.classList.add('intro-complete');setTimeout(()=>intro.remove(),1000);}
document.querySelector('#skip-intro').addEventListener('click',dismiss);
document.addEventListener('keydown',event=>{if(event.key==='Escape'||event.key==='Enter')dismiss();},{once:true});
if(reduced)dismiss();else setTimeout(dismiss,3400);

const updates=document.querySelector('#updates-dialog');
const updatesButton=document.querySelector('#open-updates');
updatesButton.addEventListener('click',()=>updates.showModal());
document.querySelector('#close-updates').addEventListener('click',()=>updates.close());
updates.addEventListener('close',()=>updatesButton.focus());

const featureTable = document.querySelector('.feature-table');
featureTable.addEventListener('copy', event => event.preventDefault());
featureTable.addEventListener('dragstart', event => event.preventDefault());

if (!reduced && 'IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) continue;
      target.classList.add('section-enter');
      reveal.unobserve(target);
    }
  }, {threshold: .12});
  document.querySelectorAll('.redesign-section').forEach(section => reveal.observe(section));
}
