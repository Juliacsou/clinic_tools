'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
class FakeElement{
 constructor(root,id){this.root=root;this.id=id;this.dataset={};this.onclick=null;this.value='';this.innerHTML='';}
 querySelectorAll(attr){const key=attr.match(/^\[data-([a-z-]+)\]$/)?.[1];if(!key)return [];
  const nodes=[],re=new RegExp(`<button[^>]+data-${key}="([^"]+)"[^>]*>`, 'g');let hit;
  while((hit=re.exec(this.innerHTML))){const token=this.id+':'+key+':'+hit[1];if(!this.root.has(token))this.root.set(token,new FakeElement(this.root,'item'));const el=this.root.get(token);el.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=hit[1];nodes.push(el);}
  return nodes;
 }
 addEventListener(){}
}
const nodes=new Map();const dom={
 querySelector(sel){if(!nodes.has(sel))nodes.set(sel,new FakeElement(nodes,sel));return nodes.get(sel)},
 getElementById(id){return dom.querySelector('#'+id)},
 addEventListener(){},removeEventListener(){}
};
const week='2026-10-16';
const fake={getWeeklyInfo:async()=>({connected:true,workbookPath:'C:/clinic.xls'}),listWeeklyReports:async()=>({weeks:[{weekEnding:week,inExcel:true,hasDraft:false,values:{B:14,C:9,M:61,N:2},notes:'All weeks sample note'},{weekEnding:'2026-10-09',inExcel:false,hasDraft:true},{weekEnding:'2026-09-25',inExcel:true,hasDraft:false},{weekEnding:'2025-10-17',inExcel:true,hasDraft:false}]}),loadWeeklyDraft:async()=>({draft:null,existing:{K:60,G:18,N:4,Q:'Previous notes'},inExcel:true}),saveWeeklyDraft:async()=>({savedAt:'2026-10-20'})};
const context={window:{WeeklyAhead:require('../src/weekly-ahead'),WeeklySlots:require('../src/weekly-slots'),clinicAPI:fake,UX:{setHeader(){},showToast(){},confirm:async()=>true,page:''}},document:dom,console,Date,setTimeout,Promise,Number,Object,String};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/weekly-page.js'),'utf8'),context,{filename:'weekly-page.js'});
(async()=>{
 await context.window.renderWeeklyReportWeeks();
 const screen=dom.getElementById('app');
 assert.match(screen.innerHTML,/Reporting history/);assert.match(screen.innerHTML,/New Week/);
 assert.match(screen.innerHTML,/data-edit-week="2026-10-16"/);
 assert.match(screen.innerHTML,/wr-history-table/);
 assert.match(screen.innerHTML,/Ahead · 1 year/);
 assert.match(screen.innerHTML,/Ocular Motor/);
 assert.match(screen.innerHTML,/VT Sessions/);
 assert.match(screen.innerHTML,/All weeks sample note/);
 assert.match(screen.innerHTML,/>61<\/td>/);
 assert.match(screen.innerHTML,/wr-history-edit/);
 assert.doesNotMatch(screen.innerHTML,/data-open=/);
 assert.match(screen.innerHTML,/data-edit-week=\"2026-10-16\"/);
 assert.match(screen.innerHTML,/Oct/);
 assert.match(screen.innerHTML,/wrMonth/);
 assert.match(screen.innerHTML,/wrToDashboard/);
 context.window.renderWeeklyDashboard=()=>{context.window.returnedToDashboard=true;};
 assert(dom.querySelector('#wrToDashboard').onclick,'dashboard button must have a navigation handler');
 dom.querySelector('#wrToDashboard').onclick();
 assert(context.window.returnedToDashboard,'dashboard button must navigate to dashboard');
 assert.doesNotMatch(screen.innerHTML,/Total weeks|Not yet in Excel|All statuses|<span class="wr-state done">/);
 const monthSelector=dom.querySelector('#wrMonth');
 assert(monthSelector.onchange,'month filter must be wired');
 monthSelector.onchange({target:{value:'09'}});
 assert.match(screen.innerHTML,/data-edit-week="2026-09-25"/);
 assert.doesNotMatch(screen.innerHTML,/data-edit-week="2026-10-16"/);
 monthSelector.onchange({target:{value:'all'}});
 assert.match(screen.innerHTML,/data-edit-week="2026-10-16"/);
 const edit=screen.querySelectorAll('[data-edit-week]')[0];assert(edit?.onclick);
 await edit.onclick();
 assert.match(screen.innerHTML,/This week/);assert.match(screen.innerHTML,/Ahead/);assert.match(screen.innerHTML,/VT Patients Enrolled/);assert.match(screen.innerHTML,/Save report/);
 assert.match(screen.innerHTML,/Previous notes/);
 assert(!screen.innerHTML.includes('Column K'));assert(!screen.innerHTML.includes('Excel destination'));
 assert(!screen.innerHTML.includes('Manual information'));
 assert.match(screen.innerHTML,/wr-weekly-block/);assert.match(screen.innerHTML,/wr-ahead-block/);
 console.log('Weekly dashboard return, month/year filters, draft-only status and editing: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
