'use strict';
// Regression: a duplicate in a live legacy .xls must never blank All Months.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(name,parent){
 if(name==='exceljs')return {Workbook:class{}};
 return originalLoad.apply(this,arguments);
};
let backend;
try{backend=require('../src/monthly-backend');}finally{Module._load=originalLoad;}

const excelSource=fs.readFileSync(path.join(__dirname,'../src/monthly-legacy-excel.ps1'),'utf8');
assert.match(excelSource,/duplicateMonths=\@\{\}/);
assert.match(excelSource,/\$duplicateMonths\.ContainsKey/);
assert.doesNotMatch(excelSource,/throw \('Duplicate Monthly month '/);

const input=[
 {month:'2026-06',row:176,values:{B:46,H:182,I:727}},
 {month:'2026-04',row:174,values:{B:39,H:190,I:716}},
 {month:'2026-04',row:204,values:{B:40,H:191,I:718}},
 {month:'2026-03',row:173,values:{B:44,H:187,I:713}}
];
const rows=backend.combine({'2026-04':{month:'2026-04',manual:{B:999},savedAt:'2026-11-06'}},input);
assert.equal(rows.length,4,'Do not silently drop or collapse duplicate Excel rows');
assert.deepEqual(rows.filter(r=>r.month==='2026-04').map(r=>r.excelRow),[174,204]);
assert(rows.filter(r=>r.month==='2026-04').every(r=>r.duplicate===true));
assert.deepEqual(rows.filter(r=>r.month==='2026-04').map(r=>r.values.B),[39,40],'Never overwrite duplicates with a draft');
assert.equal(rows.find(r=>r.month==='2026-06').values.I,727);
assert.equal(rows.find(r=>r.month==='2026-03').values.B,44);

const controls=new Map();
class Node{
 constructor(id){this.id=id;this.innerHTML='';this.value='';this.dataset={};}
 querySelectorAll(sel){
  const attr=sel.match(/^\[data-([a-z-]+)\]$/)?.[1];if(!attr)return [];
  const re=new RegExp(`<button[^>]*data-${attr}="([^"]+)"[^>]*>`, 'g'),results=[];let match;
  while((match=re.exec(this.innerHTML))){
   const key=`${attr}:${match[1]}`;if(!controls.has(key))controls.set(key,new Node(key));
   const node=controls.get(key);node.dataset[attr.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=match[1];results.push(node);
  }return results;
 }
}
const root=new Node('app'),dom={getElementById(id){return id==='app'?root:new Node(id);},querySelector(){return new Node('other');}};
const app={clinicAPI:{getMonthlyInfo:async()=>({connected:true,count:4,duplicateMonths:{'2026-04':[174,204]}}),listMonthlyReports:async()=>({months:rows,error:null})},UX:{setHeader(){},page:''}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/monthly-page.js'),'utf8'),{document:dom,window:app,Date,Promise,String,Number,Object,console});
(async()=>{
 await app.renderMonthlyReport();
 assert.match(root.innerHTML,/All Months/);
 assert.match(root.innerHTML,/June 2026/);
 assert.match(root.innerHTML,/March 2026/);
 assert.match(root.innerHTML,/Excel row 174/);
 assert.match(root.innerHTML,/Excel row 204/);
 assert.match(root.innerHTML,/Duplicate months in Excel/);
 assert.doesNotMatch(root.innerHTML,/No monthly reports/);
 assert.equal(root.querySelectorAll('[data-month]').length,2,'Only non-conflicted months may be edited');
 console.log('Monthly duplicate history: both conflicting rows remain visible, normal months remain editable, drafts safe: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
