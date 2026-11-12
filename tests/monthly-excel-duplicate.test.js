'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const headers=['Month Year','# of inquiries','# free Screenings','OM Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','# VT Sessions','# VT Grads','# Cancellations 99215/Annuals','# Cancellations 99213/Follow ups','Comments'];
const values=[
 [1,headers],
 [173,[new Date(Date.UTC(2026,2,1)),44,0,47,46,40,23,187,713,24,12,21,'March']],
 [174,[new Date(Date.UTC(2026,3,1)),39,0,46,41,43,28,190,716,27,19,31,'First April']],
 [175,[new Date(Date.UTC(2026,4,1)),48,0,38,33,31,22,181,628,27,12,25,'May']],
 [204,[new Date(Date.UTC(2026,3,15)),40,0,50,43,45,31,191,718,26,15,28,'Second April']]
];
const rows=new Map(values.map(([n,cols])=>[n,{number:n,getCell(c){return {value:cols[c-1]??null}}}]));
const sheet={name:'monthly',getRow(n){return rows.get(n)||{number:n,getCell(){return {value:null}}}},eachRow(_options,fn){for(const [n] of values)fn(rows.get(n),n)}};
const fakeExcelJs={Workbook:class{constructor(){this.worksheets=[sheet];this.xlsx={readFile:async()=>{},writeFile:async()=>{throw new Error('Should never write conflict')}}}}};
const original=Module._load;
Module._load=function(request,parent){if(request==='exceljs')return fakeExcelJs;return original.apply(this,arguments);};
const excel=require('../src/monthly-excel');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'monthly-duplicate-excel-'));
const workbook=path.join(folder,'test.xlsx');fs.writeFileSync(workbook,'mock');
(async()=>{
 assert.equal(excel.monthKey('Apr-26'),'2026-04');
 assert.equal(excel.monthKey('April 2026'),'2026-04');
 const history=await excel.inspect(workbook);
 assert.equal(history.months.length,4);
 assert.deepEqual(history.duplicateMonths['2026-04'],[174,204]);
 assert.equal(history.latest,'2026-05');
 const march=await excel.inspect(workbook,'2026-03');assert.equal(march.exists,true);assert.equal(march.row,173);
 await assert.rejects(excel.inspect(workbook,'2026-04'),/174, 204/);
 await assert.rejects(excel.write(workbook,'2026-04',{B:49}),/174, 204/);
 assert.equal(fs.readFileSync(workbook,'utf8'),'mock','A conflicting workbook must never be changed');
 console.log('Monthly Excel: history available, duplicate rows detected, editing conflict blocked, no writes: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(folder,{recursive:true,force:true}));
