'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../src/weekly-core'),annual=require('../src/weekly-ahead'),slots=require('../src/weekly-slots');
class Element{
 constructor(root,id){this.root=root;this.id=id;this.dataset={};this.innerHTML='';this.value='';this.onclick=null;}
 querySelectorAll(attr){const key=attr.match(/^\[data-([a-z-]+)\]$/)?.[1];if(!key)return [];
  const nodes=[],re=new RegExp(`<button[^>]+data-${key}="([^"]+)"[^>]*>`,'g');let match;
  while((match=re.exec(this.innerHTML))){const token=this.id+':'+key+':'+match[1];if(!this.root.has(token))this.root.set(token,new Element(this.root,'item'));const el=this.root.get(token);el.dataset[key.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=match[1];nodes.push(el);}return nodes;
 }
 addEventListener(){}focus(){}scrollIntoView(){}
}
const nodes=new Map(),document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,new Element(nodes,s));return nodes.get(s);},getElementById:id=>document.querySelector('#'+id),addEventListener(){},removeEventListener(){}};
const week='2026-10-29',p=core.periods(week);
const parse=(slotId,name,raw,group)=>({...core.parseCsv('Date,Type,Status\n'+raw,p[group]),slotId,fileName:name,fileHash:name,importedAt:'2026-10-29T15:00:00Z'});
const weekly=parse('week-all','all-week.csv','10/29/2026,Office VT,Confirmed\n10/29/2026,Virtual VT,Confirmed\n10/29/2026,Virtual Orientation,Confirmed\n','weekly');
const doctor=parse('ahead-doctors','doctors.csv','10/30/2026,VDE Doctor-Tech,Confirmed\n10/30/2026,Patient Consultation,Confirmed\n','ahead');
const therapist=parse('ahead-therapists','orientation.csv','10/30/2026,Virtual Orientation,Confirmed\n','ahead');
const replacement=parse('ahead-therapists','orientation-new.csv','10/30/2026,Virtual Orientation,Confirmed\n10/31/2026,Virtual Orientation,Confirmed\n','ahead');
const uploads=[weekly,doctor,therapist,replacement];let stored=null,saveCount=0;
const api={getWeeklyInfo:async()=>({connected:true,workbookPath:'clinic.xls'}),listWeeklyReports:async()=>({weeks:[{weekEnding:week,inExcel:true}]}),loadWeeklyDraft:async()=>({draft:stored,existing:{B:10},inExcel:true}),saveWeeklyDraft:async d=>{stored=JSON.parse(JSON.stringify(d));saveCount++;return {savedAt:'now'};},importWeeklyCsv:async(_g,_w,slotId)=>{const f=uploads.shift();assert.equal(f.slotId,slotId);return f;}};
const notifications=[];
const window={clinicAPI:api,WeeklyAhead:annual,WeeklySlots:slots,UX:{setHeader(){},showToast:s=>notifications.push(s),confirm:async()=>true,page:''}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/weekly-page.js'),'utf8'),{window,document,Date,String,Object,Number,Promise,console,setTimeout});
(async()=>{
 await window.renderWeeklyReportWeeks();const screen=document.getElementById('app');
 await screen.querySelectorAll('[data-edit-week]')[0].onclick();
 assert.match(screen.innerHTML,/10\/30\/2026/);assert.match(screen.innerHTML,/10\/29\/2027/);
 const imports=screen.querySelectorAll('[data-slot-import]');
 assert.equal(imports.length,3,'exactly 3 CSV fields in UI');
 assert.deepEqual(imports.map(x=>x.dataset.slotImport),['week-all','ahead-doctors','ahead-therapists']);
 assert.match(screen.innerHTML,/Virtual Orientation/);
 assert.doesNotMatch(screen.innerHTML,/Two annual CSVs; one for Doctors/);
 assert.doesNotMatch(screen.innerHTML,/Missing CSV fields leave/);
 const select=id=>screen.querySelectorAll('[data-slot-import]').find(x=>x.dataset.slotImport===id);
 await select('week-all').onclick();assert.equal(stored.sources.weekly.fileName,'all-week.csv');
 assert.equal(stored.sources.weekly.counts['Virtual Orientation'].valid,1);
 await select('ahead-doctors').onclick();assert.equal(stored.sources.ahead.files.length,1);
 assert.equal(stored.sources.ahead.counts['Patient Consultation'].valid,1);
 await select('ahead-therapists').onclick();assert.equal(stored.sources.ahead.files.length,2);
 assert.match(screen.innerHTML,/Virtual Orientation/);
 assert.doesNotMatch(screen.innerHTML,/Both Ahead exports are loaded/);
 await select('ahead-therapists').onclick();assert.equal(stored.sources.ahead.files.length,2);
 assert.equal(stored.sources.ahead.counts['Virtual Orientation'].valid,2);
 assert.match(screen.innerHTML,/orientation-new.csv/);
 assert.doesNotMatch(screen.innerHTML,/orientation.csv<\/strong>/);
 const remove=screen.querySelectorAll('[data-slot-remove]').find(x=>x.dataset.slotRemove==='1');
 await remove.onclick();assert.equal(stored.sources.ahead.files.length,1);
 assert.equal(stored.sources.ahead.counts['Virtual Orientation'],undefined);
 assert(saveCount>=5);
 console.log('Three CSV UI fields, weekly combined import, annual file replacement/removal and dates: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
