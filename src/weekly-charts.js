/* Weekly Reports dashboard — charts use only values already saved in the connected workbook.
   No external chart library or network connection is required. */
(function(){
 'use strict';
 const api=()=>window.clinicAPI, UX=window.UX, el=id=>document.getElementById(id);
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const GROUPS={
  weekly:{label:'This Week',description:'Appointments and activity reported for each week.',color:'#138678',metrics:[
   {id:'F',name:'New Inquiries'}, {id:'G',name:'Ocular Motor Exams'}, {id:'H',name:'Perception Tests'},
   {id:'I',name:'VT Consultations'}, {id:'J',name:'New VT Starts'},
   {id:'K',name:'VT Patients Enrolled'}, {id:'L',name:'Discontinued Patients'},
   {id:'M',name:'VT Sessions'}, {id:'N',name:'VT Closings'}]},
  ahead:{label:'Ahead',description:'Each point shows the following year as projected at that Week Ending date.',color:'#3975bd',metrics:[
   {id:'B',name:'Ocular Motor'}, {id:'C',name:'Perception Tests'},
   {id:'D',name:'VT Consultations'}, {id:'E',name:'Scheduled VT Starts'}]}
 };
 const SERIES_COLORS=['#0d867e','#316eb3','#dc8a26','#985ec6','#d55269','#5a8a35','#506e87','#ae6534'];
 const selections={weekly:{selected:['G'],range:'6m',start:'',end:''},ahead:{selected:['B'],range:'6m',start:'',end:''}};
 let rows=[],loadError='',loading=false,requestId=0;
 const fdate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '—';const [y,m,day]=d.split('-');return `${m}/${day}/${y}`;};
 const shortDate=d=>{if(!d)return '—';const [y,m,day]=d.split('-');return new Date(Date.UTC(+y,+m-1,+day)).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});};
 const readable=d=>{if(!d)return '—';const [y,m,day]=d.split('-');return new Date(Date.UTC(+y,+m-1,+day)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
 const safeValue=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 function time(d){return Date.parse(d+'T00:00:00Z');}
 function startOfRange(group){
  const st=selections[group];if(st.range==='custom')return st.start||'0000-01-01';
  if(st.range==='all')return '0000-01-01';
  const last=rows.length?rows[rows.length-1].weekEnding:'';
  if(!last)return '0000-01-01';
  const d=new Date(last+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-Number(st.range.replace('m','')));
  return d.toISOString().slice(0,10);
 }
 function filtered(group){
  const from=startOfRange(group),to=selections[group].range==='custom'?(selections[group].end||'9999-12-31'):'9999-12-31';
  return from>to?[]:rows.filter(r=>r.weekEnding>=from&&r.weekEnding<=to);
 }
 function niceNumber(n){return Number.isInteger(n)?String(n):n.toFixed(1).replace(/\.0$/,'');}
 function metricOptions(group){const st=selections[group];return GROUPS[group].metrics.map((m,i)=>{
  const on=st.selected.includes(m.id);return `<label class="wd-metric-chip ${on?'wd-metric-on':''}" style="--chip-color:${SERIES_COLORS[i]}"><input type="checkbox" data-metric="${m.id}" ${on?'checked':''}><span class="wd-chip-mark"></span>${escapeHtml(m.name)}</label>`;
 }).join('');}
 function pointsFor(data,metric){return data.map(r=>safeValue(r.values?.[metric.id]));}
 function totalForMetric(data,metric){
  const valid=data.map(r=>safeValue(r.values?.[metric.id])).filter(v=>v!==null);
  return {total:valid.length?valid.reduce((sum,v)=>sum+v,0):null,count:valid.length};
 }
 function pointTooltipMarkup(group,row,chosen){
  const metrics=GROUPS[group].metrics;
  return `<div class="wd-tip-heading"><strong>${escapeHtml(readable(row.weekEnding))}</strong><span>Week ending</span></div>
   <div class="wd-tip-values">${chosen.map(m=>{
    const color=SERIES_COLORS[metrics.findIndex(x=>x.id===m.id)];
    const v=safeValue(row.values?.[m.id]);
    return `<div class="wd-tip-entry"><span class="wd-tip-label"><i style="background:${color}"></i>${escapeHtml(m.name)}</span><strong>${v===null?'Not recorded':niceNumber(v)}</strong></div>`;
   }).join('')}</div>`;
 }
 function chartSvg(group,data,chosen){
  const W=960,H=340,left=64,right=28,top=22,bottom=57,pw=W-left-right,ph=H-top-bottom;
  const max=chosen.reduce((highest,m)=>pointsFor(data,m).reduce((highestValue,v)=>v===null?highestValue:Math.max(highestValue,v),highest),0);
  const ymax=Math.max(4,Math.ceil(max/4)*4),steps=4;
  const dates=data.map(r=>time(r.weekEnding)),tmin=Math.min(...dates),tmax=Math.max(...dates);
  const x=i=>left+(tmin===tmax?pw/2:((dates[i]-tmin)/(tmax-tmin))*pw);
  const y=v=>top+ph-v/ymax*ph;
  let svg=`<svg class="wd-svg" data-wd-svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${escapeHtml(GROUPS[group].label)} line chart with ${data.length} reporting dates" preserveAspectRatio="xMidYMid meet">`;
  for(let j=0;j<=steps;j++){
   const val=(ymax/steps)*j,Y=y(val);
   svg+=`<line x1="${left}" y1="${Y}" x2="${W-right}" y2="${Y}" class="wd-gridline"/><text x="${left-14}" y="${Y+5}" text-anchor="end" class="wd-axis-label">${niceNumber(val)}</text>`;
  }
  const indices=[...new Set([0,Math.round((data.length-1)/4),Math.round((data.length-1)/2),Math.round((data.length-1)*3/4),data.length-1])];
  for(const i of indices)svg+=`<text x="${x(i)}" y="${H-21}" text-anchor="middle" class="wd-axis-label">${escapeHtml(shortDate(data[i].weekEnding))}</text>`;
  chosen.forEach(metric=>{
   const color=SERIES_COLORS[GROUPS[group].metrics.findIndex(m=>m.id===metric.id)];
   const values=pointsFor(data,metric);let segment=[];
   const flush=()=>{if(segment.length>1)svg+=`<polyline fill="none" stroke="${color}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" points="${segment.join(' ')}"/>`;segment=[];};
   values.forEach((val,i)=>{if(val===null){flush();return;}segment.push(`${x(i).toFixed(2)},${y(val).toFixed(2)}`);});flush();
   values.forEach((val,i)=>{if(val===null)return;svg+=`<circle cx="${x(i).toFixed(2)}" cy="${y(val).toFixed(2)}" r="4.2" fill="${color}" stroke="white" stroke-width="1.6"/>`;});
  });
  // A hit region covers each reporting date, including its axis label. This also works on touch devices.
  data.forEach((row,i)=>{
   const first=i===0?left-20:(x(i-1)+x(i))/2;
   const last=i===data.length-1?W-right+20:(x(i)+x(i+1))/2;
   const desc=chosen.map(m=>`${m.name}: ${safeValue(row.values?.[m.id])??'not recorded'}`).join(', ');
   svg+=`<rect class="wd-hit-zone" data-wd-index="${i}" x="${first.toFixed(2)}" y="${top}" width="${Math.max(1,last-first).toFixed(2)}" height="${H-top-8}" fill="transparent" role="button" tabindex="0" aria-label="${escapeHtml(`Week ending ${readable(row.weekEnding)}. ${desc}`)}"/>`;
  });
  svg+=`<g class="wd-focus-layer" data-wd-focus visibility="hidden" pointer-events="none"><line data-wd-crosshair x1="0" x2="0" y1="${top}" y2="${top+ph}" class="wd-crosshair"/><g data-wd-focus-dots></g></g>`;
  svg+='</svg>';return svg;
 }
 function wireChartInteraction(group,card,data,chosen){
  const stage=card.querySelector('[data-wd-stage]');if(!stage)return;
  const svg=stage.querySelector('[data-wd-svg]'),tip=stage.querySelector('[data-wd-tooltip]');
  const focus=stage.querySelector('[data-wd-focus]'),line=stage.querySelector('[data-wd-crosshair]');
  const dots=stage.querySelector('[data-wd-focus-dots]');
  const W=960,left=64,right=28,top=22,ph=261;
  const dates=data.map(r=>time(r.weekEnding)),tmin=Math.min(...dates),tmax=Math.max(...dates);
  const x=i=>left+(tmin===tmax?(W-left-right)/2:(dates[i]-tmin)/(tmax-tmin)*(W-left-right));
  const max=chosen.reduce((highest,m)=>pointsFor(data,m).reduce((v,n)=>n===null?v:Math.max(v,n),highest),0);
  const ymax=Math.max(4,Math.ceil(max/4)*4);
  let pinned=-1,shown=-1;
  const hide=()=>{shown=-1;tip.hidden=true;focus.setAttribute('visibility','hidden');stage.classList.remove('wd-pinned');};
  const show=i=>{
   if(i<0||i>=data.length||shown===i&&!tip.hidden)return;
   shown=i;
   const pos=x(i);line.setAttribute('x1',pos);line.setAttribute('x2',pos);
   dots.innerHTML=chosen.map(metric=>{
    const v=safeValue(data[i].values?.[metric.id]);if(v===null)return '';
    const color=SERIES_COLORS[GROUPS[group].metrics.findIndex(m=>m.id===metric.id)];
    return `<circle cx="${pos}" cy="${top+ph-v/ymax*ph}" r="6" fill="${color}" stroke="#fff" stroke-width="2.6"/>`;
   }).join('');
   focus.setAttribute('visibility','visible');
   tip.innerHTML=pointTooltipMarkup(group,data[i],chosen);tip.hidden=false;
   const svgRect=svg.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
   // The chart can letterbox horizontally when max-height is reached.
   const scale=Math.min(svgRect.width/W,svgRect.height/340);
   const sidePadding=(svgRect.width-W*scale)/2;
   const px=pos*scale+sidePadding+svgRect.left-stageRect.left;
   // Keep the floating panel inside the chart, including near the first/last dates.
   tip.style.left=`${Math.max(5,Math.min(px-tip.offsetWidth/2,stage.clientWidth-tip.offsetWidth-5))}px`;
  };
  stage.querySelectorAll('[data-wd-index]').forEach(hit=>{
   const i=Number(hit.dataset.wdIndex);
   hit.addEventListener('pointerenter',()=>{if(pinned<0)show(i)});
   hit.addEventListener('pointermove',()=>{if(pinned<0)show(i)});
   hit.addEventListener('click',()=>{if(pinned===i){pinned=-1;hide();}else{pinned=i;show(i);stage.classList.add('wd-pinned');}});
   hit.addEventListener('focus',()=>{if(pinned<0)show(i)});
   hit.addEventListener('blur',()=>{if(pinned<0)hide()});
   hit.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();hit.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    else if(e.key==='Escape'){pinned=-1;hide();}
   });
  });
  stage.addEventListener('pointerleave',()=>{if(pinned<0)hide()});
  card.addEventListener('keydown',e=>{if(e.key==='Escape'&&pinned>=0){pinned=-1;hide();}});
 }
 function chartMarkup(group){
  const st=selections[group],g=GROUPS[group],data=filtered(group),chosen=g.metrics.filter(m=>st.selected.includes(m.id));
  const any=data.some(r=>chosen.some(m=>safeValue(r.values?.[m.id])!==null));
  const legends=chosen.map(m=>`<span class="wd-legend"><i style="background:${SERIES_COLORS[g.metrics.findIndex(x=>x.id===m.id)]}"></i>${escapeHtml(m.name)}</span>`).join('');
  const totalCards=chosen.map(m=>{
   const result=totalForMetric(data,m);
   const detail=result.count===1?'1 reported week':`${result.count} reported weeks`;
   return `<div class="wd-stat"><div class="wd-stat-label">${escapeHtml(m.name)}</div><div class="wd-stat-value">${result.total===null?'\u2014':niceNumber(result.total)}</div><div class="wd-stat-foot">${result.count?`Sum of ${detail}`:'No values recorded in this period'}</div></div>`;
  }).join('');
  const rangeButtons=[['3m','3 months'],['6m','6 months'],['12m','12 months'],['all','All'],['custom','Custom']].map(([v,t])=>`<option value="${v}" ${st.range===v?'selected':''}>${t}</option>`).join('');
  return `<section class="wd-card" id="wd-${group}" style="--wd-accent:${g.color}">
   <div class="wd-card-heading"><div><span class="wd-kicker">${group==='weekly'?'WEEKLY PERFORMANCE':'FORWARD LOOK'}</span><h2>${g.label}</h2><p>${escapeHtml(g.description)}</p></div><span class="wd-range-count">${data.length} ${data.length===1?'week':'weeks'} in range</span></div>
   <div class="wd-controls"><div class="wd-control-row"><label class="wd-filter-control">Period<select data-range>${rangeButtons}</select></label>${st.range==='custom'?`<label class="wd-filter-control">From<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="From date (MM/DD/YYYY)" data-start value="${escapeHtml(ClinicDates.toUSDate(st.start)||'')}"></label><label class="wd-filter-control">To<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="To date (MM/DD/YYYY)" data-end value="${escapeHtml(ClinicDates.toUSDate(st.end)||'')}"></label>`:''}</div><div class="wd-metric-heading">Select indicators <span>Choose one or more</span></div><div class="wd-metric-list">${metricOptions(group)}</div></div>
   ${any?`<div class="wd-chart-stage" data-wd-stage>${chartSvg(group,data,chosen)}<div class="wd-chart-tooltip" data-wd-tooltip role="status" aria-live="polite" hidden></div></div><p class="wd-chart-help">Hover over a date or click to see exact values for all selected indicators.</p><div class="wd-legend-row">${legends}</div><div class="wd-stat-heading"><strong>${group==='ahead'?'Total of weekly projections':'Total for selected period'}</strong><span>${escapeHtml(data.length?`${readable(data[0].weekEnding)} to ${readable(data[data.length-1].weekEnding)}`:'')}</span></div><div class="wd-stat-grid">${totalCards}</div>${group==='ahead'?'<p class="wd-total-hint">Ahead totals add projections from each reporting date. Future one-year windows overlap, so these are not unique appointments. Reports saved under the former four-week rule must be recalculated before comparing historical Ahead values.</p>':chosen.some(m=>m.id==='K')?'<p class="wd-total-hint">VT Patients Enrolled is a weekly snapshot. Summing it does not represent unique patients.</p>':''}`:
   `<div class="wd-chart-empty"><div class="wd-empty-icon">⌁</div><strong>No saved data for this selection</strong><p>Try another period or indicator, or save a reporting week in Excel.</p></div>`}
   ${any?`<details class="wd-data-details"><summary>View chart data</summary><div class="wd-table-wrap"><table><thead><tr><th>Week ending</th>${chosen.map(m=>`<th>${escapeHtml(m.name)}</th>`).join('')}</tr></thead><tbody>${data.map(r=>`<tr><td>${fdate(r.weekEnding)}</td>${chosen.map(m=>{const v=safeValue(r.values?.[m.id]);return `<td>${v===null?'—':niceNumber(v)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}
  </section>`;
 }
 function dataForGroup(group){return filtered(group);}
 function wire(group){
  const card=el('wd-'+group);if(!card)return;
  card.querySelector('[data-range]').onchange=e=>{selections[group].range=e.target.value;refreshGroup(group);};
  const start=card.querySelector('[data-start]'),end=card.querySelector('[data-end]');
  const changeUSDate=(input,field)=>{const raw=input.value.trim(),iso=raw?ClinicDates.toISODate(raw):'';
   if(raw&&!iso){input.setCustomValidity('Enter MM/DD/YYYY.');input.reportValidity();return;}
   input.setCustomValidity('');selections[group][field]=iso;refreshGroup(group);
  };
  if(start){start.oninput=e=>e.target.setCustomValidity('');start.onchange=e=>changeUSDate(e.target,'start');}
  if(end){end.oninput=e=>e.target.setCustomValidity('');end.onchange=e=>changeUSDate(e.target,'end');}
  if(dataForGroup(group).length){
   const selected=GROUPS[group].metrics.filter(m=>selections[group].selected.includes(m.id));
   wireChartInteraction(group,card,dataForGroup(group),selected);
  }
  card.querySelectorAll('[data-metric]').forEach(cb=>cb.onchange=e=>{
   const s=selections[group].selected,id=e.target.dataset.metric;
   if(e.target.checked){if(!s.includes(id))s.push(id);}else{
    if(s.length===1){e.target.checked=true;return;}
    selections[group].selected=s.filter(x=>x!==id);
   }
   refreshGroup(group);
  });
 }
 function refreshGroup(group){const card=el('wd-'+group);if(!card)return;card.outerHTML=chartMarkup(group);wire(group);}
 function render(){
  UX.setHeader('Weekly Report Dashboard');UX.page='weekly-dashboard';const host=el('app');
  host.innerHTML=`<div class="wr-page wd-dashboard"><header class="wd-heading"><div><span class="wr-eyebrow">REPORTING &amp; INSIGHTS</span><h1>Weekly Report Dashboard</h1><p>Explore trends across the weeks saved in your report.</p></div><div class="wd-head-actions"><button class="btn" id="wdRefresh">↻ Refresh</button><button class="btn btn-primary" id="wdManage">Manage weeks →</button></div></header>
  ${loadError?`<div class="wr-notice wd-error">${escapeHtml(loadError)} <button class="btn btn-sm" id="wdTryAgain">Try again</button></div>`:''}
  ${loading?`<div class="wd-chart-empty"><span class="spin"></span><p>Loading reporting history…</p></div>`:(!rows.length?`<div class="wd-first-steps"><h2>${loadError?'Could not load the report':'No saved reporting weeks yet'}</h2><p>${loadError?'Check the connected Excel workbook in Settings, then retry.':'Connect your Weekly Reports workbook in Settings, or create your first week.'}</p><button class="btn btn-primary" id="wdOpenWeeks">Open all weeks</button></div>`:chartMarkup('weekly')+chartMarkup('ahead')+`<p class="wd-note">Charts use values saved to the connected Excel workbook. Unpublished drafts are not included. Missing values are shown as gaps, not zero.</p>`)}</div>`;
  if(el('wdManage'))el('wdManage').onclick=()=>window.renderWeeklyReportWeeks();
  if(el('wdOpenWeeks'))el('wdOpenWeeks').onclick=()=>window.renderWeeklyReportWeeks();
  if(el('wdRefresh'))el('wdRefresh').onclick=()=>load(true);
  if(el('wdTryAgain'))el('wdTryAgain').onclick=()=>load(true);
  if(!loading && rows.length){wire('weekly');wire('ahead');}
 }
 async function load(refresh=false){const id=++requestId;loading=true;loadError='';if(refresh)rows=[];render();
  try{const r=await api().getWeeklyChartHistory();if(id!==requestId)return;
   if(!r.connected){loadError='Connect your Weekly Reports workbook in Settings to view charts.';rows=[];}
   else rows=(Array.isArray(r.rows)?r.rows:[]).filter(w=>/^\d{4}-\d{2}-\d{2}$/.test(w.weekEnding)).sort((a,b)=>a.weekEnding.localeCompare(b.weekEnding));
  }catch(e){if(id!==requestId)return;loadError=e.message||String(e);rows=[];}
  finally{if(id===requestId){loading=false;if(UX.page==='weekly-dashboard')render();}}
 }
 window.renderWeeklyDashboard=()=>load();
 window.stopWeeklyDashboard=()=>{requestId++;loading=false;};
 window.weeklyChartHelpers={safeValue,totalForMetric,pointTooltipMarkup,startOfRange:(group,history,state)=>{const oldRows=rows,old=selections[group];rows=history;selections[group]=state;try{return startOfRange(group);}finally{rows=oldRows;selections[group]=old;}}};
})();
