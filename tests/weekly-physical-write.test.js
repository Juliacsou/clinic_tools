'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const Module=require('module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-physical-layout-'));
const classic=['WEEK ENDING','# new Ocular motor Booked Ahead',"# Percep Tests 'Booked Ahead",'# VT Consults Booked Ahead','Total # new patients for  OM & Percep ','VT Pts Scheduled to Start','# of new inquiries','# Ocular Motor Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients','# VT Sessions','# VT closing','Totals Charges','Total Income','Comments'];
const compact=['WEEK ENDING','autofill # new Ocular motor Booked Ahead',"autofill # Percep Tests 'Booked Ahead",'autofill # VT Consults Booked Ahead',' autofill VT Pts Scheduled to Start','# of new inquiries','autofill # Ocular Motor Exams Done','autofill Percept Test Done','autofill # VT Consults Done','autofill # New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients',' autofill # VT Sessions','autofill # VT closing','autofill Totals Charges','Total Income','Comments'];
const letter=i=>String.fromCharCode(64+i);
function fixture(headers){const cells={};headers.forEach((h,i)=>cells[`${letter(i+1)}1`]=h);cells.A2='2026-10-16';if(headers.length===18){cells.E2=333;cells.N2=100;cells.O2=4;cells.P2='=(H2*130)+(I2*310)+(N2*157)';cells.Q2=2000;cells.R2='Original';}else{cells.M2=100;cells.N2=4;cells.O2='=(G2*130)+(H2*310)+(M2*157)';cells.P2=2000;cells.Q2='Original';}return {cells,cols:headers.length};}
class FakeSheet{
 constructor(snapshot){this.cells={};for(const [ref,value]of Object.entries(snapshot.cells)){this.cells[ref]={value,style:{}};}this.columnCount=snapshot.cols;this.name='weekly';}
 getCell(ref){if(!this.cells[ref])this.cells[ref]={value:null,style:{}};return this.cells[ref];}
 getRow(n){return {getCell:c=>this.getCell(letter(c)+n),eachCell:(_opt,fn)=>{for(let c=1;c<=this.columnCount;c++){const cell=this.getCell(letter(c)+n);if(cell.value!==null&&cell.value!==undefined)fn(cell,c)}}};}
 eachRow(opts,cb){const rows=[...new Set(Object.keys(this.cells).map(k=>Number(k.match(/\d+$/)[0])))].sort((a,b)=>a-b);for(const r of rows){if(Object.keys(this.cells).some(k=>k.endsWith(String(r))&&this.cells[k].value!==null))cb(this.getRow(r),r);}}
}
class FakeWorkbook{
 constructor(){this.calcProperties={};this.xlsx={readFile:async file=>{const snap=JSON.parse(fs.readFileSync(file,'utf8'));this.worksheets=[new FakeSheet(snap)];},writeFile:async file=>{const s=this.worksheets[0];const cells={};for(const [ref,v]of Object.entries(s.cells))if(v.value!==null&&v.value!==undefined)cells[ref]=v.value instanceof Date?v.value.toISOString():v.value;fs.writeFileSync(file,JSON.stringify({cells,cols:s.columnCount}));}};}
}
const original=Module._load;
Module._load=function(req,parent){if(req==='exceljs'&&parent?.filename.endsWith('weekly-excel.js'))return {Workbook:FakeWorkbook};return original.apply(this,arguments);};
let bridge;
try{bridge=require('../src/weekly-excel');}finally{Module._load=original;}
(async()=>{
 for(const [tag,headers,col] of [['classic',classic,{session:'N',closing:'O',notes:'R',extra:'E',charge:'P',income:'Q'}],['compact',compact,{session:'M',closing:'N',notes:'Q',extra:null,charge:'O',income:'P'}]]){
  const file=path.join(temp,tag+'.xlsx');fs.writeFileSync(file,JSON.stringify(fixture(headers)));
  const inspected=await bridge.inspect(file,'2026-10-16');
  assert.equal(inspected.exists,true);assert.equal(inspected.layout,tag);
  assert.equal(inspected.existing.M,100);assert.equal(inspected.existing.N,4);assert.equal(inspected.existing.Q,'Original');
  await bridge.write(file,'2026-10-16',{M:155,N:7,Q:'Updated note',E:8});
  const data=JSON.parse(fs.readFileSync(file,'utf8')).cells;
  assert.equal(data[col.session+'2'],155);assert.equal(data[col.closing+'2'],7);assert.equal(data[col.notes+'2'],'Updated note');
  assert.equal(data[col.charge+'2'],tag==='classic'?'=(H2*130)+(I2*310)+(N2*157)':'=(G2*130)+(H2*310)+(M2*157)');
  assert.equal(data[col.income+'2'],2000);
  if(col.extra)assert.equal(data[col.extra+'2'],333,'classic-only New Patients for OM & Percep is untouched');
  assert.equal(data[inspected.map.E+'2'],8,'scheduled VT start is in the correct physical column');
  // A future report row already prepared with a formula must not be erased or rejected.
  if(tag==='classic'){const x=JSON.parse(fs.readFileSync(file,'utf8'));x.cells.E2={formula:'C2',result:54};x.cells.E3={formula:'C3',result:0};fs.writeFileSync(file,JSON.stringify(x));}
  await bridge.write(file,'2026-10-23',{M:42,N:3,Q:'New week'});
  const appended=JSON.parse(fs.readFileSync(file,'utf8')).cells;
  assert.equal(appended[col.session+'3'],42);assert.equal(appended[col.closing+'3'],3);assert.equal(appended[col.notes+'3'],'New week');
  assert.equal(appended[col.charge+'3'],undefined,'do not write a doctor formula in a new week');
  assert.equal(appended[col.income+'3'],undefined,'do not touch financial columns');
  if(tag==='classic')assert.deepEqual(appended.E3,{formula:'C3',result:0},'prepared future formula must be preserved');
  if(tag==='classic'){
   const x=JSON.parse(fs.readFileSync(file,'utf8'));
   x.cells.R4='Protected notes with no date';
   fs.writeFileSync(file,JSON.stringify(x));
   // The fixture above is JSON, not a real XLSX. Windows normally uses Excel
   // COM to insert a row when a future row contains data. That path cannot
   // open this synthetic fixture even when Microsoft Excel is installed.
   // Exercise the safe rejection branch deterministically on every OS;
   // Windows/COM integration is a separate manual test using a real workbook.
   const originalPlatform=Object.getOwnPropertyDescriptor(process,'platform');
   try{
    if(process.platform==='win32')Object.defineProperty(process,'platform',{configurable:true,value:'linux'});
    await assert.rejects(()=>bridge.write(file,'2026-10-30',{M:20}),/next reporting row has data/i);
   }finally{
    Object.defineProperty(process,'platform',originalPlatform);
   }
   assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).cells.R4,'Protected notes with no date');
  }
  console.log(tag+' workbook edit, append, prepared formulas, protection and original-only field: PASS');
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
