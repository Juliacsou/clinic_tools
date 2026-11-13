'use strict';
const path=require('path');
const fs=require('fs');
const fsp=fs.promises;
const crypto=require('crypto');
const core=require('./weekly-core');
const ahead=require('./weekly-ahead');
const slots=require('./weekly-slots');
const excel=require('./weekly-excel');
const history=require('./weekly-history');
const {AUTO_COLS,MANUAL_COLS,computeMetrics,periods,isoDate}=core;
const EDITABLE=new Set([...AUTO_COLS,...MANUAL_COLS,'Q']);
const TYPES=new Set(['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203','EP 99213','Patient Consultation','Virtual Orientation','Office VT','Virtual VT','Home Maintenance','Follow-Up']);
const clean=v=>String(v??'').trim();
function count(v,key){if(v===null||v===undefined||v==='')return null;if(!Number.isSafeInteger(v)||v<0)throw new Error(`Enter a valid whole number for ${key}.`);return v;}
function safeSummary(s){
 const counts={};
 for(const [type,c] of Object.entries(s.counts||{})){
  if(!TYPES.has(type))continue;
  const total=count(c.total,'total'),canceled=count(c.canceled,'canceled'),missed=count(c.missed,'missed'),valid=count(c.valid,'valid');
  if([total,canceled,missed,valid].some(x=>x===null)||total!==canceled+missed+valid)throw new Error('Invalid CSV category: '+type);
  counts[type]={total,canceled,missed,valid};
 }
 const rows=count(s.rows,'CSV rows');if(rows===null)throw new Error('CSV totals are missing.');
 return {counts,rows,fileName:path.basename(clean(s.fileName)).slice(0,180),fileHash:clean(s.fileHash).slice(0,64),slotId:clean(s.slotId).slice(0,40),importedAt:clean(s.importedAt).slice(0,30),dates:{min:clean(s.dates?.min),max:clean(s.dates?.max)},canceled:count(s.canceled,'canceled')??0,missed:count(s.missed,'missed')??0,duplicateCount:count(s.duplicateCount,'duplicate')??0,unrecognized:s.unrecognized&&typeof s.unrecognized==='object'?Object.fromEntries(Object.entries(s.unrecognized).slice(0,60).map(([k,v])=>[k.slice(0,80),count(v,'unknown appointment')??0])):{}};
}
function sanitizeDraft(d){
 if(!d||typeof d!=='object')throw new Error('Missing weekly report.');isoDate(d.weekEnding);
 const out={weekEnding:d.weekEnding,vtSecondType:'Virtual VT',sources:{},overrides:{},manual:{},comments:clean(d.comments).slice(0,10000),commentsEdited:!!d.commentsEdited};
 const range=periods(d.weekEnding);
 const w=d.sources?.weekly;
 if(w){
  const source=safeSummary(w);
  if(source.dates.min&&source.dates.min<range.weekly.start||source.dates.max&&source.dates.max>range.weekly.end)throw new Error('Weekly CSV contains appointments outside this week.');
  out.sources.weekly=source;
 }
 const a=d.sources?.ahead;
 if(a?.periodMode==='annual'){
  if(!Array.isArray(a.files)||!a.files.length||a.files.length>2)throw new Error('The Ahead report requires at most two CSV files.');
  const files=a.files.map(safeSummary);
  const seen=new Set();
  for(const file of files){
   if(!['ahead-doctors','ahead-therapists'].includes(file.slotId))throw new Error('Invalid Ahead CSV upload field: '+file.fileName);
   if(seen.has(file.slotId))throw new Error('Only one CSV is allowed in each Ahead field.');seen.add(file.slotId);
   if(file.dates.min&&file.dates.min<range.ahead.start||file.dates.max&&file.dates.max>range.ahead.end)throw new Error('Ahead CSV contains appointments outside the one-year range: '+file.fileName);
   slots.verify(file,file.slotId);
  }
  out.sources.ahead=ahead.merge(files,'annual');
 }else if(a){
  // Preserve old drafts for review, but never treat four-week Ahead CSVs as annual data.
  out.sources.ahead={...safeSummary(a),periodMode:'legacy'};
 }
 for(const [c,v]of Object.entries(d.overrides||{}))if(AUTO_COLS.includes(c)){const n=count(v,c);if(n!==null)out.overrides[c]=n;}
 for(const [c,v]of Object.entries(d.manual||{}))if(MANUAL_COLS.includes(c)){const n=count(v,c);if(n!==null)out.manual[c]=n;}
 return out;
}
function makeUpdates(d){
 const sources={...d.sources};if(sources.ahead?.periodMode!=='annual')delete sources.ahead;
 const calculated=computeMetrics(sources),updates={};
 for(const col of AUTO_COLS){if(Object.hasOwn(d.overrides,col))updates[col]=d.overrides[col];else if(calculated[col])updates[col]=calculated[col].value;}
 for(const col of MANUAL_COLS)if(Object.hasOwn(d.manual,col))updates[col]=d.manual[col];
 if(d.commentsEdited)updates.Q=d.comments;
 for(const key of Object.keys(updates))if(!EDITABLE.has(key))throw new Error('Protected column cannot be edited.');
 return updates;
}
module.exports=function registerWeekly({ipcMain,dialog,mainWindow,dataDir,queueWrite}){
 const folder=()=>{const dir=path.join(dataDir(),'weekly-reports');excel.setCacheDir?.(dir);return dir;};
 const settingFile=()=>path.join(folder(),'settings.json');
 const draftFile=()=>path.join(folder(),'drafts.json');
 function readJson(p,otherwise){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){if(e.code==='ENOENT')return otherwise;throw e}}
 async function atomic(p,v){await fsp.mkdir(path.dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid+'-'+Date.now();await fsp.writeFile(tmp,JSON.stringify(v,null,2),'utf8');await fsp.rename(tmp,p)}
 const setting=()=>readJson(settingFile(),{});
 async function info(){const s=setting();if(!s.workbookPath)return {connected:false};if(!fs.existsSync(s.workbookPath))return {connected:false,missingWorkbook:true,workbookPath:s.workbookPath};
  try{const book=await excel.inspect(s.workbookPath);return {connected:true,workbookPath:s.workbookPath,lastWeek:book.latestDate,format:path.extname(s.workbookPath).toLowerCase(),weeks:book.weeks.length}}
  catch(e){return {connected:false,workbookPath:s.workbookPath,invalidWorkbook:true,error:e.message};}
 }
 ipcMain.handle('weekly:info',info);
 ipcMain.handle('weekly:connect',()=>queueWrite(async()=>{
  const answer=await dialog.showOpenDialog(mainWindow(),{title:'Select Weekly Reports workbook',properties:['openFile'],filters:[{name:'Excel workbooks',extensions:['xls','xlsx']}]});
  if(answer.canceled||!answer.filePaths[0])return null;
  const file=answer.filePaths[0];const checked=await excel.inspect(file);
  await atomic(settingFile(),{workbookPath:file});return {connected:true,workbookPath:file,lastWeek:checked.latestDate,format:path.extname(file).toLowerCase(),weeks:checked.weeks.length,layout:checked.layout};
 }));
 ipcMain.handle('weekly:list',async()=>{
  const drafts=readJson(draftFile(),{}),s=setting();let workbookError=null,workbookRows=[];
  if(s.workbookPath&&fs.existsSync(s.workbookPath)){
   try{workbookRows=await excel.chartHistory(s.workbookPath,{includeNotes:true});}
   catch(e){workbookError=e.message;}
  }else if(s.workbookPath){workbookError='The connected Weekly Reports workbook was not found.';}
  return {weeks:history.combine(drafts,workbookRows),workbookError};
 });
 ipcMain.handle('weekly:chart-history',async()=>{
  const s=setting();
  if(!s.workbookPath) return {connected:false,rows:[]};
  excel.requireFile(s.workbookPath);
  return {connected:true,rows:await excel.chartHistory(s.workbookPath)};
 });
 ipcMain.handle('weekly:load-draft',async(_,weekEnding)=>{
  isoDate(weekEnding);const drafts=readJson(draftFile(),{}),s=setting();let existing={},inExcel=false,excelRow=null;
  if(s.workbookPath&&fs.existsSync(s.workbookPath)){
   const result=await excel.inspect(s.workbookPath,weekEnding);existing=result.existing;inExcel=result.exists;excelRow=result.exists?result.row:null;
  }
  return {draft:drafts[weekEnding]||null,periods:periods(weekEnding),existing,inExcel,excelRow};
 });
 ipcMain.handle('weekly:save-draft',(_,payload)=>queueWrite(async()=>{
  const d=sanitizeDraft(payload),store=readJson(draftFile(),{}),prev=store[d.weekEnding]||{};
  const savedAt=new Date().toISOString();store[d.weekEnding]={...d,savedAt,exportedAt:prev.exportedAt||null,excelRow:prev.excelRow||null};
  await atomic(draftFile(),store);return {savedAt};
 }));
 ipcMain.handle('weekly:delete-draft',(_,weekEnding)=>queueWrite(async()=>{
  isoDate(weekEnding);const store=readJson(draftFile(),{});
  if(!store[weekEnding])return {deleted:false};
  delete store[weekEnding];await atomic(draftFile(),store);return {deleted:true};
 }));
 ipcMain.handle('weekly:import-csv',async(_,group,weekEnding,slotId=null)=>{
  if(!['weekly','ahead'].includes(group))throw new Error('Invalid period.');
  const slot=slots.get(slotId||'');
  if(!slot||slot.group!==group)throw new Error('Choose one of the three CSV upload fields.');
  const range=periods(weekEnding)[group];
  const answer=await dialog.showOpenDialog(mainWindow(),{title:'Import '+slot.title,properties:['openFile'],filters:[{name:'Crystal PM CSV',extensions:['csv']}]});
  if(answer.canceled||!answer.filePaths?.[0])return null;
  const file=answer.filePaths[0],stat=await fsp.stat(file);
  if(stat.size>32*1024*1024)throw new Error('CSV exceeds 32 MB. Split the export or contact support.');
  const buffer=await fsp.readFile(file);
  // The detailed CSV stays in memory only: no names or patient-level data is persisted.
  const parsed=core.parseCsv(buffer.toString('utf8'),range);
  slots.verify(parsed,slot.id);
  return {...parsed,slotId:slot.id,fileName:path.basename(file),importedAt:new Date().toISOString(),fileHash:crypto.createHash('sha256').update(buffer).digest('hex')};
 });
 ipcMain.handle('weekly:preview-write',async(_,payload)=>{
  const d=sanitizeDraft(payload),s=setting();if(!s.workbookPath)throw new Error('Connect your Weekly Reports Excel in Settings.');
  const book=await excel.inspect(s.workbookPath,d.weekEnding);const updates=makeUpdates(d);
  if(!Object.keys(updates).length)throw new Error('Fill in at least one value before updating Excel.');
  if(!book.exists&&book.latestDate&&d.weekEnding<book.latestDate)throw new Error('This older week is not in Excel. Add its row to the workbook first.');
  return {updates,existing:book.existing,row:book.row,exists:book.exists,workbookPath:s.workbookPath,fileVersion:excel.sha256(s.workbookPath)};
 });
 ipcMain.handle('weekly:write-workbook',(_,payload,fileVersion)=>queueWrite(async()=>{
  const d=sanitizeDraft(payload),s=setting();if(!s.workbookPath)throw new Error('Connect Weekly Reports in Settings.');
  excel.requireFile(s.workbookPath);if(!fileVersion||excel.sha256(s.workbookPath)!==fileVersion)throw new Error('The Excel file has changed. Review the update again.');
  const updates=makeUpdates(d);if(!Object.keys(updates).length)throw new Error('Nothing to save to Excel.');
  const before=await excel.inspect(s.workbookPath,d.weekEnding);
  if(!before.exists&&before.latestDate&&d.weekEnding<before.latestDate)throw new Error('Cannot append an older week. Add its row to Excel first.');
  const backupDir=path.join(folder(),'backups');await fsp.mkdir(backupDir,{recursive:true});
  const suffix=path.extname(s.workbookPath).toLowerCase(),stamp=new Date().toISOString().replace(/[-:TZ.]/g,'');
  const backup=path.join(backupDir,`Weekly_before_${d.weekEnding}_${stamp}${suffix}`);await fsp.copyFile(s.workbookPath,backup);
  try{
   const result=await excel.write(s.workbookPath,d.weekEnding,updates);
   const store=readJson(draftFile(),{}),now=new Date().toISOString();store[d.weekEnding]={...d,savedAt:now,exportedAt:now,excelRow:result.row};await atomic(draftFile(),store);
   return {row:result.row,backup,workbookPath:s.workbookPath,columns:Object.keys(updates),rowAction:result.rowAction||'update-existing'};
  }catch(e){throw new Error('The Excel file was not updated successfully. A backup is available. '+e.message);}
 }));
};
