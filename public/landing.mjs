import './motion.mjs';
import './default-preview.mjs';

const intro=document.querySelector('#intro');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let dismissed=false;
function dismiss(){
  if(dismissed)return;
  dismissed=true;intro.classList.add('dismissed');intro.inert=true;
  document.body.classList.add('intro-complete');
  setTimeout(()=>intro.remove(),500);
}
document.querySelector('#skip-intro').addEventListener('click',dismiss);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dismissed)dismiss();});
if(reduced||location.hash){intro.remove();document.body.classList.add('intro-complete');}
else{intro.hidden=false;setTimeout(dismiss,1950);}

const updates=document.querySelector('#updates-dialog');
const updatesButton=document.querySelector('#open-updates');
updatesButton.addEventListener('click',()=>updates.showModal());
document.querySelector('#close-updates').addEventListener('click',()=>updates.close());
updates.addEventListener('close',()=>updatesButton.focus());

const showcase=document.querySelector('#showcase-chart');
const chartModes=[...showcase.querySelectorAll('[data-chart-mode]')];
const charts=[
  ['Movement prediction','Illustrative observed and predicted movement','TIME','Observed path','Predicted path','Prediction projects recent movement forward.'],
  ['Aim calibration','Illustrative change in aim tracking error','RECENT SAMPLES','Tracking error','Rolling average','Lower error means the aim point is closer to the target.'],
  ['Mouse response','Illustrative aim correction at different mouse speeds','MOUSE SPEED','Light correction','Correction strength','Correction eases off during fast flicks.'],
];
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const pauseMotion=document.querySelector('#pause-motion');
function syncMotionControl(){pauseMotion.hidden=motionPreference.matches;}
syncMotionControl();
motionPreference.addEventListener('change',syncMotionControl);
pauseMotion.addEventListener('click',()=>{
  const paused=document.body.classList.toggle('ambient-paused');
  pauseMotion.setAttribute('aria-pressed',String(paused));
  pauseMotion.setAttribute('aria-label',paused?'Resume ambient animation':'Pause ambient animation');
  pauseMotion.firstElementChild.textContent=paused?'▶':'Ⅱ';
});
const autoButton=document.querySelector('#chart-autoplay');
let chartIndex=0, autoPaused=false, rotation;
function showChart(index){
  chartIndex=index;
  const [heading,title,axis,reference,signal,caption]=charts[index];
  document.querySelector('#showcase-heading').textContent=heading;
  document.querySelector('#preview-chart-title').textContent=title;
  document.querySelector('#chart-axis').textContent=axis;
  document.querySelector('#chart-reference').textContent=reference;
  document.querySelector('#chart-signal-label').textContent=signal;
  document.querySelector('#chart-caption').textContent='Sample data. '+caption;
  chartModes.forEach((button,i)=>{
    const active=i===index, plot=showcase.querySelector('[data-chart="'+button.dataset.chartMode+'"]');
    button.setAttribute('aria-pressed',String(active));
    plot.classList.toggle('is-current',active);
    plot.setAttribute('aria-hidden',String(!active));
  });
}
function scheduleChart(){
  clearInterval(rotation);
  autoButton.hidden=motionPreference.matches;
  if(!autoPaused&&!motionPreference.matches&&!document.hidden){
    rotation=setInterval(()=>{
      if(!showcase.matches(':hover, :focus-within'))showChart((chartIndex+1)%charts.length);
    },6000);
  }
}
chartModes.forEach((button,index)=>button.addEventListener('click',()=>{showChart(index);scheduleChart();}));
autoButton.addEventListener('click',()=>{
  autoPaused=!autoPaused;
  autoButton.textContent=autoPaused?'Resume rotation':'Pause rotation';
  autoButton.setAttribute('aria-pressed',String(autoPaused));
  scheduleChart();
});
motionPreference.addEventListener('change',scheduleChart);
document.addEventListener('visibilitychange',scheduleChart);
scheduleChart();
