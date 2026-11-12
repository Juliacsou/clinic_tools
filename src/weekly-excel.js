'use strict';
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {spawn}=require('child_process');
const ExcelJS=require('exceljs');
const {dateIso,isoDate}=require('./weekly-core');
const layout=require('./weekly-layout');
const editable=new Set(layout.FIELDS.map(f=>f.key));
const ext=f=>path.extname(f).toLowerCase();
const sha256=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function requireFile(file){if(!file||!['.xls','.xlsx'].includes(ext(file))||!fs.existsSync(file))throw new Error('Select an existing .xls or .xlsx Weekly Reports workbook.');}
function asDate(v){
 if(v instanceof Date && !isNaN(v))return dateIso(new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate())));
 if(typeof v==='number' && v>1000 && v<150000)return dateIso(new Date(Date.UTC(1899,11,30)+v*86400000));
 if(typeof v==='string'){
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
  const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 }
 return '';
}
function normalizeValue(v){if(v&&typeof v==='object'){if(v.formula)return '='+v.formula;if(v.text)return v.text;if(v.result!==undefined)return v.result;return null;}return v??null;}
function projectExisting(source,map){const existing={};for(const [semantic,physical] of Object.entries(map))existing[semantic]=source[physical]??null;return existing;}
function uniqueWeeks(weeks){const seen=new Set();for(const w of weeks){if(seen.has(w.date))throw new Error(`More than one row exists for Week Ending ${w.date}. Resolve duplicate dates in Excel before connecting.`);seen.add(w.date);}return weeks;}
async function xlsxRead(file,weekEnding){
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);
 const sheet=book.worksheets.find(x=>x.name.trim().toLowerCase()==='weekly');
 if(!sheet)throw new Error('The selected workbook does not contain the Weekly worksheet.');
 const headers=Array.from({length:Math.max(18,Math.min(50,sheet.columnCount))},(_,i)=>normalizeValue(sheet.getRow(1).getCell(i+1).value));
 const {map,layout:layoutType}=layout.resolve(headers);
 const weeks=[];let selected=0,latestDate='',lastRow=1;
 sheet.eachRow({includeEmpty:false},(row,num)=>{
  if(num===1)return;const date=asDate(normalizeValue(row.getCell(1).value));
  if(!date)return;weeks.push({date,row:num});lastRow=Math.max(lastRow,num);
  if(date>latestDate)latestDate=date;if(date===weekEnding)selected=num;
 });
 uniqueWeeks(weeks);
 const row=selected||lastRow+1,existing={};
 if(selected)for(const [semantic,physical]of Object.entries(map))existing[semantic]=normalizeValue(sheet.getCell(`${physical}${selected}`).value);
 return {weeks,latestDate,row,exists:!!selected,existing,map,layout:layoutType,book,sheet,headers};
}
function parseLegacyResponse(raw){
 const text=String(raw??'').replace(/^\uFEFF/,'').trim(),attempts=[text];
 if(text.startsWith('"{')&&text.endsWith('}"'))attempts.push(text.slice(1,-1));
 for(const attempt of attempts){try{let p=JSON.parse(attempt);if(typeof p==='string')p=JSON.parse(p);if(p&&typeof p==='object'&&!Array.isArray(p)&&typeof p.ok==='boolean')return p;}catch(_){}}
 throw new Error('The Excel integration returned an unreadable response. Please retry with Excel closed.');
}
function locateLegacyScript(){
 const bundled=path.join(__dirname,'weekly-legacy-excel.ps1');
 const candidates=[...(process.resourcesPath?[path.join(process.resourcesPath,'weekly','weekly-legacy-excel.ps1')]:[]),bundled,bundled.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked')];
 for(const file of [...new Set(candidates)]){try{const bytes=fs.readFileSync(file);if(bytes.length>100&&bytes.toString('utf8').includes('Excel.Application'))return {file,bytes};}catch(_){}}
 throw new Error('The Clinic Tools Excel integration script is missing. Rebuild the portable application using BUILD_WINDOWS.bat.');
}
async function stageLegacyScript(workdir){const {bytes}=locateLegacyScript();const target=path.join(workdir,'legacy-excel.ps1');await fsp.writeFile(target,bytes,{flag:'wx'});await fsp.access(target,fs.constants.R_OK);return target;}
let legacyQueue=Promise.resolve();
function runLegacy(job){const pending=legacyQueue.then(()=>runLegacyJob(job));legacyQueue=pending.catch(()=>{});return pending;}
async function runLegacyJob(job){
 if(process.platform!=='win32')throw new Error('Legacy .xls files require Microsoft Excel on Windows.');
 const workdir=await fsp.mkdtemp(path.join(os.tmpdir(),'clinic-weekly-'));
 const input=path.join(workdir,'in.json'),output=path.join(workdir,'out.json');
 try{
  const script=await stageLegacyScript(workdir);await fsp.writeFile(input,JSON.stringify(job),'utf8');
  return await new Promise((resolve,reject)=>{
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InputPath',input,'-OutputPath',output],{windowsHide:true,timeout:120000});
   let stderr='';child.stderr.on('data',x=>{stderr+=x.toString().slice(0,2000)});
   child.on('error',reject);
   child.on('close',async code=>{
    try{
     if(fs.existsSync(output)){
      const response=parseLegacyResponse(await fsp.readFile(output,'utf8'));
      if(!response.ok)throw new Error(response.error||'Excel could not process the workbook.');
      if(code!==0)throw new Error('Excel exited unexpectedly after returning a response.');
      return resolve(response);
     }
     reject(new Error(stderr.trim()||`Microsoft Excel returned an error (${code}).`));
    }catch(e){reject(e)}
   });
  });
 }finally{await fsp.rm(workdir,{recursive:true,force:true});}
}
const legacyCache=new Map();
async function legacyRead(file,weekEnding){
 const cacheKey=[file,weekEnding,sha256(file)].join('|');
 if(legacyCache.has(cacheKey))return legacyCache.get(cacheKey);
 if(legacyCache.size>12)legacyCache.clear();
 const operation=readLegacyUncached(file,weekEnding);legacyCache.set(cacheKey,operation);
 operation.catch(()=>{if(legacyCache.get(cacheKey)===operation)legacyCache.delete(cacheKey);});
 return operation;
}
async function readLegacyUncached(file,weekEnding){
 const raw=await runLegacy({action:'inspect',workbook:file,weekEnding});
 const parsed=layout.resolve(raw.headers);
 const weeks=uniqueWeeks(raw.weeks||[]);
 const rawHeaders={};(raw.headers||[]).forEach((head,i)=>{rawHeaders[layout.toLetter(i+1)]=String(head??'');});
 return {...raw,...parsed,rawHeaders,weeks,existing:projectExisting(raw.existingPhysical||{},parsed.map)};
}
async function inspect(file,weekEnding='1900-01-01'){
 requireFile(file);isoDate(weekEnding);
 const data=ext(file)==='.xls'?await legacyRead(file,weekEnding):await xlsxRead(file,weekEnding);
 const {weeks,latestDate,row,exists,existing,map,layout:layoutType}=data;
 return {weeks,latestDate,row,exists,existing,map,layout:layoutType};
}
// One read-only history request per dashboard load. Logical IDs are mapped from
// actual workbook headers, so classic/compact .xls and .xlsx are both supported.
function numberOrNull(value){
 if(value&&typeof value==='object')value=Object.hasOwn(value,'result')?value.result:null;
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?n:null;
}
function projectHistoryRow(date,values,map,notes='',row=null){
 const result={weekEnding:date,values:{},notes:typeof notes==='string'?notes.slice(0,10000):'',row};
 for(const semantic of ['B','C','D','E','F','G','H','I','J','K','L','M','N']){
  const v=numberOrNull(values[map[semantic]]);
  result.values[semantic]=v;
 }
 return result;
}
async function chartHistory(file,{includeNotes=false}={}){
 requireFile(file);
 let rows;
 if(ext(file)==='.xls'){
  const raw=await runLegacy({action:'history',workbook:file,weekEnding:'1900-01-01',includeNotes});
  const {map}=layout.resolve(raw.headers);
  rows=(raw.historyRows||[]).map(w=>projectHistoryRow(w.date,w.values||{},map,includeNotes?w.notes:'',w.row));
 }else{
  const {weeks,sheet,map}=await xlsxRead(file,'1900-01-01');
  rows=weeks.map(w=>{
   const values={};
   for(const physical of Object.values(map)){
    values[physical]=sheet.getCell(`${physical}${w.row}`).value;
   }
   return projectHistoryRow(w.date,values,map,includeNotes?normalizeValue(sheet.getCell(`${map.Q}${w.row}`).value):'',w.row);
  });
 }
 // Duplicate workbook dates must not be silently collapsed in history.
 const seen=new Set();for(const w of rows){if(seen.has(w.weekEnding))throw new Error('More than one row exists for Week Ending '+w.weekEnding+'. Resolve duplicate dates in Excel.');seen.add(w.weekEnding);}
 // Use only saved workbook rows. Never silently mix unexported drafts into trends.
 rows.sort((a,b)=>a.weekEnding.localeCompare(b.weekEnding));
 return rows;
}
function makePhysicalUpdates(updates,map,rawHeaders){
 const physical={},allowed={};
 for(const [semantic,value]of Object.entries(updates)){
  if(!editable.has(semantic))throw new Error('Protected or unknown report field: '+semantic);
  const target=map[semantic];
  if(!target||typeof rawHeaders[target]!=='string')throw new Error('No verified destination for '+semantic+'. Nothing has been modified.');
  if(Object.hasOwn(physical,target))throw new Error('Multiple indicators target the same Excel cell. Nothing has been modified.');
  physical[target]=value;allowed[target]=rawHeaders[target];
 }
 return {physical,allowed};
}
// A Weekly date can be appended into a preformatted row containing formulas
// prepared for that same future row. Treating these formulas as independent
// data prevents saving; erasing them would change the report's behavior.
// If the row contains anything else, let desktop Excel insert a complete row
// instead of using ExcelJS spliceRows (which does not safely rebase formulas).
function formulaPattern(formula,row){
 return String(formula).replace(/(\$?[A-Z]{1,3})(\$?)(\d+)\b/g,(_m,col,absolute,n)=>
  col+(absolute?'$'+n:`[relative:${Number(n)-row}]`));
}
function classifyPreparedRow(sheet,position,lastDatedRow,physicalTargetColumns){
 const row=sheet.getRow(position),prev=sheet.getRow(lastDatedRow);
 const blocked=[];
 row.eachCell({includeEmpty:false},(cell,col)=>{
  const value=cell.value;
  if(value===null||value===undefined||value==='')return;
  const letter=layout.toLetter(col);
  const formula=typeof cell.formula==='string'?cell.formula:(value&&typeof value==='object'?value.formula:null);
  const before=prev.getCell(col),beforeFormula=typeof before.formula==='string'?before.formula:(before.value&&typeof before.value==='object'?before.value.formula:null);
  if(formula&&col!==1&&!physicalTargetColumns.has(letter)&&beforeFormula&&
     formulaPattern(formula,position)===formulaPattern(beforeFormula,lastDatedRow))return;
  blocked.push({cell:`${letter}${position}`,kind:formula?'conflicting-formula':'existing-value'});
 });
 return {safe:!blocked.length,blocked,action:blocked.length?'insert-before-existing-content':'reuse-empty-or-template-row'};
}
function checkUpdates(updates){
 for(const [col,value] of Object.entries(updates)){
  if(!editable.has(col))throw new Error('Protected or unknown report field: '+col);
  if(col==='Q'?typeof value!=='string':!Number.isSafeInteger(value)||value<0)throw new Error('Invalid value for '+col);
 }
}
async function write(file,weekEnding,updates){
 requireFile(file);isoDate(weekEnding);checkUpdates(updates);
 if(ext(file)==='.xls'){
  const current=await legacyRead(file,weekEnding);
  if(!current.exists&&current.latestDate&&weekEnding<current.latestDate)throw new Error('This older week is not in Excel. Create its row in Excel first.');
  const {physical,allowed}=makePhysicalUpdates(updates,current.map,current.rawHeaders);
  const result=await runLegacy({action:'write',workbook:file,weekEnding,updates:physical,allowed});
  legacyCache.clear();
  return {row:result.row,exists:result.exists,rowAction:result.rowAction};
 }
 const {book,sheet,map,latestDate,row,exists}=await xlsxRead(file,weekEnding);
 if(!exists&&latestDate&&weekEnding<latestDate)throw new Error('This older week is not in Excel. Create its row in Excel first.');
 let rowAction=exists?'update-existing':'reuse-empty-or-template-row';
 if(!exists){
  const targets=new Set(Object.keys(updates).map(semantic=>map[semantic]));
  const plan=classifyPreparedRow(sheet,row,row-1,targets);
  rowAction=plan.action;
  if(!plan.safe){
   // ExcelJS does not safely update formulas/named ranges when splicing rows.
   // Desktop Excel does; it protects the displaced row and its dependencies.
   if(process.platform!=='win32')throw new Error('The next reporting row has data. To insert a safe row, open this workbook through Clinic Tools on Windows with Microsoft Excel installed. Nothing was modified.');
   const current=await legacyRead(file,weekEnding);
   const {physical,allowed}=makePhysicalUpdates(updates,current.map,current.rawHeaders);
   const result=await runLegacy({action:'write',workbook:file,weekEnding,updates:physical,allowed});
   legacyCache.clear();
   return {row:result.row,exists:result.exists,rowAction:result.rowAction};
  }
  const prev=sheet.getRow(row-1);
  for(let c=1;c<=Math.max(18,sheet.columnCount);c++){
   const before=prev.getCell(c),after=sheet.getRow(row).getCell(c);
   if(before.style)after.style=JSON.parse(JSON.stringify(before.style));
  }
  sheet.getCell(`A${row}`).value=new Date(`${weekEnding}T12:00:00Z`);
  sheet.getCell(`A${row}`).numFmt='mm/dd/yyyy';
 }
 for(const [semantic,value]of Object.entries(updates))sheet.getCell(`${map[semantic]}${row}`).value=value;
 book.calcProperties.fullCalcOnLoad=true;
 const tmp=path.join(path.dirname(file),`.clinic-weekly-${process.pid}-${Date.now()}.xlsx`);
 try{await book.xlsx.writeFile(tmp);await fsp.rename(tmp,file)}catch(e){try{await fsp.unlink(tmp)}catch{};throw new Error('Close the workbook in Excel and retry. '+e.message)}
 return {row,exists,rowAction};
}
module.exports={chartHistory,numberOrNull,projectHistoryRow,inspect,write,sha256,requireFile,asDate,parseLegacyResponse,locateLegacyScript,stageLegacyScript,layout,makePhysicalUpdates,formulaPattern,classifyPreparedRow};
