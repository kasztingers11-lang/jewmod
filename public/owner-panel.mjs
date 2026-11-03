export function createOwnerPanel({api,confirm,notice,toast,showView}){
  const nav=document.querySelector('.panel-nav'),section=document.createElement('section'),button=document.createElement('button');
  button.type='button';button.dataset.view='owner';button.textContent='Owner';button.hidden=true;
  button.addEventListener('click',()=>showView('owner'));nav.append(button);
  section.className='panel-view owner-view';section.dataset.panel='owner';section.hidden=true;
  section.innerHTML=`<div class="owner-grid"><article class="panel"><div class="panel-title"><h2>Announcements</h2><button type="button" class="inline-button" id="owner-refresh">Refresh</button></div><p>Show a plain notice above the homepage and dashboard.</p><form id="owner-announcement"><label for="owner-message">Message</label><textarea id="owner-message" maxlength="240" rows="3" placeholder="What should everyone know?"></textarea><div class="owner-form-row"><label for="owner-hours">Visible for</label><select id="owner-hours"><option value="24">24 hours</option><option value="1">1 hour</option><option value="168">7 days</option><option value="">Until hidden</option></select></div><div class="panel-actions"><button class="button primary" type="submit">Publish notice</button><button class="button secondary" type="button" id="owner-hide">Hide notice</button></div></form><p id="owner-announcement-status" role="status"></p></article><article class="panel"><h2>Licenses</h2><p>Look up a license ID or the Discord account linked on this site. Full keys stay hidden.</p><form id="owner-lookup" class="owner-search"><label class="sr-only" for="owner-license-input">License ID or Discord ID</label><input id="owner-license-input" inputmode="numeric" pattern="[0-9]{1,20}" maxlength="20" placeholder="License ID or Discord ID" required><button class="button secondary" type="submit">Look up</button></form><button type="button" class="inline-button" id="owner-list">List project licenses</button><div id="owner-license-list"></div><dl id="owner-license-detail" class="owner-definition"></dl><div class="owner-commands" hidden><label for="owner-command">License command</label><select id="owner-command"><option value="disconnect-web">Disconnect web client</option><option value="block-web">Block website access</option><option value="unblock-web">Restore website access</option><option value="reset-hwid">Reset eligible HWID</option></select><button type="button" class="button danger" id="owner-run">Run command</button></div><p class="fine-print">Website commands affect the panel and web configs. They do not revoke the provider key. HWID resets respect the 24-hour policy. Provider-wide blacklist controls remain in your licensing dashboard.</p><a class="inline-button" href="https://flowauth.net/logs" target="_blank" rel="noreferrer">Open provider controls</a></article></div><article class="panel owner-events"><div class="panel-title"><h2>Execution changes</h2><button type="button" class="button secondary" id="owner-logs" disabled>Load provider records</button></div><p>Choose a license first. Device fingerprints, approximate country and executor changes appear only when supplied by the provider. A change alone does not prove sharing.</p><p id="owner-events-status" role="status"></p><div class="owner-table-wrap"><table><thead><tr><th>Time</th><th>Result</th><th>Device</th><th>Country</th><th>Executor</th><th>Changes</th></tr></thead><tbody id="owner-events-body"></tbody></table></div></article><article class="panel owner-events"><h2>Owner activity</h2><p>Last 100 administrative actions, up to 30 days. No license keys, IP addresses or raw HWIDs are stored here.</p><div class="owner-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>License ID</th></tr></thead><tbody id="owner-audit-body"></tbody></table></div></article><p class="error-text" id="owner-error" role="status" aria-live="polite"></p>`;
  document.querySelector('.workspace').insertBefore(section,document.querySelector('.dashboard-legal'));
  const $=selector=>section.querySelector(selector);
  let allowed=false,busy=false,revision=0,selected=null,loaded=false;
  const labels={'disconnect-web':'Disconnect this web client?','block-web':'Block this license from the website?','unblock-web':'Restore this license’s website access?','reset-hwid':'Reset this license’s device binding?'};
  const cell=value=>{const td=document.createElement('td');td.textContent=value??'Not supplied';return td;};
  const table=(selector,rows)=>{$(selector).replaceChildren(...rows.map(values=>{const tr=document.createElement('tr');tr.append(...values.map(cell));return tr;}));};
  async function run(fn){
    if(!allowed||busy)return;busy=true;$('#owner-error').textContent='';
    section.setAttribute('aria-busy','true');for(const b of section.querySelectorAll('button'))b.disabled=true;
    try{await fn();}catch(error){$('#owner-error').textContent=error.message;}
    finally{busy=false;section.removeAttribute('aria-busy');for(const b of section.querySelectorAll('button'))b.disabled=false;$('#owner-logs').disabled=!selected;}
  }
  function detail(value){
    if(!allowed)return;
    selected=value;$('#owner-license-detail').replaceChildren();
    const rows=[['License ID',value.id],['Status',value.status],['Discord ID',value.discordId??'Not linked'],['Expires',value.lifetime?'Lifetime':value.expiresAt?new Date(value.expiresAt).toLocaleString():'Not supplied'],['Device',value.hwidBound?'Bound':'Not bound'],['Website',value.webBlocked?'Blocked':value.websiteLinked?'Linked':'Not linked']];
    for(const [key,text]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=text;$('#owner-license-detail').append(dt,dd);}
    $('.owner-commands').hidden=false;$('#owner-logs').disabled=false;table('#owner-events-body',[]);$('#owner-events-status').textContent='No records loaded for this license.';
  }
  async function refresh(){
    const state=await api('owner-state');if(!allowed)return;loaded=true;revision=state.revision;
    $('#owner-message').value=state.draft.message;$('#owner-announcement-status').textContent=state.announcement?'Notice is live.':'No active notice.';
    table('#owner-audit-body',state.audit.map(row=>[new Date(row.at).toLocaleString(),row.action,row.licenseId??'—']));
  }
  $('#owner-refresh').addEventListener('click',()=>run(refresh));
  $('#owner-lookup').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const value=$('#owner-license-input').value.trim();detail(await api('owner-license','POST',{licenseId:value.length>=17?value:Number(value)}));});});
  $('#owner-list').addEventListener('click',()=>run(async()=>{
    const data=await api('owner-licenses');if(!allowed)return;
    $('#owner-license-list').replaceChildren();
    for(const row of data.licenses){const pick=document.createElement('button');pick.type='button';pick.className='owner-license-row';pick.textContent='#'+row.id+' · '+row.status+' · '+(row.discordId??'Not linked');pick.addEventListener('click',()=>run(async()=>detail(await api('owner-license','POST',{licenseId:row.id}))));$('#owner-license-list').append(pick);}
    if(!data.licenses.length)$('#owner-license-list').textContent='No licenses returned.';
  }));
  async function publish(enabled){
    const data=await api('owner-announcement','POST',{revision,enabled,message:$('#owner-message').value,hours:$('#owner-hours').value?Number($('#owner-hours').value):null});
    if(!allowed)return;revision=data.revision;window.dispatchEvent(new Event('neoperro-announcement-updated'));await refresh();toast(enabled?'Notice published.':'Notice hidden.');
  }
  $('#owner-announcement').addEventListener('submit',event=>{event.preventDefault();run(()=>publish(true));});
  $('#owner-hide').addEventListener('click',()=>run(()=>publish(false)));
  $('#owner-run').addEventListener('click',()=>run(async()=>{
    if(!selected)return;const command=$('#owner-command').value;
    if(!await confirm(labels[command],'License #'+selected.id+'. This changes access or device binding. The Discord association stays unchanged.'))return;
    const result=await api('owner-command','POST',{licenseId:selected.id,command});if(!allowed)return;detail(result);await refresh();toast(result.auditRecorded===false?'Command completed; activity record could not be saved.':'Command completed.');
  }));
  $('#owner-logs').addEventListener('click',()=>run(async()=>{
    if(!selected)return;const data=await api('owner-logs','POST',{licenseId:selected.id});if(!allowed)return;
    table('#owner-events-body',data.events.map(row=>[new Date(row.at).toLocaleString(),row.event,row.device,row.country,row.executor,row.changes.length?row.changes.join(', '):'—']));
    $('#owner-events-status').textContent=data.events.length?data.scope:'No matching provider records returned. Earlier history cannot be reconstructed.';
  }));
  return {
    access(value){allowed=value===true;button.hidden=!allowed;if(!allowed){selected=null;loaded=false;section.hidden=true;$('#owner-message').value='';$('#owner-license-input').value='';$('#owner-license-detail').replaceChildren();$('#owner-license-list').replaceChildren();table('#owner-audit-body',[]);table('#owner-events-body',[]);$('.owner-commands').hidden=true;}},
    open(){if(allowed&&!loaded)run(refresh);}
  };
}
