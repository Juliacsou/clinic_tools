/* Monthly Reports: complete calendar month, automatic CSV totals and manual clinic figures. */
(function(){
'use strict';
const api=()=>window.clinicAPI,UX=window.UX,$=selector=>document.querySelector(selector),host=()=>document.getElementById('app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const names={B:'Inquiries',C:'Free Screenings',D:'OM Exams Done',E:'Percept Test Done',F:'VT Consults Done',G:'New VT Starts',H:'VT Patients Enrolled',I:'VT Sessions',J:'VT Grads',K:'EP 99213 Cancelled',L:'Office Follow-Up Cancelled',M:'Comments'};
const TYPES={D:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'],E:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only'],F:['Patient Consultation'],G:['Virtual Orientation'],I:['Office VT','Virtual VT'],J:['Home Maintenance'],K:['EP 99213'],L:['Office Follow-Up']};
const automatic=['D','E','F','G','I','J','K','L'],manual=['B','C','H'];
const groups={doctors:['D','E','F','K','L'],therapists:['G','I','J']};
const currentMonth=()=>{const now=new Date();now.setDate(1);now.setMonth(now.getMonth()-1);return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;};
const yearMonth=v=>/^(\d{4})-(0[1-9]|1[0-2])$/.test(v);
const heading=month=>{if(!yearMonth(month))return month;return `${MONTHS[Number(month.slice(5))-1]} ${month.slice(0,4)}`;};
const range=month=>{const [y,m]=month.split('-').map(Number);return `${String(m).padStart(2,'0')}/01/${y} – ${String(m).padStart(2,'0')}/${String(new Date(y,m,0).getDate()).padStart(2,'0')}/${y}`;};
const blank=month=>({month,mode:'all',sources:{},manual:{},overrides:{},comments:'',commentsEdited:false});
const valid=v=>/^\d+$/.test(String(v))&&Number.isSafeInteger(Number(v));
const isNonempty=v=>v!==null&&v!==undefined&&v!=='';
let data=[],listError=null,info=null,selected='',draft=null,existing={},inExcel=false,editing=false,pending=false,preview=null,token=0,filterYear='all';
function page(){UX.setHeader('Monthly Reports');UX.page='monthly';}
function loading(){host().innerHTML='<div class="page-loading"><span class="spin"></span>Loading Monthly Reports…</div>';}
function error(e){UX.showToast(e?.message||String(e),'error');}
function fromImport(col){if(!automatic.includes(col))return null;const group=groups.doctors.includes(col)?'doctors':'therapists';const source=draft?.sources?.all||draft?.sources?.[group];if(!source)return null;
 const status=['K','L'].includes(col)?'canceled':'valid';return TYPES[col].reduce((sum,type)=>sum+(source.counts?.[type]?.[status]||0),0);
}
function value(col){if(Object.hasOwn(draft?.overrides||{},col))return draft.overrides[col];if(Object.hasOwn(draft?.manual||{},col))return draft.manual[col];const computed=fromImport(col);if(computed!==null)return computed;return existing?.[col]??null;}
function changed(){return pending||!inExcel;}
async function allMonths(){const id=++token;selected='';draft=null;preview=null;page();loading();
 try{const [meta,results]=await Promise.all([api().getMonthlyInfo(),api().listMonthlyReports()]);if(id!==token)return;
 info=meta;data=results.months||[];listError=results.error||null;renderList();}
 catch(e){host().innerHTML=`<section class="card"><p>${esc(e.message)}</p><button id="mrRetry" class="btn btn-primary">Retry</button></section>`;$('#mrRetry').onclick=allMonths;}
}
function renderList(){page();const years=[...new Set(data.map(x=>x.month.slice(0,4)))].sort().reverse();const visible=data.filter(x=>filterYear==='all'||x.month.slice(0,4)===filterYear);const duplicateGroups=[...new Map(data.filter(x=>x.duplicate).map(x=>[x.month,x.duplicateRows])).entries()];
 host().innerHTML=`<div class="wr-page mr-page"><header class="wr-dashboard-head"><div><span class="wr-eyebrow">REPORTS</span><h1>Monthly Reports</h1></div><div class="wr-actions"><button type="button" id="mrToDashboard" class="btn wr-dashboard-return">&#8592; Back to dashboard</button><button id="mrToWeeks" class="btn">Weekly Reports</button><button id="mrNew" class="btn btn-primary">+ New Month</button></div></header>
 ${!info?.connected?`<div class="wr-notice">${esc(info?.error||'Connect your Weekly Reports workbook in Settings to save Monthly results to Excel.')}</div>`:''}
 ${listError?`<div class="wr-notice">${esc(listError)}</div>`:''}
 ${duplicateGroups.length?`<div class="wr-notice" role="status">Duplicate months in Excel: ${duplicateGroups.map(([m,rows])=>`${esc(heading(m))} (rows ${esc(rows.join(', '))})`).join('; ')}. All other months are available. Review duplicate rows in Excel before editing those months. No workbook data was changed.</div>`:''}
 <section class="wr-list-panel"><div class="wr-list-top"><h2>All Months</h2><label class="wr-filter-label">Year<select id="mrYear"><option value="all">All years</option>${years.map(y=>`<option value="${y}" ${filterYear===y?'selected':''}>${y}</option>`).join('')}</select></label></div>
 ${visible.length?`<div class="wr-history-scroll" role="region" tabindex="0" aria-label="Monthly report history"><table class="wr-history-table mr-history"><thead><tr><th>Month</th>${Object.entries(names).map(([col,name])=>`<th title="${esc(name)}"><span class="wr-col-letter">${col}</span>${esc(name)}</th>`).join('')}<th>Status</th><th>Action</th></tr></thead><tbody>${visible.map(row=>`<tr><th scope="row">${esc(heading(row.month))}${row.duplicate?` <span class="wr-muted">(Excel row ${esc(row.excelRow)})</span>`:''}</th>${Object.keys(names).map(c=>`<td class="${c==='M'?'mr-notes':'wr-history-num'}" title="${esc(row.values?.[c]??'')}">${isNonempty(row.values?.[c])?esc(row.values[c]):'—'}</td>`).join('')}<td>${row.duplicate?'<span class="wr-state draft">Duplicate</span>':row.pending||!row.inExcel?'<span class="wr-state draft">Draft</span>':'<span class="wr-state wr-saved">Saved</span>'}</td><td>${row.duplicate?'<span class="wr-muted">Review Excel</span>':`<button type="button" class="btn btn-primary btn-sm" data-month="${row.month}">Edit</button>`}${!row.duplicate&&!row.inExcel&&row.hasDraft?`<button type="button" class="btn btn-sm" data-delete="${row.month}">Delete</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="wr-blank"><h3>No monthly reports</h3></div>'}
 </section></div>`;
 $('#mrToDashboard').onclick=()=>window.renderWeeklyDashboard?.();
 $('#mrToWeeks').onclick=()=>window.renderWeeklyReportWeeks();$('#mrNew').onclick=newMonth;$('#mrYear').onchange=e=>{filterYear=e.target.value;renderList();};
 host().querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>openMonth(b.dataset.month,true));
 host().querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const month=b.dataset.delete;if(!await UX.confirm({title:'Delete draft?',message:'Only the local draft for '+heading(month)+' will be removed. Excel will not be changed.',confirmLabel:'Delete draft'}))return;try{await api().deleteMonthlyDraft(month);await allMonths();}catch(e){error(e);}});
}
function newMonth(){const root=$('#dialogRoot');root.innerHTML=`<div class="wr-overlay"><form class="wr-modal" id="mrNewForm" role="dialog" aria-modal="true"><h2>New Monthly Report</h2><label class="wr-field">Reporting month<input type="month" id="mrMonthInput" value="${currentMonth()}" required></label><div class="wr-actions"><button type="button" class="btn" id="mrMonthCancel">Cancel</button><button type="submit" class="btn btn-primary">Continue</button></div></form></div>`;
 $('#mrMonthCancel').onclick=()=>root.innerHTML='';$('#mrNewForm').onsubmit=e=>{e.preventDefault();const month=$('#mrMonthInput').value;if(!yearMonth(month))return;root.innerHTML='';openMonth(month,true);};
}
async function openMonth(month,edit=false){const id=++token;page();selected=month;editing=edit;preview=null;loading();try{const [result,meta]=await Promise.all([api().loadMonthlyReport(month),api().getMonthlyInfo()]);if(id!==token)return;
 info=meta;draft=result.draft||blank(month);draft.sources||={};draft.manual||={};draft.overrides||={};existing=result.existing||{};inExcel=result.inExcel;pending=!!result.draft&&(!result.draft.exportedAt||!!(result.draft.savedAt&&result.draft.savedAt>result.draft.exportedAt));renderDetail();}
 catch(e){host().innerHTML=`<div class="card"><p>${esc(e.message)}</p><button id="mrBackError" class="btn">All Months</button></div>`;$('#mrBackError').onclick=allMonths;}
}
function fileRow(slot,title){const item=draft.sources?.[slot];const active=!!item;return `<tr><th scope="row">${esc(title)}</th><td class="mr-upload-name">${active?`${esc(item.fileName)} <span class="wr-muted">(${esc(item.rows)} appointments)</span>`:'—'}</td><td class="mr-row-actions">${editing?`<button type="button" class="btn btn-sm ${active?'':'btn-primary'}" data-import="${slot}">${active?'Replace':'Choose CSV'}</button>${active?`<button type="button" class="btn btn-sm" data-remove="${slot}">Remove</button>`:''}`:active?'<span class="wr-state wr-saved">Imported</span>':'<span class="wr-muted">Not imported</span>'}</td></tr>`;}
function metricRow(col){const v=value(col),computed=fromImport(col),edited=Object.hasOwn(draft.overrides,col),isManual=manual.includes(col);return `<tr><td class="mr-col-letter">${col}</td><th scope="row">${esc(names[col])}</th><td class="mr-table-value">${isNonempty(v)?esc(v):'—'}${edited&&computed!==null?'<span class="mr-adjusted">Adjusted</span>':''}</td><td class="mr-row-actions">${editing?`<button type="button" class="btn btn-sm" data-edit="${col}">${isManual?'Edit':'Adjust'}</button>${edited?`<button type="button" class="btn btn-sm" data-restore="${col}">Use CSV</button>`:''}`:'—'}</td></tr>`;}
function commentsRow(){const comments=draft.commentsEdited?draft.comments:String(existing.M??'');return `<tr class="mr-comment-row"><td class="mr-col-letter">M</td><th scope="row">Comments</th><td colspan="2">${editing?`<textarea id="mrComments" rows="2" aria-label="Monthly comments">${esc(comments)}</textarea>`:`<div class="mr-comment-text">${esc(comments||'—')}</div>`}</td></tr>`;}
function captureComments(){const field=$('#mrComments');if(field&&field.value!==(draft.commentsEdited?draft.comments:String(existing.M??''))){draft.comments=field.value;draft.commentsEdited=true;preview=null;}}
async function save(show=false){captureComments();if(inExcel&&!Object.keys(draft.sources||{}).length&&!Object.keys(draft.manual||{}).length&&!Object.keys(draft.overrides||{}).length&&!draft.commentsEdited){pending=false;return {unchanged:true};}try{const result=await api().saveMonthlyDraft(draft);pending=true;if(show)UX.showToast('Monthly draft saved.');const el=$('#mrStatus');if(el)el.textContent='Draft';return result;}catch(e){error(e);return null;}}
function renderDetail(){page();
 host().innerHTML=`<div class="wr-page mr-page"><header class="wr-detail-head"><button type="button" class="wr-back" id="mrBack">← All Months</button><div class="wr-detail-title"><div><span class="wr-eyebrow">MONTHLY REPORT</span><h1>${esc(heading(selected))}</h1><span class="wr-muted">${esc(range(selected))}</span> · <span id="mrStatus">${changed()?'Draft':'Saved'}</span></div><div class="wr-actions">${editing?`<button class="btn" id="mrDone">Done editing</button><button class="btn btn-primary" id="mrSave">Save draft</button>`:'<button class="btn btn-primary" id="mrEdit">Edit Month</button>'}</div></div></header>
 <section class="wr-report-block mr-block"><div class="wr-block-heading"><h2>This Month</h2></div>
 <div class="mr-import-choice" role="group" aria-label="Monthly CSV import mode"><label><input type="radio" name="mrMode" value="all" ${chooseMode()==='all'?'checked':''} ${!editing?'disabled':''}> Full Schedule (1 CSV)</label><label><input type="radio" name="mrMode" value="split" ${chooseMode()==='split'?'checked':''} ${!editing?'disabled':''}> Separate CSVs (2 files)</label></div>
 <div class="mr-table-scroll" role="region" tabindex="0" aria-label="Monthly CSV files"><table class="mr-upload-table"><thead><tr><th>CSV file</th><th>Imported file</th><th>Action</th></tr></thead><tbody id="mrUploads">${chooseMode()==='all'?fileRow('all','Full Schedule'):fileRow('doctors','Doctors')+fileRow('therapists','Therapists')}</tbody></table></div>
 <div class="mr-table-scroll" role="region" tabindex="0" aria-label="Monthly Report data"><table class="mr-data-table"><thead><tr><th>Col.</th><th>Indicator</th><th>Value</th><th>Action</th></tr></thead><tbody><tr><td class="mr-col-letter">A</td><th scope="row">Month Year</th><td class="mr-table-month">${esc(heading(selected))}</td><td class="mr-row-actions">—</td></tr>${Object.keys(names).filter(c=>c!=='M').map(metricRow).join('')}${commentsRow()}</tbody></table></div>
 </section><footer class="wr-report-actions"><button type="button" class="btn" id="mrBottomBack">All Months</button>${editing?'<button type="button" class="btn btn-primary" id="mrPreview">Save Report to Excel</button>':''}</footer><div id="mrPreviewArea"></div></div>`;
 const back=async()=>{if(editing&&!(await save()))return;await allMonths();};
 $('#mrBack').onclick=back;$('#mrBottomBack').onclick=back;
 if(editing){$('#mrDone').onclick=async()=>{if(await save())editing=false;renderDetail();};$('#mrSave').onclick=()=>save(true);$('#mrPreview').onclick=previewWrite;
  host().querySelectorAll('[data-import]').forEach(b=>b.onclick=()=>importCsv(b.dataset.import));
  host().querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeCsv(b.dataset.remove));
  host().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editValue(b.dataset.edit));
  host().querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{captureComments();delete draft.overrides[b.dataset.restore];await save();renderDetail();});
  host().querySelectorAll('input[name="mrMode"]').forEach(b=>b.onchange=async()=>{
   captureComments();
   const mode=b.value,previous=b.value==='all'?['doctors','therapists']:['all'];
   if(previous.some(s=>draft.sources[s])){
    const okay=await UX.confirm({title:'Switch import mode?',message:'Changing the CSV mode removes previously imported monthly CSV summaries from this draft.',confirmLabel:'Switch mode'});
    if(!okay){renderDetail();return;}previous.forEach(s=>delete draft.sources[s]);
   }
   draft.mode=mode;await save();renderDetail();
  });
  $('#mrComments')?.addEventListener('change',()=>save());
 }else $('#mrEdit').onclick=()=>{editing=true;renderDetail();};
 if(preview)renderPreview();
}
function chooseMode(){return draft.mode||((draft.sources.doctors||draft.sources.therapists)?'split':'all');}
async function importCsv(slot){captureComments();try{
 const s=await api().importMonthlyCsv(selected,slot);if(!s)return;
 // The CSV's detailed patient-level appointments never leave in-memory parsing.
 draft.sources[slot]=s;
 if(slot==='all'){delete draft.sources.doctors;delete draft.sources.therapists;}
 else delete draft.sources.all;
 draft.mode=slot==='all'?'all':'split';preview=null;await save();renderDetail();UX.showToast(s.notice||'Monthly CSV imported.',s.notice?'warning':undefined);
}catch(e){error(e);}}
async function removeCsv(slot){captureComments();if(!await UX.confirm({title:'Remove CSV?',message:'Remove this monthly CSV from the report?',confirmLabel:'Remove CSV'}))return;delete draft.sources[slot];preview=null;await save();renderDetail();}
async function editValue(col){captureComments();const current=value(col);const root=$('#dialogRoot');root.innerHTML=`<div class="wr-overlay"><form class="wr-modal" id="mrNumberForm" role="dialog" aria-modal="true"><h2>${esc(names[col])}</h2><label class="wr-field">Value<input type="number" min="0" step="1" required id="mrNumber" value="${typeof current==='number'?current:''}"></label><div class="wr-actions"><button class="btn" type="button" id="mrNumberCancel">Cancel</button><button class="btn btn-primary" type="submit">Save value</button></div></form></div>`;
 $('#mrNumberCancel').onclick=()=>root.innerHTML='';$('#mrNumberForm').onsubmit=async e=>{e.preventDefault();const raw=$('#mrNumber').value;if(!valid(raw)){error('Enter a non-negative whole number.');return;}root.innerHTML='';if(manual.includes(col))draft.manual[col]=Number(raw);else draft.overrides[col]=Number(raw);preview=null;await save();renderDetail();};$('#mrNumber').focus();}
async function previewWrite(){captureComments();if(!await save())return;try{preview=await api().previewMonthlyWrite(draft);renderDetail();$('#mrPreviewArea')?.scrollIntoView({block:'start',behavior:'smooth'});}catch(e){error(e);}}
function renderPreview(){const target=$('#mrPreviewArea');if(!target||!preview)return;target.innerHTML=`<section class="wr-review"><h2>Review Excel changes</h2>${['K','L'].some(c=>typeof preview.existing?.[c]==='string'&&/[a-z]/i.test(preview.existing[c])&&Object.hasOwn(preview.updates,c))?'<p class="wr-notice">The existing K/L cells contain rescheduling notes. The new numeric CSV counts will replace those notes for this month. A complete workbook backup will be saved.</p>':''}<div class="wr-table-scroll"><table><thead><tr><th>Indicator</th><th>Current Excel</th><th>New</th></tr></thead><tbody>${Object.entries(preview.updates).map(([c,v])=>`<tr><td>${esc(names[c])}</td><td>${esc(preview.existing?.[c]??'—')}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody></table></div><div class="wr-actions"><button class="btn" id="mrCancelPreview">Cancel</button><button class="btn btn-primary" id="mrWrite">Confirm and Save</button></div></section>`;
 $('#mrCancelPreview').onclick=()=>{preview=null;renderDetail();};$('#mrWrite').onclick=writeWorkbook;}
async function writeWorkbook(){if(!preview)return;if(!await UX.confirm({title:'Update Monthly Excel?',message:'Save this monthly report into the connected workbook? A complete backup will be created first.',confirmLabel:'Save report'}))return;
 try{await api().writeMonthlyWorkbook(draft,preview.fileHash);preview=null;editing=false;pending=false;const x=await api().loadMonthlyReport(selected);existing=x.existing||{};inExcel=x.inExcel;draft=x.draft||draft;renderDetail();UX.showToast('Monthly report saved to Excel.');}catch(e){error(e);}}
window.renderMonthlyReport=allMonths;
})();
