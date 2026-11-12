'use strict';
const fs=require('fs'),fsp=fs.promises,path=require('path'),crypto=require('crypto');
const core=require('./monthly-core'),weekly=require('./weekly-core'),excel=require('./monthly-excel');
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
async function writeJson(file,record){await fsp.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid+'-'+Date.now();await fsp.writeFile(tmp,JSON.stringify(record,null,2),'utf8');await fsp.rename(tmp,file);}
function combine(drafts={},months=[]){
 const groups=new Map();
 for(const row of months){if(!groups.has(row.month))groups.set(row.month,[]);groups.get(row.month).push(row.row||null);}
 const duplicateMonths=Object.fromEntries([...groups].filter(([,rows])=>rows.length>1));
 const all=months.map(row=>({month:row.month,values:{...row.values},inExcel:true,excelRow:row.row||null,hasDraft:false,comments:row.values?.M||'',duplicate:!!duplicateMonths[row.month],duplicateRows:duplicateMonths[row.month]||[]}));
 const byMonth=new Map(all.filter(r=>!r.duplicate).map(r=>[r.month,r]));
 for(const [month,raw]of Object.entries(drafts)){
  try{core.assertMonth(month);}catch{continue;}
  // Keep each conflicting Excel row visible and unchanged, including its real values.
  // Drafts for a duplicate month remain on disk but are never merged into a random row.
  if(duplicateMonths[month]){for(const row of all)if(row.month===month)row.hasDraft=true;continue;}
  const savedAt=raw.savedAt||'',exportedAt=raw.exportedAt||'';
  const pending=!exportedAt||savedAt>exportedAt||!byMonth.has(month);
  const result=byMonth.get(month)||{month,values:{},inExcel:false};
  result.hasDraft=true;result.pending=pending;
  if(pending){
   let updates={};try{updates=core.updates(core.sanitize(raw));}catch{}
   result.values={...result.values,...updates};
  }
  if(!byMonth.has(month)){byMonth.set(month,result);all.push(result);}
 }
 return all.sort((a,b)=>b.month.localeCompare(a.month)||(a.excelRow||0)-(b.excelRow||0));
}

