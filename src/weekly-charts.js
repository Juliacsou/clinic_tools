/* Reports Dashboard — Weekly, Monthly, and Patients Scheduled charts.
   Uses only values saved in the local clinic workbooks. No external chart library or network connection is required. */
(function(){
 'use strict';
 const api=()=>window.clinicAPI, UX=window.UX, el=id=>document.getElementById(id);
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const toUS=iso=>{if(typeof ClinicDates!=='undefined'&&ClinicDates?.toUSDate)return ClinicDates.toUSDate(iso)||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return '';const [y,m,d]=iso.split('-');return `${m}/${d}/${y}`;};
 const toISO=us=>{if(typeof ClinicDates!=='undefined'&&ClinicDates?.toISODate)return ClinicDates.toISODate(us)||'';const m=String(us||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return '';return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;};
 const GROUPS={
  scheduled:{label:'Patients Scheduled',kicker:'PATIENT SETUP ANALYTICS',description:'Patients added to Initial Contact & Setup, grouped by Day, Week, or Month within your chosen period.',color:'#159947',unitLabel:'period',metrics:[
   {id:'S',name:'Patients Scheduled'}]},
  weekly:{label:'This Week',kicker:'WEEKLY PERFORMANCE',description:'Appointments and activity reported for each week.',color:'#138678',unitLabel:'week',metrics:[
   {id:'F',name:'New Inquiries'}, {id:'G',name:'Ocular Motor Exams'}, {id:'H',name:'Perception Tests'},
   {id:'I',name:'VT Consultations'}, {id:'J',name:'New VT Starts'},
   {id:'K',name:'VT Patients Enrolled'}, {id:'L',name:'Discontinued Patients'},
   {id:'M',name:'VT Sessions'}, {id:'N',name:'VT Closings'}]},
  ahead:{label:'Ahead',kicker:'FORWARD LOOK',description:'Each point shows the following year as projected at that Week Ending date.',color:'#3975bd',unitLabel:'week',metrics:[
   {id:'B',name:'Ocular Motor'}, {id:'C',name:'Perception Tests'},
   {id:'D',name:'VT Consultations'}, {id:'E',name:'Scheduled VT Starts'}]},
  monthly:{label:'Monthly Report',kicker:'MONTHLY PERFORMANCE',description:'Monthly clinic indicators across completed calendar months.',color:'#5372bb',unitLabel:'month',metrics:[
   {id:'B',name:'Inquiries'}, {id:'C',name:'Free Screenings'}, {id:'D',name:'OM Exams Done'},
   {id:'E',name:'Percept Test Done'}, {id:'F',name:'VT Consults Done'}, {id:'G',name:'New VT Starts'},
   {id:'H',name:'VT Patients Enrolled'}, {id:'I',name:'VT Sessions'}, {id:'J',name:'VT Grads'},
   {id:'K',name:'EP 99213 Cancelled'}, {id:'L',name:'Office Follow-Up Cancelled'}]}
 };
 const SERIES_COLORS=['#0d867e','#316eb3','#dc8a26','#985ec6','#d55269','#5a8a35','#506e87','#ae6534','#1f8ac0','#b84a7c','#6c7a29','#3d5a99'];
 const selections={
  scheduled:{selected:['S'],unit:'day',range:'3m',start:'',end:''},
  weekly:{selected:['G'],range:'6m',start:'',end:''},
  ahead:{selected:['B'],range:'6m',start:'',end:''},
  monthly:{selected:['D'],range:'12m',start:'',end:''}
 };
 let rows=[],monthlyRows=[],setupRecords=[],hasExtraLoaders=false,loadError='',loading=false,requestId=0,activeSection='all';
 const fdate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '—';const [y,m,day]=d.split('-');return `${m}/${day}/${y}`;};
 const shortDate=d=>{if(!d)return '—';const [y,m,day]=d.split('-');return new Date(Date.UTC(+y,+m-1,+day)).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});};
 const readable=d=>{if(!d)return '—';const [y,m,day]=d.split('-');return new Date(Date.UTC(+y,+m-1,+day)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
 const shortMonth=ym=>{if(!/^\d{4}-\d{2}$/.test(ym||''))return '—';const [y,m]=ym.split('-');return new Date(Date.UTC(+y,+m-1,1)).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});};
 const readableMonth=ym=>{if(!/^\d{4}-\d{2}$/.test(ym||''))return '—';const [y,m]=ym.split('-');return new Date(Date.UTC(+y,+m-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});};
 const daysInUtcMonth=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
 const monthEndIso=ym=>{if(!/^\d{4}-\d{2}$/.test(ym||''))return '';const [y,m]=ym.split('-').map(Number);return `${ym}-${String(daysInUtcMonth(y,m)).padStart(2,'0')}`;};
 const addUtcDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const addUtcMonths=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);};
 const mondayOf=iso=>{const d=new Date(iso+'T12:00:00Z'),day=d.getUTCDay(),diff=(day+6)%7;d.setUTCDate(d.getUTCDate()-diff);return d.toISOString().slice(0,10);};
 const safeValue=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v.trim())?Number(v.trim()):null);
 function time(d){return Date.parse(d+'T00:00:00Z');}

 function extractSetupDate(r){
  const raw=String(r?.scheduledOn||r?.initialContactDate||r?.date||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  return toISO(raw);
 }

 function buildScheduledBuckets(records,st=selections.scheduled){
  const dates=(Array.isArray(records)?records:[]).map(extractSetupDate).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if(!dates.length&&(!st.start||!st.end))return [];
  const lastDate=dates[dates.length-1]||new Date().toISOString().slice(0,10);
  const firstDate=dates[0]||lastDate;
  let fromIso,toIso;
  if(st.range==='custom'||st.start||st.end){
   toIso=st.end||lastDate;
   fromIso=st.start||firstDate;
  }else if(st.range==='all'){
   fromIso=firstDate;toIso=lastDate;
  }else if(st.range==='30d'){
   toIso=lastDate;fromIso=addUtcDays(toIso,-29);
  }else{
   const months=Number(String(st.range||'3m').replace('m',''))||3;
   toIso=lastDate;fromIso=addUtcMonths(toIso,-months);
  }
  if(fromIso>toIso)return [];
  const unit=st.unit||'day';
  const countByDay=new Map();
  for(const d of dates){if(d>=fromIso&&d<=toIso)countByDay.set(d,(countByDay.get(d)||0)+1);}
  const out=[];
  if(unit==='day'){
   let cur=fromIso,guard=0;
   while(cur<=toIso&&guard<1500){
    out.push({weekEnding:cur,axisLabel:shortDate(cur),tipTitle:readable(cur),tipKind:'Date',tableDate:fdate(cur),values:{S:countByDay.get(cur)||0}});
    cur=addUtcDays(cur,1);guard++;
   }
   return out;
  }
  if(unit==='week'){
   let wMon=mondayOf(fromIso),guard=0;
   while(wMon<=toIso&&guard<500){
    const wSun=addUtcDays(wMon,6);
    const bStart=wMon<fromIso?fromIso:wMon;
    const bEnd=wSun>toIso?toIso:wSun;
    let sum=0;
    for(const [d,c] of countByDay.entries()){if(d>=bStart&&d<=bEnd)sum+=c;}
    out.push({
     weekEnding:bEnd,
     axisLabel:bStart===bEnd?shortDate(bStart):`${shortDate(bStart)}–${shortDate(bEnd)}`,
     tipTitle:`${readable(bStart)} – ${readable(bEnd)}`,
     tipKind:'Week',
     tableDate:`${fdate(bStart)} – ${fdate(bEnd)}`,
     values:{S:sum}
    });
    wMon=addUtcDays(wMon,7);guard++;
   }
   return out;
  }
  // unit === 'month'
  const [sy,sm]=fromIso.slice(0,7).split('-').map(Number);
  const [ey,em]=toIso.slice(0,7).split('-').map(Number);
  let y=sy,m=sm,guard=0;
  while((y<ey||(y===ey&&m<=em))&&guard<240){
   const ym=`${y}-${String(m).padStart(2,'0')}`;
   const mStart=`${ym}-01`,mEnd=monthEndIso(ym);
   const bStart=mStart<fromIso?fromIso:mStart;
   const bEnd=mEnd>toIso?toIso:mEnd;
   let sum=0;
   for(const [d,c] of countByDay.entries()){if(d>=bStart&&d<=bEnd)sum+=c;}
   out.push({
    weekEnding:bEnd,
    axisLabel:shortMonth(ym),
    tipTitle:readableMonth(ym),
    tipKind:'Month',
    tableDate:readableMonth(ym),
    values:{S:sum}
   });
   m++;if(m>12){m=1;y++;}guard++;
  }
  return out;
 }

 function sourceRowsFor(group){
  return group==='monthly'?monthlyRows:rows;
 }
 function startOfRange(group){
  const st=selections[group],list=sourceRowsFor(group);
  if(st.range==='custom')return st.start||'0000-01-01';
  if(st.range==='all')return '0000-01-01';
  const last=list.length?list[list.length-1].weekEnding:'';
  if(!last)return '0000-01-01';
  const d=new Date(last+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-Number(st.range.replace('m','')));
  return d.toISOString().slice(0,10);
 }
 function filtered(group){
  if(group==='scheduled')return buildScheduledBuckets(setupRecords,selections.scheduled);
  const list=sourceRowsFor(group);
  const from=startOfRange(group),to=selections[group].range==='custom'?(selections[group].end||'9999-12-31'):'9999-12-31';
  return from>to?[]:list.filter(r=>r.weekEnding>=from&&r.weekEnding<=to);
 }
 function niceNumber(n){return Number.isInteger(n)?String(n):n.toFixed(1).replace(/\.0$/,'');}
 function metricOptions(group){const st=selections[group];return GROUPS[group].metrics.map((m,i)=>{
  const color=SERIES_COLORS[i%SERIES_COLORS.length];
  const on=st.selected.includes(m.id);return `<label class="wd-metric-chip ${on?'wd-metric-on':''}" style="--chip-color:${color}"><input type="checkbox" data-metric="${m.id}" ${on?'checked':''}><span class="wd-chip-mark"></span>${escapeHtml(m.name)}</label>`;
 }).join('');}
 function pointsFor(data,metric){return data.map(r=>safeValue(r.values?.[metric.id]));}
 function totalForMetric(data,metric){
  const valid=data.map(r=>safeValue(r.values?.[metric.id])).filter(v=>v!==null);
  return {total:valid.length?valid.reduce((sum,v)=>sum+v,0):null,count:valid.length};
 }
 function pointTooltipMarkup(group,row,chosen){
  const metrics=GROUPS[group].metrics;
  const heading=row.tipTitle||readable(row.weekEnding);
  const sub=row.tipKind||(group==='monthly'?'Month':'Week ending');
  return `<div class="wd-tip-heading"><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(sub)}</span></div>
   <div class="wd-tip-values">${chosen.map(m=>{
    const idx=metrics.findIndex(x=>x.id===m.id);
    const color=group==='scheduled'?'#159947':SERIES_COLORS[(idx>=0?idx:0)%SERIES_COLORS.length];
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
  for(const i of indices){
   const lbl=data[i].axisLabel||shortDate(data[i].weekEnding);
   svg+=`<text x="${x(i)}" y="${H-21}" text-anchor="middle" class="wd-axis-label">${escapeHtml(lbl)}</text>`;
  }
  chosen.forEach(metric=>{
   const idx=GROUPS[group].metrics.findIndex(m=>m.id===metric.id);
   const color=group==='scheduled'?'#159947':SERIES_COLORS[(idx>=0?idx:0)%SERIES_COLORS.length];
   const values=pointsFor(data,metric);let segment=[];
   const flush=()=>{if(segment.length>1)svg+=`<polyline fill="none" stroke="${color}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" points="${segment.join(' ')}"/>`;segment=[];};
   values.forEach((val,i)=>{if(val===null){flush();return;}segment.push(`${x(i).toFixed(2)},${y(val).toFixed(2)}`);});flush();
   values.forEach((val,i)=>{if(val===null)return;svg+=`<circle cx="${x(i).toFixed(2)}" cy="${y(val).toFixed(2)}" r="4.2" fill="${color}" stroke="white" stroke-width="1.6"/>`;});
  });
  data.forEach((row,i)=>{
   const first=i===0?left-20:(x(i-1)+x(i))/2;
   const last=i===data.length-1?W-right+20:(x(i)+x(i+1))/2;
   const desc=chosen.map(m=>`${m.name}: ${safeValue(row.values?.[m.id])??'not recorded'}`).join(', ');
   const title=row.tipTitle||readable(row.weekEnding);
   svg+=`<rect class="wd-hit-zone" data-wd-index="${i}" x="${first.toFixed(2)}" y="${top}" width="${Math.max(1,last-first).toFixed(2)}" height="${H-top-8}" fill="transparent" role="button" tabindex="0" aria-label="${escapeHtml(`${row.tipKind||'Week ending'} ${title}. ${desc}`)}"/>`;
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
    const idx=GROUPS[group].metrics.findIndex(m=>m.id===metric.id);
    const color=group==='scheduled'?'#159947':SERIES_COLORS[(idx>=0?idx:0)%SERIES_COLORS.length];
    return `<circle cx="${pos}" cy="${top+ph-v/ymax*ph}" r="6" fill="${color}" stroke="#fff" stroke-width="2.6"/>`;
   }).join('');
   focus.setAttribute('visibility','visible');
   tip.innerHTML=pointTooltipMarkup(group,data[i],chosen);tip.hidden=false;
   const svgRect=svg.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
   const scale=Math.min(svgRect.width/W,svgRect.height/340);
   const sidePadding=(svgRect.width-W*scale)/2;
   const px=pos*scale+sidePadding+svgRect.left-stageRect.left;
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

 function scheduledChartMarkup(){
  const group='scheduled',st=selections.scheduled,g=GROUPS.scheduled,data=filtered('scheduled'),chosen=g.metrics;
  const any=data.length>0;
  const unitName=st.unit==='day'?'day':st.unit==='week'?'week':'month';
  const unitPlural=st.unit==='day'?'days':st.unit==='week'?'weeks':'months';
  const result=totalForMetric(data,chosen[0]);
  const peak=data.reduce((best,r)=>{const v=safeValue(r.values?.S)||0;return !best||v>best.v?{v,label:r.tipTitle||readable(r.weekEnding)}:best;},null);
  const avg=data.length&&result.total!==null?(result.total/data.length):null;
  const rangeOptions=[['30d','Last 30 days'],['3m','3 months'],['6m','6 months'],['12m','12 months'],['all','All dates'],['custom','Custom range']].map(([v,t])=>`<option value="${v}" ${st.range===v?'selected':''}>${t}</option>`).join('');
  const unitBtns=[['day','By Day'],['week','By Week'],['month','By Month']].map(([u,lbl])=>`<button type="button" class="wd-unit-btn ${st.unit===u?'is-active':''}" data-sched-unit="${u}">${lbl}</button>`).join('');
  const shownFrom=st.start||(data.length?data[0].weekEnding:'');
  const shownTo=st.end||(data.length?data[data.length-1].weekEnding:'');
  return `<section class="wd-card" id="wd-scheduled" style="--wd-accent:${g.color}">
   <div class="wd-card-heading"><div><span class="wd-kicker">${g.kicker}</span><h2>${g.label}</h2><p>${escapeHtml(g.description)}</p></div><span class="wd-range-count">${data.length} ${data.length===1?unitName:unitPlural} in range</span></div>
   <div class="wd-controls">
    <div class="wd-control-row">
     <div class="wd-filter-control"><span>Group by</span><div class="wd-View-toggle" role="group" aria-label="Group patients scheduled by">${unitBtns}</div></div>
     <label class="wd-filter-control">Period<select data-range>${rangeOptions}</select></label>
     <label class="wd-filter-control">From<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="From date (MM/DD/YYYY)" data-start value="${escapeHtml(toUS(shownFrom))}"></label>
     <label class="wd-filter-control">To<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="To date (MM/DD/YYYY)" data-end value="${escapeHtml(toUS(shownTo))}"></label>
    </div>
   </div>
   ${any?`<div class="wd-chart-stage" data-wd-stage>${chartSvg(group,data,chosen)}<div class="wd-chart-tooltip" data-wd-tooltip role="status" aria-live="polite" hidden></div></div><p class="wd-chart-help">Hover over a ${unitName} or click to see the exact number of scheduled patients.</p>
   <div class="wd-stat-heading"><strong>Summary for selected period</strong><span>${escapeHtml(data.length?`${data[0].tipTitle||readable(data[0].weekEnding)} to ${data[data.length-1].tipTitle||readable(data[data.length-1].weekEnding)}`:'')}</span></div>
   <div class="wd-stat-grid">
    <div class="wd-stat"><div class="wd-stat-label">Total Patients Scheduled</div><div class="wd-stat-value">${result.total===null?'—':niceNumber(result.total)}</div><div class="wd-stat-foot">Across ${data.length} ${data.length===1?unitName:unitPlural}</div></div>
    <div class="wd-stat"><div class="wd-stat-label">Average per ${unitName}</div><div class="wd-stat-value">${avg===null?'—':niceNumber(Number(avg.toFixed(1)))}</div><div class="wd-stat-foot">Mean scheduled patients / ${unitName}</div></div>
    <div class="wd-stat"><div class="wd-stat-label">Highest ${unitName}</div><div class="wd-stat-value">${peak?niceNumber(peak.v):'—'}</div><div class="wd-stat-foot">${escapeHtml(peak&&peak.v>0?peak.label:'No patients in this period')}</div></div>
   </div>`:
   `<div class="wd-chart-empty"><div class="wd-empty-icon">⌁</div><strong>No scheduled patients in this period</strong><p>Adjust the From / To dates or add patients through Initial Contact &amp; Setup.</p></div>`}
   ${any?`<details class="wd-data-details"><summary>View chart data</summary><div class="wd-table-wrap"><table><thead><tr><th>${st.unit==='day'?'Date':st.unit==='week'?'Week':'Month'}</th><th>Patients Scheduled</th></tr></thead><tbody>${data.map(r=>`<tr><td>${escapeHtml(r.tableDate||fdate(r.weekEnding))}</td><td>${niceNumber(safeValue(r.values?.S)||0)}</td></tr>`).join('')}</tbody></table></div></details>`:''}
  </section>`;
 }

 function chartMarkup(group){
  if(group==='scheduled')return scheduledChartMarkup();
  const st=selections[group],g=GROUPS[group],data=filtered(group),chosen=g.metrics.filter(m=>st.selected.includes(m.id));
  const any=data.some(r=>chosen.some(m=>safeValue(r.values?.[m.id])!==null));
  const isMonthly=group==='monthly';
  const unitSingular=isMonthly?'month':'week',unitPlural=isMonthly?'months':'weeks';
  const legends=chosen.map(m=>{
   const idx=g.metrics.findIndex(x=>x.id===m.id);
   return `<span class="wd-legend"><i style="background:${SERIES_COLORS[(idx>=0?idx:0)%SERIES_COLORS.length]}"></i>${escapeHtml(m.name)}</span>`;
  }).join('');
  const totalCards=chosen.map(m=>{
   const result=totalForMetric(data,m);
   const detail=result.count===1?`1 reported ${unitSingular}`:`${result.count} reported ${unitPlural}`;
   return `<div class="wd-stat"><div class="wd-stat-label">${escapeHtml(m.name)}</div><div class="wd-stat-value">${result.total===null?'\u2014':niceNumber(result.total)}</div><div class="wd-stat-foot">${result.count?`Sum of ${detail}`:'No values recorded in this period'}</div></div>`;
  }).join('');
  const rangePresets=isMonthly?[['6m','6 months'],['12m','12 months'],['24m','24 months'],['all','All'],['custom','Custom']]:[['3m','3 months'],['6m','6 months'],['12m','12 months'],['all','All'],['custom','Custom']];
  const rangeButtons=rangePresets.map(([v,t])=>`<option value="${v}" ${st.range===v?'selected':''}>${t}</option>`).join('');
  const spanText=data.length?(isMonthly?`${data[0].tipTitle||readable(data[0].weekEnding)} to ${data[data.length-1].tipTitle||readable(data[data.length-1].weekEnding)}`:`${readable(data[0].weekEnding)} to ${readable(data[data.length-1].weekEnding)}`):'';
  return `<section class="wd-card" id="wd-${group}" style="--wd-accent:${g.color}">
   <div class="wd-card-heading"><div><span class="wd-kicker">${g.kicker}</span><h2>${g.label}</h2><p>${escapeHtml(g.description)}</p></div><span class="wd-range-count">${data.length} ${data.length===1?unitSingular:unitPlural} in range</span></div>
   <div class="wd-controls"><div class="wd-control-row"><label class="wd-filter-control">Period<select data-range>${rangeButtons}</select></label>${st.range==='custom'?`<label class="wd-filter-control">From<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="From date (MM/DD/YYYY)" data-start value="${escapeHtml(toUS(st.start))}"></label><label class="wd-filter-control">To<input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" aria-label="To date (MM/DD/YYYY)" data-end value="${escapeHtml(toUS(st.end))}"></label>`:''}</div><div class="wd-metric-heading">Select indicators <span>Choose one or more</span></div><div class="wd-metric-list">${metricOptions(group)}</div></div>
   ${any?`<div class="wd-chart-stage" data-wd-stage>${chartSvg(group,data,chosen)}<div class="wd-chart-tooltip" data-wd-tooltip role="status" aria-live="polite" hidden></div></div><p class="wd-chart-help">Hover over a date or click to see exact values for all selected indicators.</p><div class="wd-legend-row">${legends}</div><div class="wd-stat-heading"><strong>${group==='ahead'?'Total of weekly projections':'Total for selected period'}</strong><span>${escapeHtml(spanText)}</span></div><div class="wd-stat-grid">${totalCards}</div>${group==='ahead'?'<p class="wd-total-hint">Ahead totals add projections from each reporting date. Future one-year windows overlap, so these are not unique appointments. Reports saved under the former four-week rule must be recalculated before comparing historical Ahead values.</p>':(group==='weekly'&&chosen.some(m=>m.id==='K'))||((group==='monthly')&&chosen.some(m=>m.id==='H'))?'<p class="wd-total-hint">VT Patients Enrolled is a point-in-time snapshot. Summing it does not represent unique patients.</p>':''}`:
   `<div class="wd-chart-empty"><div class="wd-empty-icon">⌁</div><strong>No saved data for this selection</strong><p>Try another period or indicator, or save a reporting ${unitSingular} in Excel.</p></div>`}
   ${any?`<details class="wd-data-details"><summary>View chart data</summary><div class="wd-table-wrap"><table><thead><tr><th>${isMonthly?'Month':'Week ending'}</th>${chosen.map(m=>`<th>${escapeHtml(m.name)}</th>`).join('')}</tr></thead><tbody>${data.map(r=>`<tr><td>${escapeHtml(r.tableDate||fdate(r.weekEnding))}</td>${chosen.map(m=>{const v=safeValue(r.values?.[m.id]);return `<td>${v===null?'—':niceNumber(v)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}
  </section>`;
 }
 function dataForGroup(group){return filtered(group);}
 function wire(group){
  const card=el('wd-'+group);if(!card)return;
  const rangeSel=card.querySelector('[data-range]');
  if(rangeSel)rangeSel.onchange=e=>{
   selections[group].range=e.target.value;
   if(group==='scheduled'&&e.target.value!=='custom'){selections.scheduled.start='';selections.scheduled.end='';}
   refreshGroup(group);
  };
  card.querySelectorAll('[data-sched-unit]').forEach(btn=>btn.onclick=()=>{
   selections.scheduled.unit=btn.dataset.schedUnit;
   refreshGroup('scheduled');
  });
  const start=card.querySelector('[data-start]'),end=card.querySelector('[data-end]');
  const changeUSDate=(input,field)=>{const raw=input.value.trim(),iso=raw?toISO(raw):'';
   if(raw&&!iso){input.setCustomValidity('Enter MM/DD/YYYY.');input.reportValidity();return;}
   input.setCustomValidity('');
   if(group==='scheduled')selections.scheduled.range='custom';
   selections[group][field]=iso;refreshGroup(group);
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
  const showScheduled=hasExtraLoaders&&(activeSection==='all'||activeSection==='scheduled');
  const showWeekly=activeSection==='all'||activeSection==='weekly';
  const showMonthly=hasExtraLoaders&&(activeSection==='all'||activeSection==='monthly');
  const anyData=rows.length>0||monthlyRows.length>0||setupRecords.length>0||hasExtraLoaders;
  const sectionTabs=hasExtraLoaders?`<div class="wd-section-tabs" role="tablist" aria-label="Dashboard chart sections">
   <button type="button" class="wd-section-tab ${activeSection==='all'?'is-active':''}" data-wd-section="all">All Charts</button>
   <button type="button" class="wd-section-tab ${activeSection==='scheduled'?'is-active':''}" data-wd-section="scheduled">Patients Scheduled</button>
   <button type="button" class="wd-section-tab ${activeSection==='weekly'?'is-active':''}" data-wd-section="weekly">Weekly Report</button>
   <button type="button" class="wd-section-tab ${activeSection==='monthly'?'is-active':''}" data-wd-section="monthly">Monthly Report</button>
  </div>`:'';
  host.innerHTML=`<div class="wr-page wd-dashboard"><header class="wd-heading"><div><span class="wr-eyebrow">REPORTING &amp; INSIGHTS</span><h1>Reports Dashboard</h1><p>Explore Patients Scheduled, Weekly Report, and Monthly Report trends.</p></div><div class="wd-head-actions"><button class="btn" id="wdRefresh">↻ Refresh</button><button class="btn" id="wdManageMonthly">Monthly Reports →</button><button class="btn btn-primary" id="wdManage">Weekly Reports →</button></div></header>
  ${sectionTabs}
  ${loadError?`<div class="wr-notice wd-error">${escapeHtml(loadError)} <button class="btn btn-sm" id="wdTryAgain">Try again</button></div>`:''}
  ${loading?`<div class="wd-chart-empty"><span class="spin"></span><p>Loading reporting history…</p></div>`:(!anyData?`<div class="wd-first-steps"><h2>${loadError?'Could not load the report':'No saved reporting weeks yet'}</h2><p>${loadError?'Check the connected Excel workbook in Settings, then retry.':'Connect your Weekly Reports workbook in Settings, or create your first week.'}</p><button class="btn btn-primary" id="wdOpenWeeks">Open all weeks</button></div>`:
  `${showScheduled?chartMarkup('scheduled'):''}${showWeekly?(rows.length?chartMarkup('weekly')+chartMarkup('ahead'):(!hasExtraLoaders?'':`<section class="wd-card"><div class="wd-chart-empty"><strong>No saved weekly reports yet</strong><p>Connect your Weekly Reports workbook in Settings or save a reporting week.</p></div></section>`)):''}${showMonthly?chartMarkup('monthly'):''}<p class="wd-note">Charts use values saved to the local clinic Excel workbooks. Unpublished drafts are not included. Missing values are shown as gaps, not zero.</p>`)}</div>`;
  if(el('wdManage'))el('wdManage').onclick=()=>window.renderWeeklyReportWeeks?.();
  if(el('wdManageMonthly'))el('wdManageMonthly').onclick=()=>window.renderMonthlyReport?.();
  if(el('wdOpenWeeks'))el('wdOpenWeeks').onclick=()=>window.renderWeeklyReportWeeks?.();
  if(el('wdRefresh'))el('wdRefresh').onclick=()=>load(true);
  if(el('wdTryAgain'))el('wdTryAgain').onclick=()=>load(true);
  host.querySelectorAll?.('[data-wd-section]')?.forEach(btn=>btn.onclick=()=>{activeSection=btn.dataset.wdSection;render();});
  if(!loading){
   if(showScheduled)wire('scheduled');
   if(showWeekly&&rows.length){wire('weekly');wire('ahead');}
   if(showMonthly)wire('monthly');
  }
 }
 async function load(refresh=false){const id=++requestId;loading=true;loadError='';if(refresh){rows=[];monthlyRows=[];setupRecords=[];}
  hasExtraLoaders=typeof api()?.listMonthlyReports==='function'||typeof api()?.listSetup==='function';
  render();
  try{
   const [weeklyOutcome,monthlyRes,setupRes]=await Promise.all([
    api().getWeeklyChartHistory().then(r=>({ok:true,r}),err=>({ok:false,err})),
    typeof api().listMonthlyReports==='function'?api().listMonthlyReports().catch(()=>({months:[]})):Promise.resolve(null),
    typeof api().listSetup==='function'?api().listSetup().catch(()=>({records:[]})):Promise.resolve(null)
   ]);
   if(id!==requestId)return;
   if(!weeklyOutcome.ok){
    loadError=weeklyOutcome.err?.message||String(weeklyOutcome.err);rows=[];
   }else if(!weeklyOutcome.r?.connected){
    loadError='Connect your Weekly Reports workbook in Settings to view charts.';rows=[];
   }else{
    rows=(Array.isArray(weeklyOutcome.r.rows)?weeklyOutcome.r.rows:[]).filter(w=>/^\d{4}-\d{2}-\d{2}$/.test(w.weekEnding)).sort((a,b)=>a.weekEnding.localeCompare(b.weekEnding));
   }
   if(monthlyRes&&Array.isArray(monthlyRes.months)){
    monthlyRows=monthlyRes.months
     .filter(m=>!m.duplicate&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month)&&(m.inExcel||Object.keys(m.values||{}).length>0))
     .slice()
     .sort((a,b)=>a.month.localeCompare(b.month))
     .map(m=>({
      month:m.month,
      weekEnding:monthEndIso(m.month),
      axisLabel:shortMonth(m.month),
      tipTitle:readableMonth(m.month),
      tipKind:'Month',
      tableDate:readableMonth(m.month),
      values:m.values||{}
     }));
   }else monthlyRows=[];
   if(setupRes&&Array.isArray(setupRes.records)){
    setupRecords=setupRes.records;
   }else setupRecords=[];
  }catch(e){if(id!==requestId)return;loadError=e.message||String(e);rows=[];monthlyRows=[];setupRecords=[];}
  finally{if(id===requestId){loading=false;if(UX.page==='weekly-dashboard')render();}}
 }
 window.renderWeeklyDashboard=()=>load();
 window.stopWeeklyDashboard=()=>{requestId++;loading=false;};
 window.weeklyChartHelpers={
  safeValue,
  totalForMetric,
  pointTooltipMarkup,
  extractSetupDate,
  buildScheduledBuckets,
  startOfRange:(group,history,state)=>{const oldRows=rows,old=selections[group];rows=history;selections[group]=state;try{return startOfRange(group);}finally{rows=oldRows;selections[group]=old;}}
 };
})();
