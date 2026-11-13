'use strict';
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const {assertMonth,COLS}=require('./monthly-core');
const weeklyExcel=require('./weekly-excel');
const HEADERS=['Month Year','# of inquiries','# free Screenings','OM Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','# VT Sessions','# VT Grads','# Cancellations 99215/Annuals','# Cancellations 99213/Follow ups','Comments'];
function standard(v){return String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function normalize(v){if(v&&typeof v==='object'){if(Object.hasOwn(v,'result'))return v.result;if(v.text)return v.text;if(v.formula)return '='+v.formula;}return v??null;}
function requireFile(file){weeklyExcel.requireFile(file);}
function validateHeaders(headers){
 for(let i=0;i<HEADERS.length;i++)if(standard(headers[i])!==standard(HEADERS[i]))throw new Error('Monthly column '+String.fromCharCode(65+i)+' does not match the expected heading ('+HEADERS[i]+'). No file was changed.');
}
function monthKey(v){
 const date=weeklyExcel.asDate(v);
 if(date)return date.slice(0,7);
 // Some clinics keep legacy Month Year cells as text rather than Excel dates.
 if(typeof v==='string'){
  const iso=v.trim().match(/^(\d{4})[-/](0?[1-9]|1[0-2])$/);
  if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}`;
  const named=v.trim().match(/^([a-z]+)[- /](\d{2}|\d{4})$/i);
  if(named){
   const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
   const index=names.indexOf(named[1].slice(0,3).toLowerCase());
   const year=named[2].length===2?2000+Number(named[2]):Number(named[2]);
   if(index!==-1&&year>=2000&&year<=2100)return `${year}-${String(index+1).padStart(2,'0')}`;
  }
 }
 return '';
}
// A blank report row deliberately separates calendar years in the clinic workbook.
// Reuse the next prepared row within a year, but never consume the separator
// when the first report month of a new year is appended.
function nextMonthlyRow(lastDatedRow, latestMonth, requestedMonth){
 const last=Number(lastDatedRow);
 if(!Number.isSafeInteger(last)||last<1)throw new Error('Invalid last Monthly row.');
 assertMonth(requestedMonth);
 const newYear=!!latestMonth&&latestMonth.slice(0,4)!==requestedMonth.slice(0,4);
 return last+(newYear?2:1);
}
function duplicatedMonths(rows){
 const groups=new Map();for(const r of rows){if(!groups.has(r.month))groups.set(r.month,[]);groups.get(r.month).push(r.row);}
 return Object.fromEntries([...groups].filter(([,numbers])=>numbers.length>1));
}
function ambiguousMonth(month,rows){return `Month ${month} appears in more than one Excel row (${rows.join(', ')}). Review those rows in Excel before editing this month. No file was changed.`;}

function fromRow(row,id){const values={};for(const col of COLS)values[col]=normalize(row.getCell(col.charCodeAt(0)-64).value);return {month:id,values,row:row.number};}
async function xlsxRead(file){
 const ExcelJS=require('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);
 const sheet=book.worksheets.find(s=>s.name.trim().toLowerCase()==='monthly');
 if(!sheet)throw new Error('The connected Excel workbook has no Monthly worksheet.');
 const headers=HEADERS.map((_,i)=>normalize(sheet.getRow(1).getCell(i+1).value));validateHeaders(headers);
 const rows=[];let last=1,latest='';
 sheet.eachRow({includeEmpty:false},(row,index)=>{
  if(index===1)return;const m=monthKey(normalize(row.getCell(1).value));if(!m)return;
  // A duplicate must not hide the entire historical report. Keep all Excel rows.
  rows.push(fromRow(row,m));last=Math.max(last,index);if(m>latest)latest=m;
 });
 return {book,sheet,rows,last,latest,duplicateMonths:duplicatedMonths(rows)};
}
const monthlyLegacyCache=new Map();
function legacyJob(file,action,month,updates){
 return weeklyExcel.enqueueLegacy(()=>runMonthlyLegacyJob(file,action,month,updates));
}
async function runMonthlyLegacyJob(file,action,month,updates){
 if(process.platform!=='win32')throw new Error('Legacy .xls Monthly Reports require Microsoft Excel on Windows.');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'clinic-monthly-'));
 const input=path.join(dir,'input.json'),output=path.join(dir,'output.json'),script=path.join(dir,'monthly-legacy-excel.ps1');
 try{
  await fsp.writeFile(script,await fsp.readFile(path.join(__dirname,'monthly-legacy-excel.ps1')),{flag:'wx'});
  await fsp.writeFile(input,JSON.stringify({workbook:file,action,month,updates}),{encoding:'utf8',flag:'wx'});
  return await new Promise((resolve,reject)=>{
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InputPath',input,'-OutputPath',output],{windowsHide:true,timeout:120000});
   let error='';child.stderr.on('data',d=>error+=d.toString().slice(0,3000));child.on('error',reject);
   child.on('close',async code=>{try{const reply=JSON.parse((await fsp.readFile(output,'utf8')).replace(/^\uFEFF/,''));if(!reply.ok||code!==0)throw new Error(reply.error||error||'Monthly Excel operation failed.');resolve(reply);}catch(e){reject(new Error(e.message+(error?' '+error:'')));}});
  });
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
}
async function legacyInspectCached(file,month){
 const mKey=month||'';
 const cacheKey=['monthly-inspect',file,mKey,weeklyExcel.sha256(file)].join('|');
 if(monthlyLegacyCache.has(cacheKey))return monthlyLegacyCache.get(cacheKey);
 if(monthlyLegacyCache.size>12)monthlyLegacyCache.clear();
 const operation=(async()=>{
  if(!mKey){
   const diskHit=weeklyExcel.readDiskCache(cacheKey);
   if(diskHit)return diskHit;
  }
  const result=await legacyJob(file,'inspect',mKey,null);
  if(!mKey)weeklyExcel.writeDiskCache(cacheKey,result);
  return result;
 })();
 monthlyLegacyCache.set(cacheKey,operation);
 operation.catch(()=>{if(monthlyLegacyCache.get(cacheKey)===operation)monthlyLegacyCache.delete(cacheKey);});
 return operation;
}
async function inspect(file,month){requireFile(file);if(month)assertMonth(month);
 if(path.extname(file).toLowerCase()==='.xls'){
  const result=await legacyInspectCached(file,month);
  const conflicting=result.duplicateMonths?.[month];
  if(month&&Array.isArray(conflicting)&&conflicting.length>1)throw new Error(ambiguousMonth(month,conflicting));
  return result;
 }
 const data=await xlsxRead(file);
 const conflicting=data.duplicateMonths[month];
 if(month&&conflicting)throw new Error(ambiguousMonth(month,conflicting));
 const existing=data.rows.find(r=>r.month===month);
 return {months:data.rows.map(r=>({month:r.month,values:r.values,row:r.row})),duplicateMonths:data.duplicateMonths,latest:data.latest,exists:!!existing,row:existing?.row||(month?nextMonthlyRow(data.last,data.latest,month):data.last+1),existing:existing?.values||{}};
}
async function write(file,month,updates){requireFile(file);assertMonth(month);
 for(const [col,value]of Object.entries(updates)){
  if(!COLS.includes(col))throw new Error('Cannot update protected Monthly column '+col+'.');
  if(col==='M'){if(typeof value!=='string'||value.length>10000)throw new Error('Invalid Monthly comments.');}
  else if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid Monthly value for '+col+'.');
 }
 if(path.extname(file).toLowerCase()==='.xls'){
  const res=await legacyJob(file,'write',month,updates);
  monthlyLegacyCache.clear();weeklyExcel.clearDiskCache();
  return res;
 }
 const d=await xlsxRead(file);if(d.duplicateMonths[month])throw new Error(ambiguousMonth(month,d.duplicateMonths[month]));let record=d.rows.find(r=>r.month===month),row=record?.row||nextMonthlyRow(d.last,d.latest,month);
 if(!record&&d.latest&&month<d.latest)throw new Error('This older month is missing from the Excel workbook. Add its month row first. Nothing was modified.');
 if(!record){
  // Preserve a separator row at the start of a new calendar year.
  if(row>d.last+1){
   const separator=d.sheet.getRow(d.last+1),conflicts=[];
   for(let c=1;c<=13;c++)if(separator.getCell(c).value!=null&&separator.getCell(c).value!=='')conflicts.push(separator.getCell(c).address);
   if(conflicts.length)throw new Error('Monthly year separator row '+(d.last+1)+' contains data ('+conflicts.slice(0,4).join(', ')+'). Nothing was modified.');
  }
  const target=d.sheet.getRow(row),occupied=[];
  for(let c=1;c<=13;c++){const cell=target.getCell(c);if(cell.value!==null&&cell.value!==undefined&&cell.value!=='')occupied.push(cell.address);}
  if(occupied.length)throw new Error('Monthly destination row '+row+' already contains data ('+occupied.slice(0,4).join(', ')+'). Nothing was overwritten. Review this row in Excel.');
  const before=d.sheet.getRow(d.last);
  // Never overwrite deliberate styles in the workbook's preformatted blank rows.
  // For genuinely unstyled new rows, copy styles only (never values or formulas).
  if(d.last>1)for(let c=1;c<=13;c++){
   const source=before.getCell(c),dest=target.getCell(c);
   if(!dest.style||Object.keys(dest.style).length===0){
    if(source.style&&Object.keys(source.style).length)dest.style=JSON.parse(JSON.stringify(source.style));
   }
  }
  target.getCell(1).value=new Date(`${month}-01T12:00:00Z`);
  if(!target.getCell(1).numFmt||target.getCell(1).numFmt==='General')target.getCell(1).numFmt=before.getCell(1).numFmt||'mmm-yyyy';
 }
 for(const [col,value] of Object.entries(updates))d.sheet.getCell(col+row).value=value;
 d.book.calcProperties.fullCalcOnLoad=true;
 const tmp=path.join(path.dirname(file),`.clinic-monthly-${process.pid}-${Date.now()}.xlsx`);
 try{await d.book.xlsx.writeFile(tmp);await fsp.rename(tmp,file);}catch(e){try{await fsp.unlink(tmp);}catch{}throw new Error('Close the workbook in Excel and retry. '+e.message);}
 return {row,rowAction:record?'update-existing':'append-month'};
}
module.exports={HEADERS,standard,validateHeaders,monthKey,nextMonthlyRow,duplicatedMonths,ambiguousMonth,requireFile,xlsxRead,inspect,write};
