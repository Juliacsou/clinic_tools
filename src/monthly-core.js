'use strict';
// Monthly reporting: calendar month (inclusive), not Weekly Week Ending or Ahead.
const weekly=require('./weekly-core');
const DOCTOR_TYPES=['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'];
const PERCEPTION_TYPES=DOCTOR_TYPES.filter(t=>t!=='NP 99203');
const METRICS=[
 {col:'D',name:'OM Exams Done',source:'doctors',status:'valid',types:DOCTOR_TYPES},
 {col:'E',name:'Percept Test Done',source:'doctors',status:'valid',types:PERCEPTION_TYPES},
 {col:'F',name:'VT Consults Done',source:'doctors',status:'valid',types:['Patient Consultation']},
 {col:'G',name:'New VT Starts',source:'therapists',status:'valid',types:['Virtual Orientation']},
 {col:'I',name:'VT Sessions',source:'therapists',status:'valid',types:['Office VT','Virtual VT']},
 {col:'J',name:'VT Grads',source:'therapists',status:'valid',types:['Home Maintenance']},
 {col:'K',name:'EP 99213 Cancelled',source:'doctors',status:'canceled',types:['EP 99213']},
 {col:'L',name:'Follow-Up Cancelled',source:'doctors',status:'canceled',types:['Office Follow-Up','Follow-Up']}
];
const MANUAL=['B','C','H'];
const COLS=[...MANUAL,...METRICS.map(m=>m.col),'M'];
const DOCTOR_ALLOWED=[...DOCTOR_TYPES,'Patient Consultation','EP 99213','Office Follow-Up','Follow-Up'];
const THERAPIST_ALLOWED=['Virtual Orientation','Office VT','Virtual VT','Home Maintenance'];
function assertMonth(month){
 if(typeof month!=='string'||!/^(\d{4})-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a valid reporting month.');
 const year=Number(month.slice(0,4));if(year<2000||year>2100)throw new Error('Reporting year is out of range.');
 return month;
}
function period(month){
 assertMonth(month);const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
 return {start:`${month}-01`,end:`${month}-${String(last).padStart(2,'0')}`};
}
function safeNumber(n,label){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid '+label+'; enter a non-negative whole number.');return n;}
function validateSlot(source,slot){
 if(!['all','doctors','therapists'].includes(slot))throw new Error('Invalid monthly CSV field.');
 if(!source||!source.counts||typeof source.counts!=='object')throw new Error('Invalid CSV summary.');
 const entries=Object.entries(source.counts).filter(([,v])=>v?.total>0);
 if(slot==='all'){
  const doctor=entries.some(([type])=>DOCTOR_ALLOWED.includes(type));
  const therapist=entries.some(([type])=>THERAPIST_ALLOWED.includes(type));
  if(!doctor||!therapist)throw new Error('Full Schedule CSV must contain both Doctors and Therapists appointments. Use the separate CSV option if your export includes only one schedule.');
  return true;
 }
 // A Crystal PM schedule contains additional appointment types. They must not
 // prevent import: only the types assigned to this slot contribute to metrics.
 // A month can legitimately have zero occurrences of a tracked type.
 return true;
}
function aggregate(sources){
 if(sources?.all&&(sources.doctors||sources.therapists))throw new Error('Use either one complete CSV or separate Doctors and Therapists CSVs, not both.');
 const counts={};
 // When two exports overlap, filter each one to its assigned metrics BEFORE
 // merging. E.g. Doctor-Tech appointments may appear on a Therapist schedule,
 // but must only count in the Doctors metrics using the Doctors CSV.
 for(const slot of sources?.all?['all']:['doctors','therapists']){
  const source=sources?.[slot];if(!source)continue;
  const allowed=new Set(slot==='all'?[...DOCTOR_ALLOWED,...THERAPIST_ALLOWED]:(slot==='doctors'?DOCTOR_ALLOWED:THERAPIST_ALLOWED));
  for(const [type,record] of Object.entries(source.counts||{})){
   if(allowed.has(type)&&record?.total)counts[type]=record;
  }
 }
 return counts;
}
function metrics(sources){
 const counts=aggregate(sources),result={};
 for(const metric of METRICS){
  if(!sources?.all&&!sources?.[metric.source])continue;
  result[metric.col]=metric.types.reduce((n,t)=>n+(counts[t]?.[metric.status]||0),0);
 }
 return result;
}
function fileSummary(source,slot='all'){
 if(!source||typeof source!=='object'||!source.counts)throw new Error('Invalid monthly CSV summary.');
 if(!['all','doctors','therapists'].includes(slot))throw new Error('Invalid monthly CSV field.');
 const counts={};
 const allowed=new Set(slot==='all'?[...DOCTOR_ALLOWED,...THERAPIST_ALLOWED]:(slot==='doctors'?DOCTOR_ALLOWED:THERAPIST_ALLOWED));
 for(const [type,record] of Object.entries(source.counts)){
  if(!allowed.has(type))continue;
  if(!record||['total','valid','canceled','missed'].some(k=>!Number.isSafeInteger(record[k])||record[k]<0)||record.total!==record.valid+record.canceled+record.missed)throw new Error('Invalid CSV appointment counts for '+type+'.');
  counts[type]={total:record.total,valid:record.valid,canceled:record.canceled,missed:record.missed};
 }
 const rows=safeNumber(source.rows,'CSV rows');
 return {counts,rows,fileName:String(source.fileName||'').replace(/[\\/]/g,'').slice(0,180),fileHash:String(source.fileHash||'').slice(0,64),dates:{min:String(source.dates?.min||''),max:String(source.dates?.max||'')},importedAt:String(source.importedAt||'').slice(0,40),canceled:safeNumber(source.canceled||0,'cancelled appointments'),missed:safeNumber(source.missed||0,'missed appointments')};
}
function sanitize(d){
 if(!d||typeof d!=='object')throw new Error('Missing monthly report.');
 const month=assertMonth(d.month),range=period(month),sources={};
 for(const slot of ['all','doctors','therapists'])if(d.sources?.[slot]){
  const f=fileSummary(d.sources[slot],slot);validateSlot(f,slot);
  if(f.dates.min&&f.dates.min<range.start||f.dates.max&&f.dates.max>range.end)throw new Error('CSV '+f.fileName+' contains appointments outside '+range.start+' to '+range.end+'.');
  sources[slot]=f;
 }
 aggregate(sources);
 const manual={},overrides={};
 for(const c of MANUAL)if(d.manual?.[c]!==null&&d.manual?.[c]!==undefined&&d.manual?.[c]!=='')manual[c]=safeNumber(d.manual[c],c);
 for(const metric of METRICS)if(d.overrides?.[metric.col]!==null&&d.overrides?.[metric.col]!==undefined&&d.overrides?.[metric.col]!=='')overrides[metric.col]=safeNumber(d.overrides[metric.col],metric.col);
 return {month,mode:d.mode==='split'?'split':'all',sources,manual,overrides,comments:String(d.comments??'').slice(0,10000),commentsEdited:!!d.commentsEdited};
}
function updates(d){
 const out={...metrics(d.sources),...d.overrides,...d.manual};
 if(d.commentsEdited)out.M=d.comments;
 return out;
}
module.exports={DOCTOR_TYPES,PERCEPTION_TYPES,METRICS,MANUAL,COLS,DOCTOR_ALLOWED,THERAPIST_ALLOWED,period,assertMonth,safeNumber,validateSlot,aggregate,metrics,fileSummary,sanitize,updates};
