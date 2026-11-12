/* Read-only All Weeks table: merge saved workbook values with pending drafts.
   No patient-level CSV data or extra workbook columns are exposed. */
'use strict';
const {AUTO_COLS,MANUAL_COLS,computeMetrics}=require('./weekly-core');
const COLS=[...AUTO_COLS,...MANUAL_COLS];
function numberOrNull(v){
 if(v===null||v===undefined||v==='')return null;
 const num=Number(v);return Number.isFinite(num)&&num>=0?num:null;
}
function combine(drafts={},workbookRows=[]){
 const rows=new Map();
 for(const row of workbookRows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.weekEnding))continue;
  const values={};for(const col of COLS)values[col]=numberOrNull(row.values?.[col]);
  rows.set(row.weekEnding,{weekEnding:row.weekEnding,inExcel:true,excelRow:row.row||null,
   hasDraft:false,savedAt:null,exportedAt:null,weekly:false,ahead:false,
   values,notes:String(row.notes??'').slice(0,10000)});
 }
 for(const [date,d] of Object.entries(drafts||{})){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!d||typeof d!=='object')continue;
  const prev=rows.get(date)||{weekEnding:date,inExcel:false,excelRow:null,values:Object.fromEntries(COLS.map(c=>[c,null])),notes:''};
  const savedAt=d.savedAt||null,exportedAt=d.exportedAt||null;
  const pending=!prev.inExcel||!!(!exportedAt||(savedAt&&savedAt>exportedAt));
  const result={...prev,hasDraft:true,savedAt,exportedAt,weekly:!!d.sources?.weekly,ahead:!!d.sources?.ahead};
  if(pending){
   // Never treat legacy four-week Ahead totals as the current annual calculation.
   const sources={...d.sources};if(sources.ahead?.periodMode!=='annual')delete sources.ahead;
   const computed=computeMetrics(sources);
   result.values={...prev.values};
   for(const col of AUTO_COLS){
    if(Object.hasOwn(d.overrides||{},col))result.values[col]=numberOrNull(d.overrides[col]);
    else if(computed[col])result.values[col]=numberOrNull(computed[col].value);
   }
   for(const col of MANUAL_COLS)if(Object.hasOwn(d.manual||{},col))result.values[col]=numberOrNull(d.manual[col]);
   if(d.commentsEdited)result.notes=String(d.comments??'').slice(0,10000);
  }
  rows.set(date,result);
 }
 return [...rows.values()].sort((a,b)=>b.weekEnding.localeCompare(a.weekEnding));
}
module.exports={combine};