module.exports=function registerMonthly({ipcMain,dialog,mainWindow,dataDir,queueWrite}){
 const folder=()=>path.join(dataDir(),'monthly-reports');
 const draftPath=()=>path.join(folder(),'drafts.json');
 // Both reports write distinct worksheets in the same connected Weekly Reports workbook.
 const workbook=()=>readJson(path.join(dataDir(),'weekly-reports','settings.json'),{}).workbookPath||'';
 ipcMain.handle('monthly:info',async()=>{
  const file=workbook();if(!file)return {connected:false};if(!fs.existsSync(file))return {connected:false,missingWorkbook:true,workbookPath:file};
  try{const data=await excel.inspect(file);return {connected:true,workbookPath:file,latest:data.latest,count:data.months.length,duplicateMonths:data.duplicateMonths||{}};}
  catch(e){return {connected:false,workbookPath:file,error:e.message};}
 });
 ipcMain.handle('monthly:list',async()=>{
  let records=[],error=null;const file=workbook();
  if(file&&fs.existsSync(file))try{records=(await excel.inspect(file)).months;}catch(e){error=e.message;}
  else if(file)error='Connected workbook was not found.';
  return {months:combine(readJson(draftPath(),{}),records),error};
 });
 ipcMain.handle('monthly:load',async(_,month)=>{
  core.assertMonth(month);const drafts=readJson(draftPath(),{}),file=workbook();let existing={},inExcel=false;
  if(file&&fs.existsSync(file)){const result=await excel.inspect(file,month);existing=result.existing;inExcel=result.exists;}
  return {month,period:core.period(month),draft:drafts[month]||null,existing,inExcel};
 });
 ipcMain.handle('monthly:save',(_,raw)=>queueWrite(async()=>{
  const d=core.sanitize(raw),db=readJson(draftPath(),{}),old=db[d.month]||{},savedAt=new Date().toISOString();
  db[d.month]={...d,savedAt,exportedAt:old.exportedAt||null};await writeJson(draftPath(),db);return {savedAt};
 }));
 ipcMain.handle('monthly:delete',(_,month)=>queueWrite(async()=>{
  core.assertMonth(month);const db=readJson(draftPath(),{});if(!db[month])return {deleted:false};delete db[month];await writeJson(draftPath(),db);return {deleted:true};
 }));
 ipcMain.handle('monthly:import',async(_,month,slot)=>{
  const range=core.period(month);if(!['all','doctors','therapists'].includes(slot))throw new Error('Invalid CSV field.');
  const answer=await dialog.showOpenDialog(mainWindow(),{title:'Import '+slot+' CSV for '+month,properties:['openFile'],filters:[{name:'Crystal PM CSV',extensions:['csv']}]});
  if(answer.canceled||!answer.filePaths[0])return null;
  const file=answer.filePaths[0],stat=await fsp.stat(file);if(stat.size>32*1024*1024)throw new Error('CSV is larger than 32 MB. Export separate Doctors and Therapists CSVs.');
  const buffer=await fsp.readFile(file),parsed=weekly.parseCsv(buffer.toString('utf8'),range);
  core.validateSlot(parsed,slot);
  const summary=core.fileSummary({...parsed,fileName:path.basename(file),fileHash:crypto.createHash('sha256').update(buffer).digest('hex'),importedAt:new Date().toISOString()},slot);
  // Do not reject valid schedule exports merely because the selected month
  // has no tracked types; flag zero relevant matches so users can verify.
  if(slot!=='all'&&!Object.keys(summary.counts).length)summary.notice='No appointment types used by Monthly '+(slot==='doctors'?'Doctors':'Therapists')+' were found. This CSV was imported, but the related indicators will be zero. Check that you selected the correct schedule and month.';
  return summary;
 });
 ipcMain.handle('monthly:preview',async(_,raw)=>{
  const d=core.sanitize(raw),file=workbook();if(!file)throw new Error('Connect Weekly Reports Excel in Settings.');
  const result=await excel.inspect(file,d.month),updates=core.updates(d);
  if(!Object.keys(updates).length)throw new Error('Import a monthly CSV or enter a manual value before saving.');
  if(!result.exists&&result.latest&&d.month<result.latest)throw new Error('This older month has no row in Excel. Add its month row first.');
  return {month:d.month,updates,existing:result.existing,exists:result.exists,workbookPath:file,fileHash:weeklyExcelHash(file)};
 });
 ipcMain.handle('monthly:write',(_,raw,hash)=>queueWrite(async()=>{
  const d=core.sanitize(raw),file=workbook();if(!file)throw new Error('Connect Weekly Reports Excel in Settings.');
  excel.requireFile(file);if(!hash||hash!==weeklyExcelHash(file))throw new Error('Excel was modified since your preview. Review the changes again.');
  const updates=core.updates(d);if(!Object.keys(updates).length)throw new Error('There are no Monthly values to write.');
  const inspect=await excel.inspect(file,d.month);if(!inspect.exists&&inspect.latest&&d.month<inspect.latest)throw new Error('Cannot insert a historical month that is missing in Excel.');
  const backups=path.join(folder(),'backups');await fsp.mkdir(backups,{recursive:true});
  const extension=path.extname(file).toLowerCase();const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'');
  const backup=path.join(backups,`Monthly_before_${d.month}_${stamp}${extension}`);
  await fsp.copyFile(file,backup);
  try{
   const result=await excel.write(file,d.month,updates);
   // An Excel COM save can return without throwing even when a legacy workbook
   // did not persist the requested cells. Re-read the physical workbook before
   // marking a Monthly draft as exported; never assume a successful Save().
   const verification=await excel.inspect(file,d.month);
   if(!verification.exists||verification.row!==result.row){
    throw new Error('Excel did not retain the expected Monthly report row. Review the backup before retrying.');
   }
   for(const [col,expected] of Object.entries(updates)){
    const actual=verification.existing[col];
    const same=col==='M'?String(actual??'')===expected:Number(actual)===expected;
    if(!same)throw new Error('Excel verification failed for Monthly cell '+col+result.row+'. Review the backup before retrying.');
   }
   const db=readJson(draftPath(),{}),now=new Date().toISOString();
   db[d.month]={...d,savedAt:now,exportedAt:now,excelRow:result.row};await writeJson(draftPath(),db);
   return {backup,row:result.row,rowAction:result.rowAction,columns:Object.keys(updates)};
  }catch(e){throw new Error('Monthly Excel update failed. Your original file was backed up. '+e.message);}
 }));
};
function weeklyExcelHash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
module.exports.combine=combine;
