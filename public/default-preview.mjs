import {luaTable,withWebDefaults} from './config.mjs';

const code=document.querySelector('#default-lua');
const files=document.querySelector('#default-files');
const scope=document.querySelector('#default-scope');
const search=document.querySelector('#default-search');
const groups={core:['Intro','Web configs','Checks','Y-Axis','Resolver'],
  aim:['Silent Aim','Aim Assist','Triggerbot'],visuals:['ESP','2d-Box','Whitelist','Client Bullets']};
const labels={core:'Core settings',aim:'Aim settings',visuals:'Visual settings',all:'Full default table'};
let defaults;
const tokens=/("(?:\\.|[^"\\])*"|\b(?:true|false|nil)\b|\b\d+(?:\.\d+)?\b)/g;
function appendLine(line){
  const row=document.createElement('span');row.className='lua-line';
  let index=0;
  for(const match of line.matchAll(tokens)){
    row.append(document.createTextNode(line.slice(index,match.index)));
    const token=document.createElement('span');
    token.className=match[0][0]==='"'?'lua-string':/^[\d]/.test(match[0])?'lua-number':'lua-boolean';
    token.textContent=match[0];row.append(token);index=match.index+match[0].length;
  }
  row.append(document.createTextNode(line.slice(index)));return row;
}
function show(section,key){
  const names=key?[key]:section==='all'?Object.keys(defaults):groups[section];
  const selected=Object.fromEntries(names.filter(name=>Object.hasOwn(defaults,name)).map(name=>[name,defaults[name]]));
  const fragment=document.createDocumentFragment();
  for(const line of ('getgenv()["neoperro"] = '+luaTable(selected)+';').split('\n'))fragment.append(appendLine(line));
  code.replaceChildren(fragment);code.parentElement.scrollTop=0;code.firstElementChild.classList.add('lua-active-line');
  scope.textContent=key??labels[section];
  for(const button of document.querySelectorAll('[data-default-section]'))button.setAttribute('aria-pressed',String(!key&&button.dataset.defaultSection===section));
  for(const button of files.children)button.setAttribute('aria-current',String(button.textContent===key));
  code.classList.remove('code-enter');void code.offsetWidth;code.classList.add('code-enter');
}
search.addEventListener('input',()=>{
  const query=search.value.trim().toLowerCase();
  for(const button of files.children)button.hidden=!button.textContent.toLowerCase().includes(query);
});
code.addEventListener('click',event=>{
  const line=event.target.closest('.lua-line');
  if(!line)return;
  code.querySelector('.lua-active-line')?.classList.remove('lua-active-line');
  line.classList.add('lua-active-line');
});
async function mountDefaults(){
  const response=await fetch('/config-schema.json');
  if(!response.ok)throw Error('Default config unavailable');
  defaults=withWebDefaults((await response.json()).defaults);
  for(const key of Object.keys(defaults)){
    const button=document.createElement('button');button.type='button';button.textContent=key;button.setAttribute('aria-label',key);
    button.addEventListener('click',()=>show(null,key));files.append(button);
  }
  for(const button of document.querySelectorAll('[data-default-section]'))button.addEventListener('click',()=>show(button.dataset.defaultSection));
  code.addEventListener('copy',event=>event.preventDefault());
  code.addEventListener('dragstart',event=>event.preventDefault());
  show('core');
}
mountDefaults().catch(()=>{
  code.textContent='Default settings are temporarily unavailable. Refresh to try again.';
  scope.textContent='Preview unavailable';
});
