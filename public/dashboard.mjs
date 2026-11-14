import { clone, choices, validateConfig, withWebDefaults, isCurveOffset } from './config.mjs';
import {mountGunFunctions} from './gun-builder.mjs';
import {initialGunFunctions, validateGunFunctions, exportGunScript} from './gun-functions.mjs';
import {mountCalibration} from './dashboard-calibration.mjs';

const $=selector=>document.querySelector(selector);
const schema=await fetch('/config-schema.json').then(r=>{if(!r.ok)throw Error('Settings unavailable.');return r.json();});
const defaults=schema.defaults;
const order=['Intro','Silent Aim','Triggerbot','Aim Assist','Y-Axis','Resolver','Checks','Anti-AimViewer','Client Bullets','ESP','2d-Box','Whitelist','Gun Specifications','Misc'];
const descriptions={
  'Intro':'Show the intro when you first load the script in a client session.',
  'Silent Aim':'Choose how Silent Aim picks a target, predicts movement and checks the shot.',
  'Triggerbot':'Click when a target passes your checks. Choose the selection area, keybind and timing. The weapon still follows the game cooldown.',
  'Aim Assist':'Follow your selected target with the camera or mouse. Set your keybind, smoothness and prediction here.',
  'Y-Axis':'Control additional vertical compensation. Offset multiplies vertical lead; 1 keeps the calculated lead and 0 removes vertical lead. Disabling this section does not disable ordinary XYZ velocity prediction.',
  'Resolver':'Use measured movement when the reported velocity looks unreliable. TrueVelocity runs automatically when this is enabled.',
  'Checks':'Choose which checks Silent Aim, Aim Assist and Triggerbot should use. Each has its own switch.',
  'Anti-AimViewer':'Restore ordinary mouse coordinates after shot submission. The shared game stream does not provide a universal flick-free guarantee.',
  'Client Bullets':'Route local native bullet effects toward the mouse while retaining the game\u2019s effect style. This affects local presentation, not server damage.',
  'ESP':'Choose which names and outlines you see. These switches control the visuals separately from targeting.',
  '2d-Box':'Character-relative Height and Width define selection geometry. Weapon profiles can override these dimensions; visibility controls the associated drawing.',
  'Whitelist':'Add usernames or user IDs. Friend skips those players; Target only selects them. If none of the assigned players are online, everyone is eligible.',
  'Gun Specifications':'',
  'Misc':'Extra controls for movement, anti-AFK, prefire and shutting the script down.'
};
const help={
  Enabled:'Turn this feature on or off.', Auto:'Let the script choose the prediction baseline. Your manual value is ignored while Auto is on.',
  Value:'Manual baseline in seconds. The runtime still adapts measured movement and ping changes.',
  Holding:'On: hold the key to use it. Off: press once to toggle it.',
  'Unlock Method':'Normal and Repeat choose how the target binding releases or replaces a lock.',
  Raycast:'Use the exact cursor surface hit before prediction; bypass Reduce and Sharpness.',
  Selection:'Part chooses a part center. Point chooses a point within the selected part.',
  Axis:'Center moves the point vertically. All permits movement on X, Y and Z.',
  Sharpness:'Point response between 0 and 1. Larger values follow point changes more quickly.',
  Center:'Reduction toward the center on the Y axis.', All:'Reduction toward the center on every axis.',
  Smoothness:'Response strength for Aim Assist. This does not change weapon cooldown.',
  Offset:'Vertical lead multiplier. 1 keeps the calculated lead; 0 removes it.',
  Character:'Local selection scale when Triggerbot FOV is off. 1 is unchanged; 1.2 is 20% larger.',
  Max:'Maximum 3D AntiCurve deviation in studs.', Radius:'Endmath screen-space radius in pixels.',
  SmartDelay:'Use configured Delay plus a bounded distance-dependent term, rather than the random interval.',
  Delay:'Configured input hold or response time in seconds, depending on the feature.',
  Height:'Character-relative selection height.', Width:'Character-relative selection width.',
  TargetOnly:'Require the configured target-only selection behavior.',
  'Triggerbot check':'Require the Triggerbot conditions for this macro behavior.',
  'Macro Check':'Require the runtime\u2019s measured macro-motion checks.',
  BasePart:'Fallback part used when closest-part selection is disabled or unavailable.'
};
let cached=null;
try{cached=JSON.parse(localStorage.getItem('neoperro.profile.v1'));if(cached){cached.config=withWebDefaults(cached.config);validateConfig(cached.config,defaults);if(cached.gunFunctions)validateGunFunctions(cached.gunFunctions,cached.config,defaults);}}catch{cached=null;}
let draft=clone(cached?.config??defaults),section='Silent Aim',dirty=false,remote=null,csrf=null,expired=false,busy=false,polling=false,toastTimer,identityMode={preview:false,configured:false};
function loadGunFunctions(input, config){
  const result=initialGunFunctions(config);
  for(const [gun,blocks] of Object.entries(validateGunFunctions(input,config,defaults))){
    result[gun]={...result[gun],...blocks};
  }
  return result;
}
let gunFunctions=loadGunFunctions(cached?.gunFunctions,draft);
const gunState={buffers:{},errors:{}};
function resetGunState(){gunState.buffers={};gunState.errors={};gunState.assignments=[];}
function checkedGunFunctions(){
  if(Object.keys(gunState.errors).length)throw Error('Finish the highlighted gun function before saving or exporting.');
  return validateGunFunctions(gunFunctions,draft,defaults);
}
let licenseFeedback='';
let visibleLicense=null,expiryTimer;
if(cached?.name)$('#profile-name').value=cached.name;
const text=(selector,value)=>{$(selector).textContent=value;};
function toast(message){text('#toast',message);$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function notice(message){text('#service-notice',message);$('#service-notice').hidden=!message;}
function setDirty(){dirty=true;text('#editor-status','Unsaved changes');}
function node(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
function getAt(obj,path){return path.reduce((v,k)=>v[k],obj);}
function setAt(obj,path,value){let parent=obj;for(const key of path.slice(0,-1))parent=parent[key];parent[path.at(-1)]=value;}
function runtimeOnline(runtime){
  return runtime?.online===true && Date.now()-(runtime.seenAt??0)<35000;
}
function connectedCalibration(){
  if(expired || !(identityMode.preview||remote?.license?.status==='active') || !runtimeOnline(remote?.runtime))return null;
  return remote.runtime.calibration ? {...remote.runtime.calibration,request:remote.runtime.calibrationRequest} : null;
}
function showView(view){
  if(view==='config')view='configuration';
  if(!['overview','configuration','runtime','license','panel','calibration'].includes(view))view='overview';
  if(view==='calibration'&&connectedCalibration()?.enabled!==true)view='runtime';
  if(remote&&!identityMode.preview&&remote.license?.status!=='active')view='license';
  const previousView=document.body.dataset.activeView;
  document.body.dataset.activeView=view;
  if(previousView!==view)calibrationPanel.show(view==='calibration');
  document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==view);
  document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
  const titles={overview:['Overview','Your saved setup and connection status.'],configuration:['Config','Change what you need, then save. Connected clients receive the update.'],runtime:['Connection','Your client status and latest check-in.'],license:['License','Your license status.'],panel:['Panel','Your script, key and device settings.'],calibration:['Aim Calibration','Choose a timed session and measure your aiming in game.']};
  const [title,description]=titles[view];text('#breadcrumb-view',title);$('#view-title').replaceChildren(document.createTextNode(title),node('span','brand-period','.'));text('#view-description',description);history.replaceState(null,'','#'+(view==='configuration'?'config':view));
  if(view==='calibration'&&previousView!==view&&remote)void poll();
}
document.querySelectorAll('[data-view],[data-go]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view??el.dataset.go)));
window.addEventListener('hashchange',()=>showView(location.hash.slice(1)||'overview'));
const settingLabels={ClearKey:'Clear Key',DelayMethod:'Delay Mode',RandomDelay:'Random Delay',MinMouseSpeed:'Min Speed',FullStrengthSpeed:'Full Speed',MaxCorrectionSpeed:'Max Speed',AntiCurve:'Anti Curve'};
const isRgb=(path,value)=>path.includes('Color')&&Array.isArray(value)&&value.length===3&&value.every(component=>typeof component==='number');
function leafLabel(path){
  const key=path.at(-1),parent=path.at(-2);
  if(/^\d+$/.test(key)){
    if(path[0]==='Checks')return ['Silent Aim','Aim Assist','Triggerbot'][Number(key)];
    if(parent==='Keybind')return ['Keyboard key','Mouse button','Input source'][Number(key)];
    if(parent==='Name')return ['Show name','Name field'][Number(key)];
    if(parent==='RandomDelay')return ['Minimum','Maximum'][Number(key)];
    if(parent==='Box'&&path.includes('Color'))return ['Box Color','Outline'][Number(key)]??key;
  }
  return settingLabels[key]??key;
}
function describe(path){
  const key=path.at(-1);
  if(path[1]==='Aim Calibration'){
    const label=settingLabels[key]??key;
    return {
      Enabled:path.includes('Curve')?'Mouse only: bend the correction using Early, Middle and Late. YTrace turns this bend off.':'Collect aiming samples and unlock the calibration page. Mouse follow also uses the controls below; Camera still uses Smoothness.',
      Strength:'Mouse only: how quickly correction catches up. Higher pulls faster. Camera uses Smoothness instead.',
      'Min Speed':'Mouse only: below this hand speed, correction gently weakens. This is not an on/off threshold. Speed is pixels per second at 1080p.',
      'Full Speed':'Mouse only: above this hand speed, correction starts easing off for fast flicks. Higher keeps the normal pull for faster movement.',
      'Max Speed':'Mouse only: the fastest correction the script can add, in pixels per second at 1080p. Lower is gentler; zero stops it.',
      Early:'Mouse only: bend near 25% progress. Zero is straight; positive and negative bend in opposite directions relative to the move.',
      Middle:'Mouse only: bend near 50% progress. This changes the path shape, not how far ahead a shot is predicted.',
      Late:'Mouse only: bend near 75% progress. The path returns toward the aim point at the end. Keep this small.',
    }[label]??'';
  }
  if(key==='Enabled'&&path.length===2)return '';
  if(path.includes('Keybind'))return path.at(-1)==='2'?'Choose which input the runtime uses.':'Enter a Roblox key name, such as Q or MouseButton2.';
  if(path[0]==='Checks')return 'Use this check for '+leafLabel(path)+'.';
  if(key==='Players')return 'Enter usernames or user IDs, separated by commas. There is no four-player limit.';
  if(path.includes('Color'))return 'Choose a color or adjust its red, green, and blue levels.';
  if(path.includes('Ranges'))return 'Distance threshold in studs. The profile switches at the configured boundary.';
  if(key==='Enabled')return '';
  return help[key]??'';
}
function choiceControl(input,options,path){
  const wrap=node('div',options.length<=3?'choice-group':'choice-picker');
  const name=path.join(' / ');input.hidden=true;wrap.append(input);
  if(options.length<=3){
    wrap.setAttribute('role','group');wrap.setAttribute('aria-label',name);
    for(const [index,option]of options.entries()){
      const button=node('button','choice-button',option);button.type='button';
      if(index===0)button.id=input.id+'-choice';
      button.setAttribute('aria-pressed',String(input.value===option));
      button.addEventListener('click',()=>{input.value=option;input.dispatchEvent(new Event('change'));for(const b of wrap.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.textContent===input.value));});wrap.append(button);
    }
  }else{
    const trigger=node('button','choice-trigger',input.value),menu=node('div','choice-menu');
    trigger.type='button';trigger.id=input.id+'-choice';trigger.setAttribute('aria-label',name);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    menu.id=input.id+'-options';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',name);trigger.setAttribute('aria-controls',menu.id);
    const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
    const open=()=>{menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-selected="true"]')?.focus();};
    trigger.addEventListener('click',()=>menu.hidden?open():close());
    trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}});
    for(const option of options){
      const button=node('button','choice-option',option);button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(input.value===option));
      button.addEventListener('click',()=>{input.value=option;input.dispatchEvent(new Event('change'));trigger.textContent=input.value;for(const b of menu.children)b.setAttribute('aria-selected',String(b.textContent===input.value));close();trigger.focus();});menu.append(button);
    }
    menu.addEventListener('keydown',e=>{const buttons=[...menu.children],index=buttons.indexOf(document.activeElement);let next;
      if(e.key==='Escape'){e.preventDefault();close();trigger.focus();return;}
      if(e.key==='ArrowDown')next=(index+1)%buttons.length;if(e.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;
      if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();buttons[next].focus();}
    });
    wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget))close();});wrap.append(trigger,menu);
  }
  return wrap;
}
function colorControl(path,value,id){
  const wrap=node('div','color-control');
  const picker=node('input','color-swatch');
  picker.type='color';picker.id=id;picker.setAttribute('aria-label',path.join(' / '));
  const hex=node('output','color-hex');
  const channels=node('div','color-channels');
  const sliders=['Red','Green','Blue'].map((name,index)=>{
    const label=node('label','color-channel'),slider=node('input'),number=node('output');
    slider.type='range';slider.min='0';slider.max='255';slider.value=value[index];
    slider.setAttribute('aria-label',leafLabel(path)+' '+name);
    label.append(node('span','',name),number,slider);channels.append(label);
    return {slider,number};
  });
  function display(rgb){
    picker.value='#'+rgb.map(component=>component.toString(16).padStart(2,'0')).join('');
    hex.textContent=picker.value.toUpperCase();
    sliders.forEach(({slider,number},index)=>{slider.value=rgb[index];number.textContent=rgb[index];});
  }
  function update(rgb){
    setAt(draft,path,rgb);
    display(rgb);
    setDirty();
  }
  picker.addEventListener('input',()=>update(picker.value.slice(1).match(/../g).map(part=>parseInt(part,16))));
  for(const {slider} of sliders)slider.addEventListener('input',()=>update(sliders.map(item=>Number(item.slider.value))));
  display(value);wrap.append(picker,hex,channels);return wrap;
}
function renderSettings(){
  const filter=$('#setting-search').value.trim().toLowerCase(),list=$('#settings-list');list.replaceChildren();
  text('#setting-title',filter?'Search results':section);text('#setting-description',filter?'Matching settings across the entire config.':descriptions[section]);
  if(!filter&&section==='Gun Specifications'){
    mountGunFunctions(list,{config:draft,defaults,functions:gunFunctions,state:gunState,changed:()=>{setDirty();if(!Object.keys(gunState.errors).length)notice('');}});
    return;
  }
  const rows=[];
  function flatten(value,path){
    if(path.join('/')==='Whitelist/Players'||isRgb(path,value)){rows.push([path,value]);return;}
    if(value&&typeof value==='object'){
      const priority=['Enabled','Method','Auto','Value','Holding','Follow','Smoothness','Prediction','Target','BasePart','Closest','Raycast','Selection','Axis','Sharpness','Reduce','Fov','Toggle','Activation','AntiCurve','Keybind'];
      const rank=key=>priority.includes(key)?priority.indexOf(key):100;
      const nested=key=>value[key]&&typeof value[key]==='object'&&![...path,key].join('/').endsWith('Whitelist/Players');
      const keys=Object.keys(value).sort((a,b)=>Number(nested(a))-Number(nested(b))||rank(a)-rank(b));
      for(const key of keys)flatten(value[key],[...path,key]);
    }
    else rows.push([path,value]);
  }
  for (const name of filter ? order : [section]) {
    if(name==='Gun Specifications')flatten(draft[name].Enabled,[name,'Enabled']);
    else flatten(draft[name],[name]);
  }
  let lastGroup='',count=0;
  for(const [path,value]of rows){
    const searchable=path.join(' / ')+' '+describe(path);if(filter&&!searchable.toLowerCase().includes(filter))continue;
    const parent=path.slice(filter?0:1,-1).map(key=>settingLabels[key]??key).join(' / ')||'General';
    if(parent!==lastGroup){if(parent!=='General')list.append(node('h3','setting-subhead',parent));lastGroup=parent;}
    const row=node('div','setting-row'),label=node('label','setting-label',leafLabel(path)),control=node('div','setting-control');
    const id='setting-'+path.map(x=>encodeURIComponent(x)).join('_');label.htmlFor=id;const description=describe(path);if(description)label.append(node('small','',description));let input;
    if(isRgb(path,value)){control.append(colorControl(path,value,id));row.append(label,control);list.append(row);count++;continue;}
    const options=choices(path);
    if(typeof value==='boolean'){input=node('input','switch');input.type='checkbox';input.checked=value;input.setAttribute('role','switch');}
    else if(options){input=node('select');for(const option of options){const el=node('option','',option);el.value=option;input.append(el);}input.value=value;}
    else if(Array.isArray(value)){input=node('textarea');input.value=value.join(', ');input.placeholder='No assignments';}
    else{input=node('input');input.type=typeof value==='number'?'number':'text';input.value=value;if(input.type==='number'){input.step='any';input.min=isCurveOffset(path)?'-0.12':'0';if(isCurveOffset(path))input.max='0.12';}else input.maxLength=64;}
    input.id=id;input.setAttribute('aria-label',path.join(' / '));
    if(path.at(-1)==='Value'&&path.includes('Prediction')&&getAt(draft,path.slice(0,-1)).Auto){input.disabled=true;input.title='Auto ignores the manual value.';}
    input.addEventListener('change',()=>{
      let next=input.type==='checkbox'?input.checked:typeof value==='number'?Number(input.value):Array.isArray(value)?input.value.split(/[\s,]+/).filter(Boolean).map(x=>/^\d+$/.test(x)?Number(x):x):input.value;
      if(input.type==='number'&&input.value.trim()===''){input.value=value;toast('Enter a number.');return;}
      const prior=getAt(draft,path);setAt(draft,path,next);
      try{validateConfig(draft,defaults);}catch(error){setAt(draft,path,prior);toast(error.message);renderSettings();return;}
      setDirty();if(path.at(-1)==='Auto')renderSettings();if(path[0]==='Aim Assist'&&['Aim Calibration','Follow'].includes(path[1]))render();
    });
    if(options){control.append(choiceControl(input,options,path));label.removeAttribute('for');}else control.append(input);row.append(label,control);list.append(row);count++;
  }
  if(!count)list.append(node('p','no-settings','No matching settings.'));
}
const editorGroups={'Intro':'Startup','Silent Aim':'Aim controls','ESP':'Players and visuals','Gun Specifications':'Profiles and extras'};
for(const name of order){if(editorGroups[name])$('#config-sections').append(node('p','editor-group',editorGroups[name]));const button=node('button',name===section?'active':'',name);button.type='button';button.addEventListener('click',()=>{section=name;$('#setting-search').value='';$('#config-sections').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));renderSettings();});$('#config-sections').append(button);}
let searchTimer;$('#setting-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderSettings,100);});$('#profile-name').addEventListener('input',setDirty);
function showSession(message){
  clearTimeout(expiryTimer);
  document.body.dataset.session='pending';
  expired=true;remote=null;csrf=null;licenseFeedback='';$('#license-input').value='';hideLicense();
  text('#session-dialog-title',message||'Open your dashboard.');if(!$('#session-dialog').open)$('#session-dialog').showModal();render();
}
async function api(action,method='GET',data){
  const headers={};if(method!=='GET'){headers['Content-Type']='application/json';if(csrf)headers['X-Neoperro-CSRF']=csrf;}
  let response;
  try{response=await fetch('/api/panel?action='+action,{method,credentials:'same-origin',headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('Connection unavailable. Your draft is still on this device.');}
  const result=await response.json().catch(()=>({error:'Workspace service unavailable.'}));
  if(!response.ok){if(response.status===401)showSession(remote?'Your session has expired. Sign in again.':undefined);const e=Error(result.error||'Request failed.');e.status=response.status;throw e;}
  return result;
}
function acceptState(next,initial=false){
  document.body.dataset.session='ready';
  clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>showSession('Your session has expired. Sign in again.'),Math.max(0,next.expiresAt-Date.now()));
  const previous=remote;remote=next;csrf=next.csrf;expired=false;
  if(next.user&&(!previous||previous.user?.id!==next.user.id)&&cached?.owner!==next.user.id){cached=null;draft=clone(defaults);gunFunctions=loadGunFunctions(undefined,draft);resetGunState();dirty=false;$('#profile-name').value='My config';try{localStorage.removeItem('neoperro.profile.v1');}catch{}renderSettings();}
  if(next.profile&&(!dirty||initial)&&(!previous||next.revision!==previous.revision||initial)){
    draft=clone(next.profile.config);gunFunctions=loadGunFunctions(next.profile.gunFunctions,draft);resetGunState();$('#profile-name').value=next.profile.name;cached=clone(next.profile);dirty=false;saveDevice(cached);renderSettings();
  }
  render();if(!identityMode.preview&&next.license?.status!=='active')showView('license');
}
function saveDevice(profile){if(remote?.user)profile.owner=remote.user.id;try{localStorage.setItem('neoperro.profile.v1',JSON.stringify(profile));}catch{toast('Device storage is unavailable. Export your config as a backup.');}}
function render(){
  const profile=remote?.profile??cached,r=remote?.runtime,revision=remote?.revision??0;
  const user=remote?.user;
  text('#account-name',user?.displayName||'Not signed in');text('#account-username',user?.username?'@'+user.username:'Discord not connected');
  const avatar=$('#account-avatar');const avatarUrl=user?.avatarUrl;
  if(avatarUrl&&/^https:\/\/cdn\.discordapp\.com\/(avatars|embed\/avatars)\//.test(avatarUrl)){if(avatar.dataset.source!==avatarUrl){const image=node('img');image.src=avatarUrl;image.alt='';image.width=36;image.height=36;image.referrerPolicy='no-referrer';avatar.replaceChildren(image);avatar.dataset.source=avatarUrl;}}else{avatar.textContent=user?.displayName?.slice(0,1)||'?';delete avatar.dataset.source;}
  const license=remote?.license,active=license?.status==='active',access=identityMode.preview||active;
  const online=access&&runtimeOnline(r);
  const clientState=license?.status==='inactive'?'Linked key rejected':license?.status==='unavailable'?'License check unavailable'
    :license?.status==='unlinked'?'Link your key':!remote?'Sign in to connect':online?'Connected':r?.seenAt?'Client offline':'No client check-in yet';
  text('#connection-status',clientState);$('#connection-dot').className='status-dot '+(online?'online':'neutral');
  text('#metric-connection',online?'Connected':'Offline');text('#metric-configs',profile?'1':'0');
  text('#metric-revision',revision?'r'+revision:'None');text('#metric-version',r?.version??'\u2014');
  text('#runtime-badge',online?'CONNECTED':'OFFLINE');text('#runtime-headline',online?'Client connected':'Waiting for your client');text('#runtime-version',r?.version??'\u2014');
  text('#profile-title',profile?.name??'No saved profile yet');text('#profile-description',profile?'Saved '+new Date(profile.savedAt).toLocaleString():'Start with the current public defaults, then make them yours.');
  for(const id of ['#saved-revision','#detail-saved'])text(id,revision?'r'+revision:profile?'Device only':'\u2014');
  for(const id of ['#delivered-revision','#detail-delivered'])text(id,r?.deliveredRevision?'r'+r.deliveredRevision:'\u2014');
  for(const id of ['#applied-revision','#detail-applied'])text(id,r?.appliedRevision?'r'+r.appliedRevision:'\u2014');
  text('#pair-status',clientState);text('#detail-badge',online?'CONNECTED':'OFFLINE');text('#detail-version',r?.version??'\u2014');text('#detail-seen',Number.isFinite(r?.seenAt)&&r.seenAt>0?new Date(r.seenAt).toLocaleString():'Never');text('#detail-error',license?.message??r?.errorCode??'None');
  text('#application-status',r?.rejectedRevision===revision&&revision?'Client rejected r'+revision:r?.appliedRevision===revision&&revision?'Applied in client \xb7 r'+revision:r?.deliveredRevision===revision&&revision?'Delivered \xb7 waiting for acknowledgment':revision?'Saved \xb7 awaiting delivery':'Waiting for your client');
  text('#editor-status',dirty?'Unsaved changes':profile?'Saved config':'Public defaults \xb7 not saved');
  const liveCalibration=connectedCalibration(), calibrationUnlocked=liveCalibration?.enabled===true;
  calibrationPanel.tracking(liveCalibration);
  for(const button of document.querySelectorAll('[data-view]')){
    const view=button.dataset.view;
    button.disabled=view==='calibration' ? !calibrationUnlocked
      : !!remote&&!access&&view!=='license';
  }
  const calibrationTab=$('[data-view="calibration"]');
  calibrationTab.title=calibrationUnlocked?'':'Connect a client with Aim Calibration enabled.';
  if(!calibrationUnlocked&&document.body.dataset.activeView==='calibration')showView('runtime');
  $('#save-config').disabled=busy||expired||!access;
  text('#license-heading',active?'Your license.':'Link your license.');
  text('#license-description',active?'Linked to this Discord account. Keep your key private.':'Link your key to this Discord account to open the dashboard.');
  $('#license-form').hidden=active||identityMode.preview;$('#license-vault').hidden=!active;
  $('#link-license').disabled=busy||!remote||!license?.configured;$('#license-input').disabled=busy||!remote||!license?.configured;$('#link-license').textContent=busy?'Linking\u2026':'Link license';$('#license-form').setAttribute('aria-busy',String(busy));
  text('#license-status',identityMode.preview?'Local preview':active?'Active':license?.status==='unavailable'?'Service unavailable':license?.status==='inactive'?'Linked key rejected':'Not linked');
  text('#license-expiry',active?(license.expiresAt?new Date(license.expiresAt).toLocaleString():'Lifetime'):'\u2014');
  text('#license-discord',user?.username?'@'+user.username+(active?' \xb7 locked':' \xb7 awaiting license'):'\u2014');text('#license-device',active?(license.hwidBound?'Device linked':'Links on first authorized use'):'\u2014');
  text('#license-reset-time',active?(license.resetAvailableAt&&license.resetAvailableAt>Date.now()?new Date(license.resetAvailableAt).toLocaleString():license.hwidBound?'Available now':'No device linked'):'\u2014');
  $('#reset-hwid').disabled=busy||!active||!license.resetEnabled||!license.hwidBound||license.resetAvailableAt>Date.now();
  $('#panel-key').disabled=!active;
  if(!active)hideLicense();text('#license-message',licenseFeedback||(busy?'Checking your license\u2026':!active?license?.message||(license?.configured===false&&!identityMode.preview?'License service is not configured yet. Please contact support.':''):''));
}
function hideLicense(){visibleLicense=null;$('#reveal-license').textContent='\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';$('#reveal-license').setAttribute('aria-label','Reveal your license key');}
$('#license-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const value=$('#license-input').value.trim();licenseFeedback='';busy=true;render();
  try{await api('license','POST',{key:value});$('#license-input').value='';licenseFeedback='';acceptState(await api('session'));showView('overview');toast('License linked to this Discord account.');}
  catch(error){licenseFeedback=error.message;}finally{busy=false;render();}
});
$('#reveal-license').addEventListener('click',async()=>{
  if(visibleLicense){hideLicense();return;}
  try{visibleLicense=(await api('license-reveal','POST',{})).key;$('#reveal-license').textContent=visibleLicense;$('#reveal-license').setAttribute('aria-label','Hide your license key');}catch(error){licenseFeedback=error.message;render();}
});
$('#copy-license').addEventListener('click',async()=>{try{const value=visibleLicense||(await api('license-reveal','POST',{})).key;await copy(value);}catch(error){licenseFeedback=error.message;render();}});
$('#panel-key').addEventListener('click',()=>showView('license'));
$('#reset-hwid').addEventListener('click',async()=>{
  if(busy||!await confirm('Reset your device binding?','Your next authorized run will bind the license to that device. Another reset will not be available for 24 hours. The Discord account stays locked.'))return;
  busy=true;render();try{await api('license-reset','POST',{});acceptState(await api('session'));toast('Device binding reset.');}catch(error){notice(error.message);}finally{busy=false;render();}
});
async function start(){
  if(!identityMode.preview){location.assign('/api/auth/login');return;}
  $('#start-session').disabled=true;text('#session-error','');
  try{acceptState(await api('session','POST',{}),true);$('#session-dialog').close();notice('');}
  catch(e){text('#session-error',e.message);}
  finally{$('#start-session').disabled=false;}
}
$('#start-session').addEventListener('click',start);$('#session-dialog').addEventListener('cancel',e=>{e.preventDefault();location.assign('/');});
async function saveDraft(){
  if(!remote||busy||expired)return false;
  try{validateConfig(draft,defaults);checkedGunFunctions();const name=$('#profile-name').value.trim();if(!name||name.length>32)throw Error('Choose a profile name of 1\u201332 characters.');
    busy=true;render();const snapshot=clone(draft),functionSnapshot=clone(checkedGunFunctions()),sent=JSON.stringify({config:snapshot,gunFunctions:functionSnapshot});
    const next=await api('profile','POST',{name,config:snapshot,gunFunctions:functionSnapshot,revision:remote?.revision??0});
    dirty=JSON.stringify({config:draft,gunFunctions})!==sent;cached={name,config:snapshot,gunFunctions:functionSnapshot,savedAt:next.profile.savedAt};saveDevice(cached);acceptState(next);toast(next.runtime.paired?'Saved. Waiting for your client to apply it.':'Profile saved. Set Web configs to true in your Lua table to apply it.');notice('');
    return true;
  }catch(e){notice(e.message);return false;}finally{busy=false;render();}
}
$('#save-config').addEventListener('click',saveDraft);
async function confirm(title,description){
  text('#confirm-title',title);text('#confirm-description',description);const dialog=$('#confirm-dialog');dialog.showModal();
  return new Promise(resolve=>{const finish=value=>{dialog.close();$('#confirm-accept').onclick=null;$('#confirm-cancel').onclick=null;dialog.oncancel=null;resolve(value);};$('#confirm-accept').onclick=()=>finish(true);$('#confirm-cancel').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};});
}
$('#reset-config').addEventListener('click',async()=>{if(await confirm('Reset this draft?','Replace the editor values with public defaults. Your saved profile remains unchanged until you save.')){draft=clone(defaults);gunFunctions=loadGunFunctions(undefined,draft);resetGunState();setDirty();renderSettings();render();}});
$('#sign-out').addEventListener('click',async()=>{if(!remote){location.assign('/');return;}if(!await confirm('End this session?','Revoke the runtime connection and clear this browser\u2019s session cookie. A settings-only backup stays on this device.'))return;try{await api('session','DELETE');remote=null;csrf=null;dirty=false;hideLicense();location.assign('/');}catch(e){notice(e.message);}});
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Copied.');return true;}catch{toast('Clipboard unavailable.');return false;}}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-config').addEventListener('click',()=>{try{validateConfig(draft,defaults);download('neoperro-config.lua',exportGunScript(draft,undefined,checkedGunFunctions()),'text/plain;charset=utf-8');toast('Exported with a key placeholder. Keep your real key private.');}catch(e){toast(e.message);}});
const jsonBackup=node('button','reset-button','Download JSON backup \u2193');jsonBackup.id='export-json';$('.editor-sections').append(jsonBackup);
jsonBackup.addEventListener('click',()=>{try{validateConfig(draft,defaults);download('neoperro-config.json',JSON.stringify({name:$('#profile-name').value,config:draft,gunFunctions:checkedGunFunctions()},null,2),'application/json');}catch(e){toast(e.message);}});
$('#import-config').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>65536)throw Error('JSON config must be smaller than 64 KB.');const input=JSON.parse(await file.text()),config=withWebDefaults(input.config??input);validateConfig(config,defaults);const functions=loadGunFunctions(input.gunFunctions,config);draft=clone(config);gunFunctions=functions;resetGunState();if(typeof input.name==='string')$('#profile-name').value=input.name.slice(0,32);setDirty();renderSettings();render();toast('Imported into the draft. Save to send it.');}catch(error){toast(error.message);}e.target.value='';});
async function poll(){if(polling||!remote||document.hidden)return;polling=true;try{const next=await api('session');if(JSON.stringify(next)!==JSON.stringify(remote))acceptState(next);notice('');}catch(e){if(e.status!==401)notice(e.message);}finally{polling=false;}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();else hideLicense();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
const calibrationPanel=mountCalibration({
  start: duration=>api('calibration-session','POST',{duration}),
  cancel: id=>api('calibration-session','DELETE',{id}),
  apply: async report=>{
    const assist=draft['Aim Assist'],profile=report.profile;
    const calibration=assist['Aim Calibration'];
    calibration.Enabled=true;
    calibration.Strength=profile.strength;
    for(const [short,legacy,value] of [['Min Speed','MinMouseSpeed',profile.minSpeed],
      ['Full Speed','FullStrengthSpeed',profile.fullSpeed],['Max Speed','MaxCorrectionSpeed',profile.maxSpeed]]){
      calibration[Object.hasOwn(calibration,short)?short:legacy]=value;
    }
    calibration.Curve={Enabled:profile.curve.enabled,Early:profile.curve.early,Middle:profile.curve.middle,Late:profile.curve.late};
    if(report.follow==='Camera')assist.Smoothness=profile.smoothness;
    setDirty();renderSettings();
    if(!await saveDraft())throw Error('Settings are in your draft. Save the config to finish.');
    return draft['Web configs']===true;
  },
});
const initialView=location.hash.slice(1)||'overview';
renderSettings();showView(initialView);render();
const params=new URLSearchParams(location.search),enter=params.get('enter')==='1';history.replaceState(null,'',location.pathname+location.hash);
try{identityMode=await api('auth');}catch{}
text('#start-session',identityMode.preview?'Enter local preview':'Continue with Discord');
text('#session-description',identityMode.preview?'Local development preview. This workspace stays separate from production.':'Sign in with Discord to open your workspace. We request your basic profile only. Sessions end after 12 hours.');
$('#start-session').disabled=!identityMode.preview&&!identityMode.configured;
if(params.get('auth')==='failed')text('#session-error','Sign-in did not finish. Please try again.');
if(params.get('auth')==='unavailable')text('#session-error','Sign-in is temporarily unavailable. Please try again shortly.');
try{acceptState(await api('session'),true);if(initialView==='calibration'&&connectedCalibration()?.enabled===true)showView('calibration');}catch(e){if(e.status===401){if(enter)await start();else showSession();}else{notice(e.message);showSession('Workspace unavailable.');}}
setInterval(()=>{if(location.hash==='#runtime'||location.hash==='#calibration')poll();},4000);setInterval(poll,10000);setInterval(()=>{if(document.hidden)return;if(remote&&Date.now()>=remote.expiresAt)showSession('Your session has expired. Sign in again.');else if(remote)render();},30000);
