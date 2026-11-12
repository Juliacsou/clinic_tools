/* Privacy-preserving annual Ahead import aggregation.  CSV appointment rows remain in memory only. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.WeeklyAhead=api;
})(typeof window==='object'?window:null,function(){
 'use strict';
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const integer=(n,label)=>{
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid '+label+' in CSV summary.');
  return n;
 };
 function filesOf(source){return ['annual','weekly-slots'].includes(source?.periodMode)&&Array.isArray(source.files)?source.files:[];}
 function merge(files,mode='annual'){
  if(!files.length)return null;
  const counts={},unrecognized={},claimed=new Map(),fingerprints=new Set();
  let rows=0,canceled=0,missed=0,duplicateCount=0,min='',max='';
  const safeFiles=files.map((source,index)=>{
   if(!source||typeof source!=='object')throw new Error('Invalid Ahead import.');
   const f={fileName:String(source.fileName||'CSV '+(index+1)).slice(0,180),fileHash:String(source.fileHash||'').slice(0,64),slotId:String(source.slotId||'').slice(0,40),importedAt:String(source.importedAt||'').slice(0,30),rows:integer(source.rows,'rows'),canceled:integer(source.canceled,'canceled'),missed:integer(source.missed,'missed'),duplicateCount:integer(source.duplicateCount||0,'duplicates'),dates:{min:String(source.dates?.min||''),max:String(source.dates?.max||'')},counts:{},unrecognized:{}};
   if(f.fileHash){if(fingerprints.has(f.fileHash))throw new Error('This CSV was already imported. Remove or replace the existing file instead.');fingerprints.add(f.fileHash);}
   if(f.canceled+f.missed>f.rows)throw new Error('Invalid canceled/missed totals for '+f.fileName+'.');
   for(const [type,c]of Object.entries(source.counts||{})){
    if(!c||!own(c,'total'))throw new Error('Invalid appointment summary in '+f.fileName+'.');
    const v={total:integer(c.total,'total'),canceled:integer(c.canceled,'canceled'),missed:integer(c.missed,'missed'),valid:integer(c.valid,'valid')};
    if(v.total!==v.canceled+v.missed+v.valid)throw new Error('Invalid appointment totals for '+type+'.');
    if(v.total===0)continue;
    if(claimed.has(type))throw new Error('Appointment type "'+type+'" appears in both "'+claimed.get(type)+'" and "'+f.fileName+'". Remove or replace the existing file to prevent double counting.');
    claimed.set(type,f.fileName);f.counts[type]=v;counts[type]=v;
   }
   for(const [type,total]of Object.entries(source.unrecognized||{})){
    const n=integer(total,'unrecognized appointments');
    if(!n)continue;f.unrecognized[String(type).slice(0,80)]=n;
    unrecognized[type]=(unrecognized[type]||0)+n;
   }
   rows+=f.rows;canceled+=f.canceled;missed+=f.missed;duplicateCount+=f.duplicateCount;
   if(f.dates.min&&(!min||f.dates.min<min))min=f.dates.min;
   if(f.dates.max&&(!max||f.dates.max>max))max=f.dates.max;
   return f;
  });
  return {periodMode:mode,files:safeFiles,fileName:safeFiles.length===1?safeFiles[0].fileName:safeFiles.length+' CSV files',rows,canceled,missed,duplicateCount,dates:{min,max},counts,unrecognized,importedAt:safeFiles.map(f=>f.importedAt).sort().at(-1)||''};
 }
 function addFiles(source,newFiles,replaceIndex,mode='annual'){
  if(!Array.isArray(newFiles)||!newFiles.length)throw new Error('Select at least one CSV.');
  const files=filesOf(source).slice();
  if(replaceIndex!==undefined&&replaceIndex!==null){
   if(!Number.isInteger(replaceIndex)||replaceIndex<0||replaceIndex>=files.length||newFiles.length!==1)throw new Error('Choose one CSV to replace this file.');
   files.splice(replaceIndex,1,...newFiles);
  }else files.push(...newFiles);
  return merge(files,mode);
 }
 function removeFile(source,index){
  const files=filesOf(source).slice();
  if(!Number.isInteger(index)||index<0||index>=files.length)throw new Error('CSV not found.');
  files.splice(index,1);return merge(files,source?.periodMode==='weekly-slots'?'weekly-slots':'annual');
 }
 return {filesOf,merge,addFiles,removeFile};
});
