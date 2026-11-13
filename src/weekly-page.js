/* Weekly Reports: week dashboard, detail and editing. All workflow calculations are kept in the backend. */
(function(){
 'use strict';
 const api=()=>window.clinicAPI,UX=window.UX,$=s=>document.querySelector(s);
 const annual=()=>window.WeeklyAhead,slots=()=>window.WeeklySlots;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const METRICS=[
  {col:'B',group:'ahead',name:'Ocular Motor'},
  {col:'C',group:'ahead',name:'Perception Tests'},
  {col:'D',group:'ahead',name:'VT Consultations'},
  {col:'E',group:'ahead',name:'Scheduled VT Starts'},
  {col:'F',group:'weekly',name:'Number of New Inquiries',manual:true},
  {col:'G',group:'weekly',name:'Ocular Motor Exams'},
  {col:'H',group:'weekly',name:'Perception Tests'},
  {col:'I',group:'weekly',name:'VT Consultations'},
  {col:'J',group:'weekly',name:'New VT Starts'},
  {col:'K',group:'weekly',name:'VT Patients Enrolled',manual:true},
  {col:'L',group:'weekly',name:'Discontinued Patients',manual:true},
  {col:'M',group:'weekly',name:'VT Sessions'},
  {col:'N',group:'weekly',name:'VT Closings'}
 ];
 const TYPES={
  B:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'],
  C:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only'],
  D:['Patient Consultation'],E:['Virtual Orientation'],
  G:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'],
  H:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only'],
  I:['Patient Consultation'],J:['Virtual Orientation'],M:['Office VT','Virtual VT'],N:['Home Maintenance']
 };
 const validNumber=v=>/^\d+$/.test(String(v))&&Number.isSafeInteger(Number(v));
 const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const fmt=s=>{if(!s||!/\d{4}-\d{2}-\d{2}/.test(s))return '—';const [y,m,d]=s.split('-');return `${m}/${d}/${y}`;};
 const monthDay=s=>{const parts=String(s).split('-');return parts.length===3?`${parts[1]}/${parts[2]}`:'—';};
 const formatPeriod=p=>`${fmt(p.start)} – ${fmt(p.end)}`;
 const isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const lastFriday=()=>{const d=new Date();d.setDate(d.getDate()-(d.getDay()+2)%7);return isoLocal(d);};
 const plus=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return isoLocal(d);};
 const periods=s=>{const d=new Date(s+'T12:00:00'),m=plus(s,-(d.getDay()+6)%7),a=plus(s,1),anniversary=new Date(a+'T12:00:00');anniversary.setFullYear(anniversary.getFullYear()+1);return {weekly:{start:m,end:s},ahead:{start:a,end:plus(isoLocal(anniversary),-1)}};};
 const empty=s=>({weekEnding:s,vtSecondType:'Virtual VT',sources:{},overrides:{},manual:{},comments:'',commentsEdited:false});
 let view='home',week=null,draft=null,existing={},inExcel=false,editing=false,info=null,preview=null,listing=[],listError=null;
 let active=0,year='',month='all',term='',page=0,manualUndo={},currentSaving=false,pending=false;
 const host=()=>document.getElementById('app');
 function toast(err){UX.showToast(err?.message||String(err),'error');}
 function setPage(){UX.setHeader('Weekly Report Weeks');UX.page='weekly-weeks';}
 function maskLoading(){host().innerHTML='<div class="page-loading"><span class="spin"></span>Loading Weekly Report…</div>';}
 function getSource(col){const group=METRICS.find(m=>m.col===col)?.group;const s=draft.sources?.[group];return group==='ahead'&&s?.periodMode!=='annual'?null:s;}
 function csvBase(col){const source=getSource(col);if(!source)return null;const group=METRICS.find(m=>m.col===col)?.group;if(!slots().metricReady(group,col,source))return null;const types=TYPES[col];if(!types)return null;return types.reduce((sum,k)=>sum+(source.counts?.[k]?.valid||0),0);}
 function original(col){const v=existing?.[col];return v===undefined||v===null||v===''?null:v;}
 function valueOf(col){if(Object.hasOwn(draft?.overrides||{},col))return draft.overrides[col];if(Object.hasOwn(draft?.manual||{},col))return draft.manual[col];const calculated=csvBase(col);if(calculated!==null)return calculated;return METRICS.find(m=>m.col===col)?.group==='ahead'?null:original(col);}
 function imported(group){return !!draft?.sources?.[group];}
 function hasEdit(col){return Object.hasOwn(draft?.overrides||{},col)||Object.hasOwn(draft?.manual||{},col);}
 function title(){return 'Weekly Report';}
 async function dialogChoice({heading,message,choices}){
  return new Promise(resolve=>{
   const root=$('#dialogRoot');
   root.innerHTML=`<div class="wr-overlay"><section class="wr-modal" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><p>${esc(message)}</p><div class="wr-actions">${choices.map((o,i)=>`<button type="button" class="btn ${o.primary?'btn-primary':''}" data-choice="${i}">${esc(o.label)}</button>`).join('')}</div></section></div>`;
   const finish=v=>{root.innerHTML='';document.removeEventListener('keydown',onKey);resolve(v);};
   const onKey=e=>{if(e.key==='Escape')finish('cancel');};document.addEventListener('keydown',onKey);
   root.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>finish(choices[Number(b.dataset.choice)].value));
   root.querySelector('.wr-overlay').onclick=e=>{if(e.target.classList.contains('wr-overlay'))finish('cancel');};
   root.querySelector('button')?.focus();
  });
 }
 async function dialogNumber(label,current,base){
  return new Promise(resolve=>{
   const root=$('#dialogRoot');
   root.innerHTML=`<div class="wr-overlay"><form class="wr-modal" id="wrNumForm" role="dialog" aria-modal="true" aria-label="${esc(label)}"><h2>${esc(label)}</h2><label class="wr-field">Value<input id="wrNumeric" type="number" min="0" step="1" value="${typeof current==='number'?current:''}" placeholder="Enter a number" required></label>${base!==null?`<p class="wr-dialog-caption">Imported value: <strong>${esc(base)}</strong></p>`:''}<div id="wrNumError" class="wr-input-error"></div><div class="wr-actions"><button type="button" class="btn" id="wrNumCancel">Cancel</button><button type="submit" class="btn btn-primary">Save value</button></div></form></div>`;
   const cleanup=val=>{root.innerHTML='';document.removeEventListener('keydown',onKey);resolve(val)};
   const onKey=e=>{if(e.key==='Escape')cleanup(null)};document.addEventListener('keydown',onKey);
   $('#wrNumCancel').onclick=()=>cleanup(null);$('#wrNumeric').focus();$('#wrNumeric').select();
   $('#wrNumForm').onsubmit=e=>{e.preventDefault();const val=$('#wrNumeric').value.trim();if(!validNumber(val)){$('#wrNumError').textContent='Enter a non-negative whole number.';return;}cleanup(Number(val));};
  });
 }
 async function save(showToast=false){if(!draft||currentSaving)return;currentSaving=true;try{await api().saveWeeklyDraft(draft);pending=true;if(showToast)UX.showToast('Draft saved.');const el=$('#wrSaved');if(el)el.textContent='Draft';}catch(e){toast(e);}finally{currentSaving=false;}}
 async function home(){const id=++active;view='home';week=null;draft=null;preview=null;editing=false;setPage();if(listing.length&&info)renderHome();else maskLoading();
  try{const [meta,list]=await Promise.all([api().getWeeklyInfo(),api().listWeeklyReports()]);if(id!==active||view!=='home')return;info=meta;listing=list.weeks||[];listError=list.workbookError||null;
   const available=[...new Set(listing.map(x=>x.weekEnding.slice(0,4)))].sort().reverse();if(!year||!available.includes(year))year=available.includes(String(new Date().getFullYear()))?String(new Date().getFullYear()):(available[0]||String(new Date().getFullYear()));
   renderHome();
  }catch(e){if(id!==active)return;host().innerHTML=`<div class="card"><p>Could not load weeks: ${esc(e.message)}</p><button class="btn btn-primary" id="wrRetry">Retry</button></div>`;$('#wrRetry').onclick=home;}
 }
 function isDraftRow(w){return !w.inExcel || !!(w.hasDraft && (!w.exportedAt || (w.savedAt && w.savedAt>w.exportedAt)));}
 function renderHome(){
  setPage();
  const years=[...new Set(listing.map(w=>w.weekEnding.slice(0,4)))].sort().reverse();
  if(!years.includes(String(new Date().getFullYear())))years.unshift(String(new Date().getFullYear()));
  const filtered=listing.filter(w=>(year==='all'||w.weekEnding.slice(0,4)===year)
    &&(month==='all'||w.weekEnding.slice(5,7)===month)
    &&(!term||w.weekEnding.includes(term)||fmt(w.weekEnding).includes(term)||monthDay(w.weekEnding).includes(term)));
  const maxPage=Math.max(0,Math.ceil(filtered.length/24)-1);
  page=Math.max(0,Math.min(page,maxPage));
  const visible=filtered.slice(page*24,page*24+24);
  host().innerHTML=`<div class="wr-page wr-home">
   <header class="wr-dashboard-head"><div><span class="wr-eyebrow">REPORTS</span><h1>Weekly Reports</h1><p>View, edit and create weekly reports.</p></div><div class="wr-actions"><button type="button" id="wrToDashboard" class="btn wr-dashboard-return">&#8592; Back to dashboard</button><button id="wrNew" class="btn btn-primary">+ New Week</button></div></header>
   ${listError?`<div class="wr-notice">Could not open the connected reports file: ${esc(listError)}. Saved drafts are still available.</div>`:''}
   <section class="wr-list-panel"><div class="wr-list-top"><h2>Reporting history</h2><div class="wr-filters"><label class="wr-filter-label" for="wrYear">Year<select id="wrYear"><option value="all" ${year==='all'?'selected':''}>All years</option>${years.map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('')}</select></label><label class="wr-filter-label" for="wrMonth">Month<select id="wrMonth"><option value="all" ${month==='all'?'selected':''}>All months</option>${MONTH_NAMES.map((name,i)=>{const num=String(i+1).padStart(2,'0');return `<option value="${num}" ${month===num?'selected':''}>${name}</option>`;}).join('')}</select></label><label class="wr-filter-label wr-filter-search" for="wrFind">Search<input id="wrFind" type="search" placeholder="Search date (MM/DD)" value="${esc(term)}" aria-label="Find a reporting week"></label></div></div>
   ${visible.length?`<div class="wr-history-scroll" role="region" aria-label="Weekly report history table" tabindex="0"><table class="wr-history-table"><thead><tr class="wr-history-groups"><th rowspan="2" class="wr-history-week">Week ending</th><th colspan="4" class="wr-history-ahead">Ahead · 1 year</th><th colspan="9" class="wr-history-weekly">This Week</th><th rowspan="2" class="wr-history-notes">Notes</th><th rowspan="2" class="wr-history-status">Status</th><th rowspan="2" class="wr-history-edit">Action</th></tr><tr class="wr-history-cols">${METRICS.map(m=>`<th class="${m.group==='ahead'?'wr-ahead-col':'wr-weekly-col'}" title="${esc(m.name)}" scope="col"><span class="wr-col-letter">${m.col}</span>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${visible.map(w=>`<tr><th scope="row" class="wr-history-week">${fmt(w.weekEnding)}</th>${METRICS.map(m=>{const value=w.values?.[m.col];return `<td class="wr-history-num ${value===null||value===undefined?'wr-history-missing':''}" title="${esc(m.name)}">${value===null||value===undefined?'—':esc(value)}</td>`;}).join('')}<td class="wr-history-notes"><span class="wr-history-note-text" title="${esc(w.notes||'')}">${esc(w.notes||'—')}</span></td><td class="wr-history-status">${isDraftRow(w)?'<span class="wr-state draft">Draft</span>':w.inExcel?'<span class="wr-state wr-saved">Saved</span>':'—'}</td><td class="wr-history-edit"><div class="wr-history-actions"><button class="btn btn-sm btn-primary" data-edit-week="${w.weekEnding}" aria-label="Edit week ending ${fmt(w.weekEnding)}">Edit</button>${!w.inExcel&&w.hasDraft?`<button class="wr-icon-action" data-delete="${w.weekEnding}" title="Delete draft" aria-label="Delete draft for ${fmt(w.weekEnding)}">×</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:'<div class="wr-blank"><h3>No weeks found</h3><p>Try another month or year, or create a new week.</p></div>'}
   <footer class="wr-pagination" ${maxPage===0?'hidden':''}><span>Page ${page+1} of ${maxPage+1}</span><div class="wr-actions"><button id="wrPrev" class="btn btn-sm" ${!page?'disabled':''}>Previous</button><button id="wrNext" class="btn btn-sm" ${page>=maxPage?'disabled':''}>Next</button></div></footer></section>
  </div>`;
  $('#wrToDashboard').onclick=()=>window.renderWeeklyDashboard();
  $('#wrNew').onclick=newWeek;
  $('#wrYear').onchange=e=>{year=e.target.value;page=0;renderHome();};
  $('#wrMonth').onchange=e=>{month=e.target.value;page=0;renderHome();};
  $('#wrFind').oninput=e=>{term=e.target.value;page=0;const pos=e.target.selectionStart;renderHome();const el=$('#wrFind');el.focus();el.setSelectionRange(pos,pos);};
  $('#wrPrev').onclick=()=>{page--;renderHome()};$('#wrNext').onclick=()=>{page++;renderHome()};
  host().querySelectorAll('[data-edit-week]').forEach(b=>b.onclick=()=>openWeek(b.dataset.editWeek,true));
  host().querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const day=b.dataset.delete;if(!await UX.confirm({title:'Delete this draft?',message:`Delete the locally saved week ending ${fmt(day)}? This action cannot be undone. The saved report will not be changed.`,confirmLabel:'Delete draft'}))return;
   try{await api().deleteWeeklyDraft(day);await home();UX.showToast('Draft removed.')}catch(e){toast(e)};
  });
 }
 async function newWeek(){const root=$('#dialogRoot');root.innerHTML=`<div class="wr-overlay"><form class="wr-modal" id="wrNewForm" role="dialog" aria-modal="true"><h2>New reporting week</h2><label class="wr-field">Week ending<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="Week ending (MM/DD/YYYY)" id="wrNewDate" required value="${fmt(lastFriday())}"></label><div class="wr-actions"><button type="button" class="btn" id="wrNewCancel">Cancel</button><button type="submit" class="btn btn-primary">Continue</button></div></form></div>`;
  $('#wrNewCancel').onclick=()=>root.innerHTML='';$('#wrNewDate').oninput=e=>e.target.setCustomValidity('');$('#wrNewForm').onsubmit=async e=>{e.preventDefault();const date=ClinicDates.toISODate($('#wrNewDate').value);if(!date){$('#wrNewDate').setCustomValidity('Enter a valid date in MM/DD/YYYY format.');$('#wrNewDate').reportValidity();return;}root.innerHTML='';if(listing.some(w=>w.weekEnding===date))await openWeek(date,true);else{const created=empty(date);try{await api().saveWeeklyDraft(created);await openWeek(date,true);}catch(e){toast(e);}}};
 }
 async function openWeek(date,edit=false){const id=++active;view='detail';week=date;editing=edit;preview=null;setPage();maskLoading();
  try{const [loaded,meta]=await Promise.all([api().loadWeeklyDraft(date),api().getWeeklyInfo()]);if(id!==active)return;
   draft=loaded.draft||empty(date);draft.sources||={};draft.overrides||={};draft.manual||={};draft.vtSecondType='Virtual VT';
   existing=loaded.existing||{};inExcel=!!loaded.inExcel;pending=!!(draft.savedAt&&(!draft.exportedAt||draft.savedAt>draft.exportedAt));info=meta;manualUndo={};renderWeek();
  }catch(e){host().innerHTML=`<div class="card"><p>${esc(e.message)}</p><button class="btn" id="wrBack">Back to weeks</button></div>`;$('#wrBack').onclick=home;}
 }
 function metricHtml(metric){const {col,name,manual}=metric,value=valueOf(col),base=csvBase(col),overridden=hasEdit(col);
  return `<article class="wr-value-card ${overridden?'wr-override':''}"><div class="wr-value-title"><span>${esc(name)}</span>${overridden?'<span class="wr-manual-badge">Adjusted</span>':''}</div><div class="wr-value-main"><strong>${value===null?'—':esc(value)}</strong>${editing?`<button class="wr-edit-icon" data-field="${col}" aria-label="Edit ${esc(name)}" title="Edit ${esc(name)}"><span aria-hidden="true">✎</span> Edit</button>`:''}</div>${overridden&&base!==null?`<div class="wr-value-bottom">From CSV: ${base} ${editing?`<button class="wr-text-button" data-restore="${col}">Restore</button>`:''}</div>`:(manual&&editing&&Object.hasOwn(manualUndo,col)?`<div class="wr-value-bottom"><button class="wr-text-button" data-undo="${col}">Undo change</button></div>`:(!editing&&value===null?'<span class="wr-muted">Not entered</span>':''))}</article>`;
 }
 function csvBox(group){
  const source=draft.sources[group],legacy=group==='ahead'&&source&&source.periodMode!=='annual';
  if(group==='weekly'){
   const x=source;
   return `<div class="wr-upload ${x?'wr-upload-ready':''}"><div><h3>This Week</h3></div><div class="wr-upload-action">${x?`<span class="wr-file-pill">✓ ${esc(x.fileName)}</span>`:''}${editing?`<button class="btn ${x?'':'btn-primary'}" data-slot-import="week-all">${x?'Replace CSV':'Select CSV'}</button>`:''}${editing&&x?`<button class="btn wr-file-action" data-weekly-remove="1">Remove</button>`:''}</div>${x?`<details class="wr-import-more"><summary>${x.rows} appointments · View details</summary><div class="wr-import-stats"><span>${x.canceled} canceled</span><span>${x.missed} missed</span><span>${Object.keys(x.counts||{}).length} appointment types</span></div>${x.duplicateCount?`<div class="wr-notice">${x.duplicateCount} possible duplicate rows; none were removed.</div>`:''}<div class="wr-table-scroll"><table><thead><tr><th>Type</th><th>Total</th><th>Canceled</th><th>Missed</th><th>Valid</th></tr></thead><tbody>${Object.entries(x.counts||{}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.total}</td><td>${v.canceled}</td><td>${v.missed}</td><td><strong>${v.valid}</strong></td></tr>`).join('')}</tbody></table></div></details>`:''}</div>`;
  }
  const files=annual().filesOf(source),groups=slots().of('ahead');
  const card=slot=>{
   const record=files.find(f=>f.slotId===slot.id),index=files.indexOf(record),has=!!record;
   return `<div class="wr-slot ${has?'wr-slot-ready':''}"><div class="wr-slot-main"><div class="wr-slot-title"><span class="wr-slot-indicator">${has?'&#10003;':'+'}</span><strong>${esc(slot.id==='ahead-therapists'?'Virtual Orientation':slot.title)}</strong></div>${has?`<div class="wr-slot-file"><strong>${esc(record.fileName)}</strong></div>`:''}${has&&slot.id==='ahead-doctors'&&!record.counts?.['Patient Consultation']?.total?'<div class="wr-slot-alert">Patient Consultation was not found in this export. Confirm that the Doctors CSV includes this category even if its count is zero.</div>':''}</div>${editing?`<div class="wr-slot-actions"><button class="btn ${has?'':'btn-primary'} wr-file-action" data-slot-import="${slot.id}">${has?'Replace CSV':'Select CSV'}</button>${has?`<button class="btn wr-file-action" data-slot-remove="${index}">Remove</button>`:''}</div>`:''}</div>`;
  };
  return `<div class="wr-upload wr-slot-upload"><div class="wr-ahead-upload-head"><div><h3>Ahead - One Year</h3></div></div>
   ${legacy?'<div class="wr-notice wr-ahead-warning">This report contains an earlier four-week Ahead import. Its totals are not used in the annual calculation. Import the two annual CSVs below to replace it.</div>':''}
   <div class="wr-slot-list">${groups.map(card).join('')}</div>
   ${source?.periodMode==='annual'?`<details class="wr-import-more"><summary>${source.rows} appointments across ${files.length} files · View totals</summary><div class="wr-import-stats"><span>${source.canceled} canceled</span><span>${source.missed} missed</span><span>${Object.keys(source.counts||{}).length} recognized types</span></div><div class="wr-table-scroll"><table><thead><tr><th>Type</th><th>Total</th><th>Canceled</th><th>Missed</th><th>Valid</th></tr></thead><tbody>${Object.entries(source.counts||{}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.total}</td><td>${v.canceled}</td><td>${v.missed}</td><td><strong>${v.valid}</strong></td></tr>`).join('')}</tbody></table></div></details>`:''}
   </div>`;
 }

 function previewHtml(){if(!preview)return '';const labels=Object.fromEntries(METRICS.map(x=>[x.col,x.name]));const values=Object.entries(preview.updates).map(([c,v])=>`<tr><td>${esc(labels[c]||'Comments')}</td><td>${esc(preview.existing[c]??'—')}</td><td><strong>${esc(v)}</strong></td></tr>`).join('');
  return `<section class="wr-review" id="wrPreviewBox"><h2>Review changes</h2><p>These values will be ${preview.exists?'updated':'added'} in the connected report. A backup is created automatically.</p><div class="wr-table-scroll"><table><thead><tr><th>Information</th><th>Current value</th><th>New value</th></tr></thead><tbody>${values}</tbody></table></div><div class="wr-actions"><button class="btn" id="wrCancelPreview">Back</button><button class="btn btn-primary" id="wrConfirmExcel">Save report</button></div></section>`;
 }
 function renderWeek(){setPage();const p=periods(week),hasCsv=imported('weekly')||imported('ahead');const adjusted=Object.keys(draft.overrides||{}).length;
  host().innerHTML=`<div class="wr-page wr-detail"><header class="wr-detail-head"><button class="wr-back" id="wrBack">← All weeks</button><div class="wr-detail-title"><div><span class="wr-eyebrow">WEEKLY REPORT</span><h1>Week ending ${fmt(week)}</h1><span class="wr-muted" id="wrSaved">${inExcel&&!pending?'Saved':'Draft'}</span></div><div class="wr-actions">${editing?`<button class="btn" id="wrView">Done editing</button><button class="btn btn-primary" id="wrSave">Save draft</button>`:`<button class="btn btn-primary" id="wrEdit">Edit week</button>`}</div></div></header>
   ${editing?`<div class="wr-edit-tip">${hasCsv?'You can correct any number or replace a CSV.':'You can enter numbers directly or import a CSV.'}${adjusted?` · ${adjusted} adjusted value${adjusted===1?'':'s'}`:''}</div>`:''}
   <section class="wr-report-block wr-weekly-block"><div class="wr-block-heading"><h2>This week</h2><span>${formatPeriod(p.weekly)}</span></div>${csvBox('weekly')}
    <div class="wr-value-grid">${METRICS.filter(m=>m.group==='weekly').map(metricHtml).join('')}</div><div class="wr-comment-field"><label for="wrComments"><strong>Weekly notes</strong></label>${editing?`<textarea id="wrComments" rows="3" placeholder="Optional notes about this week…">${esc(draft.commentsEdited?draft.comments:(original('Q')??''))}</textarea>`:`<p>${esc(draft.commentsEdited?draft.comments:(original('Q')??'No notes added.'))}</p>`}</div></section>
   <section class="wr-report-block wr-ahead-block"><div class="wr-block-heading"><h2>Ahead</h2><span>${formatPeriod(p.ahead)}</span></div>${csvBox('ahead')}
    <div class="wr-value-grid">${METRICS.filter(m=>m.group==='ahead').map(metricHtml).join('')}</div></section>
   <footer class="wr-report-actions"><button class="btn" id="wrBottomBack">Back to all weeks</button>${editing?`<div class="wr-actions"><button class="btn" id="wrBottomSave">Save draft</button><button class="btn btn-primary" id="wrExport">Save report</button></div>`:''}</footer>
   ${previewHtml()}</div>`;
  $('#wrBack').onclick=home;$('#wrBottomBack').onclick=home;
  if(editing){$('#wrView').onclick=async()=>{await captureNotes();await save();editing=false;preview=null;renderWeek()};$('#wrSave').onclick=async()=>{await captureNotes();await save(true)};$('#wrBottomSave').onclick=()=>$('#wrSave').click();
   host().querySelectorAll('[data-slot-import]').forEach(b=>b.onclick=()=>importSlot(b.dataset.slotImport));
   host().querySelectorAll('[data-slot-remove]').forEach(b=>b.onclick=()=>removeAhead(Number(b.dataset.slotRemove)));
   host().querySelectorAll('[data-weekly-remove]').forEach(b=>b.onclick=removeWeekly);
   host().querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>editMetric(b.dataset.field));
   host().querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restore(b.dataset.restore));
   host().querySelectorAll('[data-undo]').forEach(b=>b.onclick=async()=>{const col=b.dataset.undo,prev=manualUndo[col];if(prev===undefined)delete draft.manual[col];else draft.manual[col]=prev;delete manualUndo[col];preview=null;await save();renderWeek();});
   $('#wrExport').onclick=showPreview;
  }else{$('#wrEdit').onclick=()=>{editing=true;renderWeek()};}
  $('#wrComments')?.addEventListener('change',async()=>{await captureNotes();await save()});
  $('#wrCancelPreview')?.addEventListener('click',()=>{preview=null;renderWeek()});
  $('#wrConfirmExcel')?.addEventListener('click',exportExcel);
 }
 async function captureNotes(){const el=$('#wrComments');if(el&&el.value!==(draft.commentsEdited?draft.comments:(original('Q')??''))){draft.comments=el.value;draft.commentsEdited=true;preview=null;}}
 async function editMetric(col){await captureNotes();const metric=METRICS.find(m=>m.col===col),base=csvBase(col);const n=await dialogNumber(metric.name,valueOf(col),base);if(n===null)return;
  const now=valueOf(col);if(now===n)return;
  const confirm=await UX.confirm({title:'Confirm change?',message:base===null?`Use ${n} for ${metric.name}?`:`Use ${n} instead of the imported value ${base} for ${metric.name}? You can restore the imported value later.`,confirmLabel:'Apply change'});
  if(!confirm)return;
  if(metric.manual){manualUndo[col]=Object.hasOwn(draft.manual,col)?draft.manual[col]:undefined;draft.manual[col]=n;}else draft.overrides[col]=n;
  preview=null;await save();renderWeek();
 }
 async function restore(col){if(!await UX.confirm({title:'Restore imported value?',message:'Remove this manual adjustment and use the CSV result again?',confirmLabel:'Restore'}))return;delete draft.overrides[col];preview=null;await save();renderWeek();}
 async function confirmAdjusted(group){
  const fields=METRICS.filter(m=>m.group===group&&Object.hasOwn(draft.overrides,m.col)).map(m=>m.col);
  if(!fields.length)return true;
  const choice=await dialogChoice({heading:'Manual adjustments',message:'Keep existing manual adjustments, or replace them with the new CSV totals?',choices:[{value:'keep',label:'Keep adjustments'},{value:'clear',label:'Use CSV totals',primary:true},{value:'cancel',label:'Cancel'}]});
  if(choice==='cancel')return false;
  if(choice==='clear')fields.forEach(c=>delete draft.overrides[c]);
  return true;
 }
 async function importSlot(slotId){
  await captureNotes();const slot=slots().get(slotId);if(!slot)return;
  try{
   const file=await api().importWeeklyCsv(slot.group,week,slotId);if(!file)return;
   slots().verify(file,slotId);
   if(!await confirmAdjusted(slot.group))return;
   if(slot.group==='weekly'){
    draft.sources.weekly=file;
   }else{
    const old=draft.sources.ahead;
    const current=old?.periodMode==='annual'?old:null;
    const files=annual().filesOf(current),index=files.findIndex(f=>f.slotId===slotId);
    draft.sources.ahead=annual().addFiles(current,[{...file,slotId}],index>=0?index:null,'annual');
   }
   preview=null;await save();renderWeek();UX.showToast(slot.title+' imported successfully.');
  }catch(e){toast(e)}
 }
 async function removeAhead(index){
  await captureNotes();const current=draft.sources.ahead,file=annual().filesOf(current)[index];if(!file)return;
  if(!await UX.confirm({title:'Remove Ahead CSV?',message:'Remove '+file.fileName+'? Its indicators will no longer be calculated from this import.',confirmLabel:'Remove CSV'}))return;
  try{const next=annual().removeFile(current,index);if(next)draft.sources.ahead=next;else delete draft.sources.ahead;preview=null;await save();renderWeek();}catch(e){toast(e)}
 }
 async function removeWeekly(){
  await captureNotes();if(!draft.sources.weekly)return;
  if(!await UX.confirm({title:'Remove weekly CSV?',message:'Remove the weekly appointment totals?',confirmLabel:'Remove CSV'}))return;
  delete draft.sources.weekly;preview=null;await save();renderWeek();
 }

 async function showPreview(){await captureNotes();await save();try{if(!info?.connected)throw new Error('Connect your Weekly Reports file in Settings before saving.');preview=await api().previewWeeklyWrite(draft);renderWeek();$('#wrPreviewBox')?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){toast(e)}}
 async function exportExcel(){if(!preview)return;if(!await UX.confirm({title:'Save this weekly report?',message:'Your weekly report will be saved, and a backup will be created automatically.',confirmLabel:'Save report'}))return;
  try{const result=await api().writeWeeklyWorkbook(draft,preview.fileVersion);preview=null;inExcel=true;pending=false;editing=false;const newData=await api().loadWeeklyDraft(week);existing=newData.existing||{};draft=newData.draft||draft;renderWeek();UX.showToast('Weekly report saved successfully.');}catch(e){toast(e)}
 }
 window.renderWeeklyReportWeeks=()=>{window.stopWeeklyDashboard?.();return home();};
 window.renderWeeklyReport=()=>window.renderWeeklyDashboard();
})();
