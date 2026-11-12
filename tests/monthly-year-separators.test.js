'use strict';
// Regression: a full historic workbook uses deliberately blank rows between years.
// Test the real Monthly adapter's ExcelJS branch with a minimal in-memory sheet.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const headers=['Month Year','# of inquiries','# free Screenings','OM Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','# VT Sessions','# VT Grads','# Cancellations 99215/Annuals','# Cancellations 99213/Follow ups','Comments'];
const entries=new Map();
function row(n){if(!entries.has(n)){
 const cells=new Map();entries.set(n,{number:n,getCell(i){if(!cells.has(i))cells.set(i,{address:String.fromCharCode(64+i)+n,value:null,style:{},numFmt:'General'});return cells.get(i);},eachCell(options,fn){for(const [i,cell]of cells)if(options.includeEmpty||cell.value!==null)fn(cell,i);}});
 }return entries.get(n);}
headers.forEach((h,i)=>row(1).getCell(i+1).value=h);
const at=(n,month)=>{row(n).getCell(1).value=new Date(month+'-01T12:00:00Z');row(n).getCell(1).numFmt='mmmm-yy';row(n).getCell(2).value=11;};
at(2,'2025-12');
// Deliberate separator between 2025 and 2026.
row(3).getCell(1).style={font:{italic:true}};
at(4,'2026-01');at(5,'2026-12');
const separator=row(6);separator.getCell(1).style={fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFABCDEF'}}};
row(7).getCell(1).numFmt='mmmm-yy'; // previously prepared January 2027 row
row(7).getCell(4).style={fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}}};
const sheet={name:'monthly',getRow:row,getCell(a){const match=a.match(/^([A-M])(\d+)$/);assert(match);return row(Number(match[2])).getCell(match[1].charCodeAt(0)-64);},eachRow(_options,callback){for(const [n,r]of [...entries].sort((a,b)=>a[0]-b[0]))callback(r,n);}};
class FakeWorkbook{constructor(){this.worksheets=[sheet];this.calcProperties={};this.xlsx={readFile:async()=>{},writeFile:async file=>fs.writeFileSync(file,'UPDATED')};}}
const original=Module._load;
Module._load=function(request,parent){if(request==='exceljs')return {Workbook:FakeWorkbook};return original.apply(this,arguments);};
const excel=require('../src/monthly-excel');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'monthly-year-separators-'));
const file=path.join(temp,'clinic.xlsx');fs.writeFileSync(file,'ORIGINAL');
(async()=>{
 assert.equal(excel.nextMonthlyRow(5,'2026-12','2026-12'),6);
 assert.equal(excel.nextMonthlyRow(5,'2026-12','2027-01'),7);
 assert.equal(excel.nextMonthlyRow(176,'2026-06','2026-07'),177);
 assert.equal(excel.nextMonthlyRow(176,'2026-06','2027-01'),178);
 const listing=await excel.inspect(file);
 assert.deepEqual(listing.months.map(r=>r.row),[2,4,5]);
 let preview=await excel.inspect(file,'2027-01');assert.equal(preview.row,7);
 let result=await excel.write(file,'2027-01',{B:20,D:31,M:'2027 report'});
 assert.equal(result.row,7);assert.equal(result.rowAction,'append-month');
 assert.equal(row(6).getCell(1).value,null,'New year must not overwrite blank separator');
 assert.deepEqual(row(6).getCell(1).style,separator.getCell(1).style,'Separator style must be untouched');
 assert.equal(row(7).getCell(1).numFmt,'mmmm-yy','Preformatted month display must be preserved');
 assert.equal(row(7).getCell(4).style.fill.fgColor.argb,'FFFFFF00','Yellow template styles must stay intact');
 assert.equal(row(5).getCell(2).value,11,'Previous year must remain unchanged');
 result=await excel.write(file,'2027-02',{B:42});assert.equal(result.row,8,'Following month uses adjacent row in same year');
 assert.equal(row(7).getCell(2).value,20,'Adding February must not change January');
 assert.equal(row(8).getCell(1).numFmt,'mmmm-yy','New unformatted cells inherit date display from previous report');
 assert.equal(row(8).getCell(2).value,42);
 // A prepared row with data must not be overwritten, nor its following separator.
 row(9).getCell(3).value=999;
 await assert.rejects(excel.write(file,'2027-03',{B:33}),/already contains data/);
 assert.equal(row(9).getCell(3).value,999);
 // Existing December gets updated in-place. Historic separator remains untouched.
 result=await excel.write(file,'2025-12',{B:65});assert.equal(result.row,2);assert.equal(row(3).getCell(1).value,null);
 console.log('Monthly year separators: preserve historic blank rows, continue within year, protect populated template rows and formatting: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Module._load=original;fs.rmSync(temp,{recursive:true,force:true});});
const ps=fs.readFileSync(path.join(__dirname,'../src/monthly-legacy-excel.ps1'),'utf8');
assert.doesNotMatch(ps,/\$excel\.CutCopyMode\s*=/i,'Interop XlCutCopyMode cannot accept numeric 0');
assert.doesNotMatch(ps,/\.PasteSpecial\(/i,'Avoid flaky BIFF8 Copy/PasteSpecial');
assert.match(ps,/\$crossYear/);
assert.match(ps,/\$last\+2/);
assert.match(ps,/\$hasSelectedMonth/,'Reading All Months without a selected month must not throw Substring bounds error');
assert.match(ps,/\$dest\.ClearContents\(\)/);
