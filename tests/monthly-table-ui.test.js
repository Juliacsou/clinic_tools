'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controls=new Map();
class Node {
  constructor(id){this.id=id;this.innerHTML='';this.value='';this.dataset={};this.onclick=null;this.onchange=null;this.onsubmit=null;}
  querySelectorAll(selector){
    const attr=selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    if(attr){const nodes=[],re=new RegExp(`<button[^>]*data-${attr}="([^"]+)"[^>]*>`, 'g');let match;
      while((match=re.exec(this.innerHTML))){const key=this.id+':'+attr+':'+match[1];if(!controls.has(key))controls.set(key,new Node('button'));const n=controls.get(key);n.dataset[attr.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=match[1];nodes.push(n);}return nodes;
    }
    if(selector==='input[name="mrMode"]') return ['all','split'].map(v=>{const key='radio:'+v;if(!controls.has(key))controls.set(key,new Node('radio'));const n=controls.get(key);n.value=v;return n;});
    return [];
  }
  addEventListener(){} focus(){} scrollIntoView(){}
}
const app=new Node('app'),dialog=new Node('dialogRoot'),others=new Map();
const document={getElementById(id){if(id==='app')return app;if(id==='dialogRoot')return dialog;return document.querySelector('#'+id);},querySelector(selector){
  if(selector==='#mrComments'){
    const match=app.innerHTML.match(/<textarea id="mrComments"[^>]*>([\s\S]*?)<\/textarea>/);
    if(!match)return null;
    const n=new Node('mrComments');n.value=match[1];return n;
  }
  if(selector==='#app')return app;if(selector==='#dialogRoot')return dialog;
  if(!others.has(selector))others.set(selector,new Node(selector));return others.get(selector);
}};
const month='2026-11';let stored=null,saved=0;
const API={
  getMonthlyInfo:async()=>({connected:true}),
  listMonthlyReports:async()=>({months:[{month,inExcel:true,pending:false,values:{B:3,H:11,M:'Previous notes'}}]}),
  loadMonthlyReport:async()=>({draft:stored,existing:{B:3,H:11,M:'Previous notes'},inExcel:true}),
  saveMonthlyDraft:async d=>{stored=JSON.parse(JSON.stringify(d));saved++;return {savedAt:'now'};},
  importMonthlyCsv:async(_month,slot)=>({fileName:slot+'.csv',rows:9,counts:{'Office VT':{valid:4},'Virtual VT':{valid:2},'Virtual Orientation':{valid:3}}})
};
const window={clinicAPI:API,UX:{setHeader(){},showToast(){},confirm:async()=>true,page:''}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/monthly-page.js'),'utf8'),{document,window,Date,Promise,Number,String,Object,console});
(async()=>{
  await window.renderMonthlyReport();
  assert.match(app.innerHTML,/All Months/);
  await app.querySelectorAll('[data-month]')[0].onclick();
  assert.equal((app.innerHTML.match(/class="mr-data-table"/g)||[]).length,1,'one unified data table');
  assert.equal((app.innerHTML.match(/class="mr-col-letter"/g)||[]).length,13,'all Excel columns A to M');
  assert.match(app.innerHTML,/>A<\/td><th scope="row">Month Year/);
  assert.match(app.innerHTML,/>M<\/td><th scope="row">Comments/);
  assert.doesNotMatch(app.innerHTML,/mr-grid|mr-stat|mr-section-title|<h3[^>]*>Doctors|<h3[^>]*>Therapists|<h3[^>]*>Manual/);
  assert.equal(app.querySelectorAll('[data-edit]').length,11,'all 11 numeric indicators editable');
  assert.equal(app.querySelectorAll('[data-import]').length,1,'one Full Schedule file initially');
  const split=app.querySelectorAll('input[name="mrMode"]')[1];await split.onchange();
  assert.equal(app.querySelectorAll('[data-import]').length,2,'split mode retains Doctors and Therapists files');
  const therapists=app.querySelectorAll('[data-import]').find(b=>b.dataset.import==='therapists');await therapists.onclick();
  assert.equal(stored.sources.therapists.fileName,'therapists.csv');
  assert.match(app.innerHTML,/Therapists/);
  assert.match(app.innerHTML,/6<\/td>/,'VT Sessions is Office VT + Virtual VT');
  const manual=app.querySelectorAll('[data-edit]').find(b=>b.dataset.edit==='H');await manual.onclick();
  assert.match(dialog.innerHTML,/VT Patients Enrolled/);
  const number=document.querySelector('#mrNumber');number.value='27';
  const submit=document.querySelector('#mrNumberForm');await submit.onsubmit({preventDefault(){}});
  assert.equal(stored.manual.H,27);
  assert.match(app.innerHTML,/>27<\/td>/);
  assert.match(app.innerHTML,/Previous notes/,'original comments not lost during numeric edit');
  assert(saved>=2);
  await document.querySelector('#mrDone').onclick();
  assert.equal((app.innerHTML.match(/class="mr-col-letter"/g)||[]).length,13,'read-only table still shows all 13 columns');
  assert.match(app.innerHTML,/Previous notes/,'comments remain visible in read-only table');
  assert.doesNotMatch(app.innerHTML,/<textarea id="mrComments"/,'comments become read-only');
  console.log('Monthly UI: unified A-M table, editable metrics, comments, split CSVs, VT Sessions and draft preservation: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
