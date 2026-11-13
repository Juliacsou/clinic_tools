/* Weekly Report: privacy-preserving Crystal PM CSV aggregate and period rules.
   This module has no Electron dependency so it can be tested with Node. */
'use strict';
const slots=require('./weekly-slots');
const METRIC_DEFS = [
  { col:'B', group:'ahead', label:'Ocular Motor Booked Ahead', types:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'] },
  { col:'C', group:'ahead', label:'Percep Tests Booked Ahead', types:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only'] },
  { col:'D', group:'ahead', label:'VT Consults Booked Ahead', types:['Patient Consultation'] },
  { col:'E', group:'ahead', label:'VT Pts Scheduled to Start', types:['Virtual Orientation'] },
  { col:'G', group:'weekly', label:'Ocular Motor Exams Done', types:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'] },
  { col:'H', group:'weekly', label:'Percept Test Done', types:['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only'] },
  { col:'I', group:'weekly', label:'VT Consults Done', types:['Patient Consultation'] },
  { col:'J', group:'weekly', label:'New VT Starts', types:['Virtual Orientation'] },
  { col:'M', group:'weekly', label:'VT Sessions', types:['Office VT','Virtual VT'] },
  { col:'N', group:'weekly', label:'VT Closing', types:['Home Maintenance'] }
];
const AUTO_COLS = METRIC_DEFS.map(m=>m.col);
const MANUAL_COLS=['F','K','L'];
const IGNORED_STATUS = new Set(['canceled','cancelled','missed']);
function isoDate(s) {
  const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) throw new Error('Week Ending must be a valid YYYY-MM-DD date.');
  const d=new Date(`${s}T12:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.getUTCFullYear()!=+m[1]||d.getUTCMonth()+1!=+m[2]||d.getUTCDate()!=+m[3]) throw new Error('Invalid Week Ending date.');
  return d;
}
function dateIso(d) {return d.toISOString().slice(0,10);}
function addDays(d,n) {const v=new Date(d);v.setUTCDate(v.getUTCDate()+n);return v;}
function periods(weekEnding) {
  const d=isoDate(weekEnding), day=d.getUTCDay();
  const mon=addDays(d,-((day+6)%7));
  const next=addDays(d,1);
  const anniversary=new Date(next);anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);
  return {weekly:{start:dateIso(mon),end:dateIso(d)},ahead:{start:dateIso(next),end:dateIso(addDays(anniversary,-1))}};
}
function parseCrystalDate(raw) {
  const m=String(raw||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m)return null;
  const s=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  try{return dateIso(isoDate(s));}catch{return null;}
}
function clean(s){return String(s??'').trim().replace(/\s+/g,' ');}
function norm(s){return clean(s).toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' ');}
const LABELS=['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203','EP 99213','Patient Consultation','Virtual Orientation','Office VT','Virtual VT','Home Maintenance','Follow-Up','Office Follow-Up'];
const LABEL_MAP=new Map(LABELS.map(k=>[norm(k),k]));
// Only unambiguous typographical aliases. Never confuse VDE Tech with VDE Doctor-Tech.
LABEL_MAP.set('np99203','NP 99203');
LABEL_MAP.set('ep99213','EP 99213');
LABEL_MAP.set('np 99203','NP 99203');
LABEL_MAP.set('follow up','Follow-Up');
LABEL_MAP.set('f/u','Follow-Up');
// Crystal PM uses Office Follow-Up; retain old generic label for existing drafts.
LABEL_MAP.set('office f/u','Office Follow-Up');
LABEL_MAP.set('office followup','Office Follow-Up');
LABEL_MAP.set('home maintance','Home Maintenance');
LABEL_MAP.set('consultation','Patient Consultation');
LABEL_MAP.set('consult','Patient Consultation');
LABEL_MAP.set('pt consultation','Patient Consultation');
LABEL_MAP.set('pt consult','Patient Consultation');
LABEL_MAP.set('patient consult','Patient Consultation');
function typeOf(v){return LABEL_MAP.get(norm(v))||null;}
// RFC4180 CSV tokenizer (quoted newlines, quoted delimiters, BOM, CRLF).
function csvRows(source) {
  const str=String(source??'').replace(/^\uFEFF/,'');
  const rows=[];let row=[],val='',quoted=false,doneQuote=false;
  for(let i=0;i<str.length;i++) {
    const c=str[i];
    if(quoted){if(c==='"'){if(str[i+1]==='"'){val+='"';i++;}else {quoted=false;doneQuote=true;}}else val+=c;continue;}
    if(c==='"' && !val.trim() && !doneQuote){quoted=true;continue;}
    if(c===','){row.push(val);val='';doneQuote=false;continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&str[i+1]==='\n')i++;row.push(val);val='';doneQuote=false;if(row.some(v=>v!==''))rows.push(row);row=[];continue;}
    if(doneQuote && c!== ' ' && c!=='\t') throw new Error(`Unexpected character after CSV closing quote at position ${i}.`);
    if(!doneQuote) val+=c;
  }
  if(quoted)throw new Error('Invalid CSV: unclosed quoted field.');
  if(row.length||val!==''){row.push(val);if(row.some(v=>v!==''))rows.push(row);}
  return rows;
}
function parseCsv(text, expectedPeriod) {
  const rows=csvRows(text);
  if(rows.length<2)throw new Error('The CSV contains no appointment records.');
  const header=rows[0].map(norm);
  const lookup={};for(const k of ['date','type','status']){lookup[k]=header.indexOf(k);if(lookup[k]<0)throw new Error(`The file does not contain the required "${k}" column.`);}
  const allStatuses={},counts={},unrecognized={},dateSet=new Set(),outside=[],invalid=[],duplicates=[];
  let canceled=0,missed=0,valid=0;
  let duplicateCount=0;
  const idFields=['date','time','patient','doctor','type','status'].map(k=>header.indexOf(k));
  const seen=new Set();
  for(let i=1;i<rows.length;i++) {
    const cols=rows[i];
    if(cols.length!==header.length)throw new Error(`CSV row ${i+1} has ${cols.length} columns; expected ${header.length}.`);
    const date=parseCrystalDate(cols[lookup.date]);
    if(!date){invalid.push(i+1);continue;}
    dateSet.add(date);
    if(expectedPeriod && (date<expectedPeriod.start||date>expectedPeriod.end)){if(outside.length<8) outside.push({row:i+1,date});}
    const rawStatus=norm(cols[lookup.status]);
    const isCanceled=rawStatus==='canceled'||rawStatus==='cancelled';
    const isMissed=rawStatus==='missed';
    if(isCanceled)canceled++;else if(isMissed)missed++;else valid++;
    allStatuses[rawStatus||'(blank)']=(allStatuses[rawStatus||'(blank)']||0)+1;
    const t=typeOf(cols[lookup.type]);
    if(t){if(!counts[t])counts[t]={total:0,canceled:0,missed:0,valid:0};const n=counts[t];n.total++;if(isCanceled)n.canceled++;else if(isMissed)n.missed++;else n.valid++;}
    else {const other=clean(cols[lookup.type])||'(blank)';unrecognized[other]=(unrecognized[other]||0)+1;}
    // Duplicate warning only: two identical rows can represent genuine double bookings.
    if(idFields.every(k=>k>=0)) {const id=idFields.map(k=>clean(cols[k])).join('\u001F');if(seen.has(id)){duplicateCount++;if(duplicates.length<3)duplicates.push(i+1);}else seen.add(id);}
  }
  if(invalid.length)throw new Error(`Invalid appointment dates in CSV rows ${invalid.slice(0,8).join(', ')}. Please export again.`);
  if(outside.length)throw new Error(`CSV has appointments outside ${expectedPeriod.start} to ${expectedPeriod.end} (e.g. row ${outside[0].row}: ${outside[0].date}). Re-export using the selected dates.`);
  const dates=[...dateSet].sort();
  return {rows:rows.length-1,valid,canceled,missed,dates:{min:dates[0]||'',max:dates.at(-1)||''},counts,unrecognized,duplicateCount,duplicateRows:duplicates};
}
function computeMetrics(sources) {
  const metrics={};
  for(const def of METRIC_DEFS){const data=sources?.[def.group];if(!data||!slots.metricReady(def.group,def.col,data))continue;
    const types=def.types;
    metrics[def.col]={value:types.reduce((n,t)=>n+(data.counts?.[t]?.valid||0),0),types:types.map(t=>({name:t,...(data.counts?.[t]||{total:0,canceled:0,missed:0,valid:0})}))};
  }
  return metrics;
}
module.exports={METRIC_DEFS,AUTO_COLS,MANUAL_COLS,periods,parseCrystalDate,parseCsv,csvRows,computeMetrics,isoDate,dateIso};
