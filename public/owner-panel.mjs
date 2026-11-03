export function createOwnerPanel({api,confirm,toast,showView}){
  const nav=document.querySelector('.panel-nav'),section=document.createElement('section'),button=document.createElement('button');
  button.type='button';button.dataset.view='owner';button.textContent='Owner';button.hidden=true;
  button.addEventListener('click',()=>showView('owner'));nav.append(button);
  section.className='panel-view owner-view';section.dataset.panel='owner';section.hidden=true;
  section.innerHTML=`<div class="owner-grid"><article class="panel"><div class="panel-title"><h2>Announcement</h2><button type="button" class="inline-button" id="owner-refresh">Refresh</button></div><p>A short message at the top of the site and dashboard.</p><form id="owner-announcement"><label for="owner-message">Your message</label><textarea id="owner-message" maxlength="240" rows="3" placeholder="An update, a heads-up, anything your users should know."></textarea><div class="owner-form-row"><label for="owner-hours">Keep it up for</label><select id="owner-hours"><option value="24">24 hours</option><option value="1">1 hour</option><option value="168">7 days</option><option value="">Until I hide it</option></select></div><div class="panel-actions"><button class="button primary" type="submit">Publish</button><button class="button secondary" type="button" id="owner-hide">Hide</button></div></form><p id="owner-announcement-status" class="owner-feedback" role="status"></p></article><article class="panel"><h2>Find a license</h2><p>Paste a key, a license ID, or the Discord ID linked to it. Keys are sent privately and never added to the activity log.</p><form id="owner-lookup" class="owner-search"><label class="sr-only" for="owner-license-input">Key, license ID or Discord ID</label><input id="owner-license-input" type="password" autocomplete="off" spellcheck="false" maxlength="64" placeholder="Key, license ID or Discord ID"><button class="button secondary" type="submit">Look up</button></form><p id="owner-lookup-status" class="owner-feedback" role="status" aria-live="polite"></p><button type="button" class="inline-button" id="owner-list">Browse licenses</button><div id="owner-license-list"></div><dl id="owner-license-detail" class="owner-definition"></dl><div class="owner-commands" hidden><label for="owner-command">Manage this license</label><select id="owner-command"><option value="disconnect-web">Disconnect web client</option><option value="block-web">Block website access</option><option value="unblock-web">Restore website access</option><option value="reset-hwid">Reset eligible HWID</option></select><button type="button" class="button danger" id="owner-run">Apply</button></div><p class="fine-print">Website blocks stop panel access and web configs. HWID resets follow the 24-hour limit. Use your licensing dashboard to revoke or blacklist the key itself.</p><a class="inline-button" href="https://flowauth.net/logs" target="_blank" rel="noreferrer">Open licensing dashboard</a></article></div><article class="panel owner-events"><div class="panel-title"><h2>License activity</h2><button type="button" class="button secondary" id="owner-logs" disabled>Load records</button></div><p>Choose a license above, or open an execution notification. Changes are highlighted when both the old and new values are available.</p><p id="owner-events-status" class="owner-feedback" role="status" aria-live="polite">No license selected.</p><div class="owner-table-wrap"><table><thead><tr><th>Time</th><th>Result</th><th>Device</th><th>Country</th><th>IP</th><th>Executor</th><th>Changes</th></tr></thead><tbody id="owner-events-body"></tbody></table></div></article><article class="panel owner-events"><h2>Your recent actions</h2><p>Up to 100 actions from the last 30 days. Keys and execution details are kept out of this log.</p><div class="owner-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>License</th></tr></thead><tbody id="owner-audit-body"></tbody></table></div></article><p class="error-text" id="owner-error" role="status" aria-live="polite"></p>`;
  document.querySelector('.workspace').insertBefore(section,document.querySelector('.dashboard-legal'));
  const alertWrap=document.createElement('div'),alertButton=document.createElement('button'),count=document.createElement('span');
  alertWrap.className='owner-alert-control';alertWrap.hidden=true;alertButton.type='button';alertButton.className='owner-alert-toggle';alertButton.setAttribute('aria-haspopup','dialog');alertButton.textContent='Executions';count.className='owner-alert-count';count.hidden=true;alertButton.append(count);alertWrap.append(alertButton);document.querySelector('.panel-header').append(alertWrap);
  const activity=document.createElement('dialog'),detailDialog=document.createElement('dialog');
  activity.className='owner-activity-dialog';activity.setAttribute('aria-labelledby','owner-activity-title');
  activity.innerHTML='<div class="activity-heading"><div><span class="eyebrow">OWNER ONLY</span><h2 id="owner-activity-title">Recent executions</h2></div><button class="activity-close" type="button" aria-label="Close executions">&#215;</button></div><p class="activity-status" role="status"></p><div class="activity-list"></div><button class="inline-button activity-refresh" type="button">Refresh activity</button>';
  detailDialog.className='owner-detail-dialog';detailDialog.setAttribute('aria-labelledby','owner-execution-title');
  detailDialog.innerHTML='<div class="activity-heading"><h2 id="owner-execution-title">Execution details</h2><button class="activity-close" type="button" aria-label="Close execution details">&#215;</button></div><dl class="owner-definition"></dl><p class="fine-print">Country is approximate. VPNs, networks and software updates can change these values; a change alone does not prove sharing.</p><button class="button secondary activity-license" type="button">Open this license</button>';
  document.body.append(activity,detailDialog);
  const $=selector=>section.querySelector(selector),cell=value=>{const td=document.createElement('td');td.textContent=value??'Not supplied';return td;};
  const table=(selector,rows)=>{$(selector).replaceChildren(...rows.map(values=>{const tr=document.createElement('tr');tr.append(...values.map(cell));return tr;}));};
  const label={device:'Device',country:'Country',ip:'IP',executor:'Executor'};
  const actionLabel={'announcement-published':'Published announcement','announcement-hidden':'Hid announcement','disconnect-web':'Disconnected web client','block-web':'Blocked website access','unblock-web':'Restored website access','reset-hwid':'Reset device binding'};
  let allowed=false,busy=false,revision=0,selected=null,loaded=false,events=[],read=new Set(),feedLoading=false,feedTimer,feedError='',feedReady=false,feedFailures=0,feedNext=0,epoch=0,openedEvent=null;
  const labels={'disconnect-web':'Disconnect this web client?','block-web':'Block this license from the website?','unblock-web':'Restore website access?','reset-hwid':'Reset the device binding?'};
  function feedback(selector,message,error=false){const el=$(selector);el.textContent=message;el.classList.toggle('is-error',error);}
  async function run(fn,status='#owner-error',pending='Working…'){
    if(!allowed||busy)return;busy=true;feedback(status,pending);section.setAttribute('aria-busy','true');for(const b of section.querySelectorAll('button'))b.disabled=true;
    try{await fn();}catch(error){if(allowed){feedback(status,error.message,true);toast(error.message);}}
    finally{busy=false;section.removeAttribute('aria-busy');for(const b of section.querySelectorAll('button'))b.disabled=false;$('#owner-logs').disabled=!selected;}
  }
  function definition(container,rows){container.replaceChildren();for(const [title,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=title;dd.textContent=value??'Not supplied';container.append(dt,dd);}}
  function licenseDetail(value){
    if(!allowed)return;selected=value;
    definition($('#owner-license-detail'),[['License', '#'+value.id],['Status',value.status],['Discord',value.discordId??'Not linked'],['Expires',value.lifetime?'Lifetime':value.expiresAt?new Date(value.expiresAt).toLocaleString():'Not supplied'],['Device',value.hwidBound?'Bound':'Not bound'],['Website',value.webBlocked?'Blocked':value.websiteLinked?'Linked':'Not linked']]);
    $('.owner-commands').hidden=false;$('#owner-logs').disabled=false;table('#owner-events-body',[]);feedback('#owner-events-status','Ready to load records for license #'+value.id+'.');
  }
  async function lookup(value){selected=null;$('#owner-license-detail').replaceChildren();$('.owner-commands').hidden=true;$('#owner-logs').disabled=true;table('#owner-events-body',[]);feedback('#owner-events-status','Choose a license to load its records.');const data=await api('owner-license','POST',{licenseId:value});if(!allowed)return;licenseDetail(data);feedback('#owner-lookup-status','License #'+data.id+' loaded.');}
  async function refresh(){
    const state=await api('owner-state');if(!allowed)return;loaded=true;revision=state.revision;$('#owner-message').value=state.draft.message;
    feedback('#owner-announcement-status',state.announcement?'Your announcement is live.':'No announcement is showing.');
    table('#owner-audit-body',state.audit.map(row=>[new Date(row.at).toLocaleString(),actionLabel[row.action]??row.action,row.licenseId?'#'+row.licenseId:'—']));
  }
  async function records(){
    if(!selected)return;const id=selected.id,data=await api('owner-logs','POST',{licenseId:id});if(!allowed||selected?.id!==id)return;
    table('#owner-events-body',data.events.map(row=>[new Date(row.at).toLocaleString(),row.event,row.device,row.country,row.ip,row.executor,row.changes.length?row.changes.map(key=>label[key]??key).join(', '):'No measured change']));
    feedback('#owner-events-status',data.events.length?data.events.length+' recent records for license #'+id+'.':'No records returned for this license yet.');
  }
  function badge(){const unseen=events.filter(row=>!read.has(row.id)).length;count.hidden=!unseen;count.textContent=unseen>99?'99+':String(unseen);alertButton.setAttribute('aria-label','Executions'+(unseen?', '+unseen+' unread':''));}
  function showExecution(row){
    if(!allowed)return;openedEvent=row;read.add(row.id);badge();activity.close();
    definition(detailDialog.querySelector('dl'),[['License','#'+row.licenseId],['When',new Date(row.at).toLocaleString()],['Result',row.event],['Device',row.device],['Country',row.country],['IP address',row.ip],['Executor',row.executor],['Changed',row.changes.length?row.changes.map(key=>label[key]??key).join(', '):'No measured change']]);
    detailDialog.showModal();
  }
  function renderFeed(){
    badge();activity.querySelector('.activity-status').textContent=feedError||(!feedReady?'Checking recent executions…':events.length?'Select an execution to see its details.':'No executions returned yet.');
    activity.querySelector('.activity-status').classList.toggle('is-error',!!feedError);
    const list=activity.querySelector('.activity-list');list.replaceChildren();
    for(const row of events){
      const pick=document.createElement('button'),title=document.createElement('strong'),description=document.createElement('span'),time=document.createElement('time');
      pick.type='button';pick.className='execution-item'+(!read.has(row.id)?' unread':'');title.textContent='License #'+row.licenseId+' · '+row.event;
      description.textContent=[row.country,row.executor,row.changes.length?'Changed: '+row.changes.map(key=>label[key]??key).join(', '):null].filter(Boolean).join(' · ')||'Details available';
      time.dateTime=new Date(row.at).toISOString();time.textContent=new Date(row.at).toLocaleString();pick.append(title,description,time);pick.addEventListener('click',()=>showExecution(row));list.append(pick);
    }
  }
  async function refreshFeed(force=false){
    if(!allowed||feedLoading||document.hidden||!force&&Date.now()<feedNext)return;
    feedLoading=true;const started=epoch;
    try{
      const data=await api('owner-feed');if(!allowed||started!==epoch)return;
      const wasReady=feedReady,known=new Set(events.map(row=>row.id));events=data.events;
      if(!wasReady)read=new Set(events.map(row=>row.id));else{
        const fresh=events.filter(row=>!known.has(row.id)&&!read.has(row.id));
        if(fresh.length)toast(fresh.length===1?'New execution on license #'+fresh[0].licenseId+'.':fresh.length+' new license events.');
      }
      feedReady=true;feedError='';feedFailures=0;feedNext=Date.now()+20000;renderFeed();
    }catch(error){if(allowed&&started===epoch){feedError=error.message;feedNext=Date.now()+Math.min(120000,20000*2**Math.min(++feedFailures,3));renderFeed();}}
    finally{feedLoading=false;}
  }
  alertButton.addEventListener('click',()=>{if(!allowed)return;renderFeed();activity.showModal();refreshFeed(true);});
  activity.querySelector('.activity-close').addEventListener('click',()=>activity.close());
  activity.querySelector('.activity-refresh').addEventListener('click',()=>refreshFeed(true));
  detailDialog.querySelector('.activity-close').addEventListener('click',()=>detailDialog.close());
  detailDialog.querySelector('.activity-license').addEventListener('click',()=>{
    if(!openedEvent||!allowed)return;const id=openedEvent.licenseId;detailDialog.close();showView('owner');run(async()=>{await lookup(id);await records();},'#owner-lookup-status','Opening license…');
  });
  $('#owner-refresh').addEventListener('click',()=>run(refresh,'#owner-announcement-status','Refreshing…'));
  $('#owner-lookup').addEventListener('submit',event=>{
    event.preventDefault();if(busy){feedback('#owner-lookup-status','Please wait for the current request to finish.');return;}const value=$('#owner-license-input').value.trim();$('#owner-license-input').value='';
    if(!value){feedback('#owner-lookup-status','Enter a key, license ID or linked Discord ID.',true);return;}
    run(()=>lookup(value),'#owner-lookup-status','Looking up your license…');
  });
  $('#owner-list').addEventListener('click',()=>run(async()=>{
    const data=await api('owner-licenses');if(!allowed)return;$('#owner-license-list').replaceChildren();
    for(const row of data.licenses){const pick=document.createElement('button');pick.type='button';pick.className='owner-license-row';pick.textContent='#'+row.id+' · '+row.status+' · '+(row.discordId??'Not linked');pick.addEventListener('click',()=>run(()=>lookup(row.id),'#owner-lookup-status','Loading license…'));$('#owner-license-list').append(pick);}
    feedback('#owner-lookup-status',data.licenses.length?data.licenses.length+' licenses returned. Choose one below.':'No licenses returned.');
  },'#owner-lookup-status','Loading licenses…'));
  async function publish(enabled){
    const data=await api('owner-announcement','POST',{revision,enabled,message:$('#owner-message').value,hours:$('#owner-hours').value?Number($('#owner-hours').value):null});
    if(!allowed)return;revision=data.revision;window.dispatchEvent(new Event('neoperro-announcement-updated'));await refresh();toast(enabled?'Announcement published.':'Announcement hidden.');
  }
  $('#owner-announcement').addEventListener('submit',event=>{event.preventDefault();run(()=>publish(true),'#owner-announcement-status','Publishing…');});
  $('#owner-hide').addEventListener('click',()=>run(()=>publish(false),'#owner-announcement-status','Hiding announcement…'));
  $('#owner-run').addEventListener('click',()=>run(async()=>{
    if(!selected)return;const command=$('#owner-command').value;
    if(!await confirm(labels[command],'License #'+selected.id+'. The Discord link stays unchanged.')){feedback('#owner-lookup-status','Nothing changed.');return;}
    const result=await api('owner-command','POST',{licenseId:selected.id,command});if(!allowed)return;licenseDetail(result);await refresh();feedback('#owner-lookup-status',result.auditRecorded===false?'Done. The activity record could not be saved.':'Done. License status updated.');toast('License updated.');
  },'#owner-lookup-status','Checking command…'));
  $('#owner-logs').addEventListener('click',()=>run(records,'#owner-events-status','Loading execution records…'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFeed();});
  return {
    access(value){
      const before=allowed;allowed=value===true;button.hidden=!allowed;alertWrap.hidden=!allowed;
      if(allowed&&!before){epoch++;refreshFeed();feedTimer=setInterval(refreshFeed,20000);}
      if(!allowed&&before){epoch++;clearInterval(feedTimer);selected=null;loaded=false;section.hidden=true;events=[];read.clear();feedReady=false;feedError='';feedNext=0;feedFailures=0;openedEvent=null;activity.close();detailDialog.close();$('#owner-message').value='';$('#owner-license-input').value='';$('#owner-license-detail').replaceChildren();$('#owner-license-list').replaceChildren();table('#owner-audit-body',[]);table('#owner-events-body',[]);$('.owner-commands').hidden=true;activity.querySelector('.activity-list').replaceChildren();detailDialog.querySelector('dl').replaceChildren();badge();}
    },
    open(){if(allowed&&!loaded)run(refresh,'#owner-announcement-status','Loading owner settings…');}
  };
}
