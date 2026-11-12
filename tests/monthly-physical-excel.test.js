'use strict';
// End-to-end Monthly save on actual .xlsx; additionally test .xls via Microsoft
// Excel COM on Windows. All test data is synthetic and kept outside user data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
let ExcelJS;
try { ExcelJS=require('exceljs'); }
catch (e) {
 if(e.code!=='MODULE_NOT_FOUND')throw e;
 console.log('Monthly physical Excel: SKIP (exceljs dependency not installed in this environment)');
 process.exit(0);
}
const monthly=require('../src/monthly-excel');
const headers=monthly.HEADERS;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-monthly-physical-'));
const xlsx=path.join(temp,'synthetic.xlsx'),xls=path.join(temp,'synthetic.xls');
function runPowerShell(code){
 return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',code],{encoding:'utf8',windowsHide:true,timeout:60000});
}
async function setup(){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('monthly');
 headers.forEach((h,i)=>{sheet.getRow(1).getCell(i+1).value=h;});
 function month(n,m,v){let r=sheet.getRow(n);r.getCell(1).value=new Date(m+'-01T12:00:00Z');r.getCell(1).numFmt='mmmm-yy';r.getCell(2).value=v;r.getCell(4).value=v*2;}
 month(2,'2025-12',15);month(4,'2026-12',19);
 for(const n of [3,5,6,7]){
  const r=sheet.getRow(n);
  r.getCell(1).numFmt='mmmm-yy';
  r.getCell(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};
 }
 const notes=book.addWorksheet('Test Ledger');notes.getCell('A1').value='PRESERVE THIS SHEET';notes.getCell('B1').value={formula:'SUM(1,2)',result:3};
 await book.xlsx.writeFile(xlsx);
}
async function check(file,kind){
 const start=await monthly.inspect(file,'2027-01');
 assert.equal(start.row,6,kind+' must reserve the existing separator row 5');
 assert.equal(start.exists,false);
 let saved=await monthly.write(file,'2027-01',{B:47,D:18,I:200,M:kind+' January'});
 assert.equal(saved.row,6);
 let jan=await monthly.inspect(file,'2027-01');assert.equal(jan.exists,true);assert.equal(jan.existing.B,47);assert.equal(jan.existing.D,18);assert.equal(jan.existing.M,kind+' January');
 saved=await monthly.write(file,'2027-02',{B:50,H:123});assert.equal(saved.row,7);
 let feb=await monthly.inspect(file,'2027-02');assert.equal(feb.existing.H,123);
 saved=await monthly.write(file,'2027-03',{B:51,D:17});assert.equal(saved.row,8);
 let mar=await monthly.inspect(file,'2027-03');assert.equal(mar.existing.B,51);assert.equal(mar.existing.D,17);
 saved=await monthly.write(file,'2026-12',{B:22});assert.equal(saved.row,4);
 let dec=await monthly.inspect(file,'2026-12');assert.equal(dec.existing.B,22);
 const history=await monthly.inspect(file);
 assert.deepEqual(history.months.map(r=>r.row),[2,4,6,7,8]);
 if(kind==='xlsx'){
  const testBook=new ExcelJS.Workbook();await testBook.xlsx.readFile(file);
  const sh=testBook.getWorksheet('monthly');
  assert.equal(sh.getCell('A3').value,null);assert.equal(sh.getCell('A5').value,null);
  assert.equal(sh.getCell('D6').fill.fgColor.argb,'FFFFFF00');
  assert.equal(sh.getCell('A6').numFmt,'mmmm-yy');
  assert.equal(testBook.getWorksheet('Test Ledger').getCell('A1').value,'PRESERVE THIS SHEET');
 }
 console.log('Monthly physical '+kind+': insert same/new year, preserve separator, existing edit, readback: PASS');
}
(async()=>{
 await setup();await check(xlsx,'xlsx');
 if(process.platform!=='win32'){
  console.log('Monthly physical .xls COM: SKIP (requires Windows and desktop Microsoft Excel)');
  return;
 }
 try{runPowerShell("$ErrorActionPreference='Stop';$x=New-Object -ComObject Excel.Application;$x.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($x)");}
 catch{console.log('Monthly physical .xls COM: SKIP (Microsoft Excel desktop is not installed)');return;}
 const escape=s=>s.replace(/'/g,"''");
 // Recreate the unmodified fixture so that .xls and .xlsx run identical cases.
 await setup();
 const source=escape(xlsx),dest=escape(xls);
 runPowerShell(`$ErrorActionPreference='Stop';$app=$null;$b=$null;try{$app=New-Object -ComObject Excel.Application;$app.Visible=$false;$app.DisplayAlerts=$false;$b=$app.Workbooks.Open('${source}');$b.SaveAs('${dest}',56)}finally{if($b){$b.Close($false)};if($app){$app.Quit()};[GC]::Collect();[GC]::WaitForPendingFinalizers()}`);
 await check(xls,'xls');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true});});
