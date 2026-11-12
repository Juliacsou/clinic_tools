'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const Module=require('module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'weekly-workspace-test-'));
const file=path.join(temp,'weekly-original.xls');fs.writeFileSync(file,'legacy-excel-placeholder');
const csvFile=path.join(temp,'schedule.csv');
fs.writeFileSync(csvFile, 'Date,Time,Patient,Doctor,Type,Status,Next Appt.,Email,Notes,Location,Invoice\n'+
 '10/12/2026,9:00 AM,Example,A,Office VT,Signed Out,,,,Primary,\n'+
 '10/12/2026,10:00 AM,Example,A,Office VT,Canceled,,,,Primary,\n'+
 '10/13/2026,9:00 AM,Example,A,Home Maintenance,Missed,,,,Primary,\n'+
 '10/14/2026,12:00 PM,Example,A,Virtual Orientation,Confirmed,,,,Primary,\n');
let lastWrite=null;const rows=[{date:'2026-10-09',row:724},{date:'2026-10-16',row:725}];
const fakeExcel={
 chartHistory:async()=>rows.map(w=>({weekEnding:w.date,row:w.row,values:w.date==='2026-10-16'?{G:99,K:64}: {G:11},notes:w.date==='2026-10-16'?'Earlier note':''})),
 inspect:async(_,week='1900-01-01')=>({weeks:rows,latestDate:'2026-10-16',row:rows.find(x=>x.date===week)?.row||726,exists:!!rows.find(x=>x.date===week),existing:week==='2026-10-16'?{F:4,O:'=(G725*130)+(H725*310)',P:25000,K:64,L:2,Q:'Earlier note',G:99}:{}}),
 write:async(_,week,updates)=>{lastWrite={week,updates};return {row:725,exists:true}},
 sha256:f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
 requireFile:f=>{if(!fs.existsSync(f))throw new Error('not found')}
};
const original=Module._load;
Module._load=function(request,parent,isMain){if(parent?.filename.endsWith('weekly-backend.js')&&request==='./weekly-excel')return fakeExcel;return original.apply(this,arguments)};
const register=require('../src/weekly-backend');Module._load=original;
const handlers=new Map();const ipcMain={handle:(name,fn)=>handlers.set(name,fn)};
const dialog={showOpenDialog:async(_,options)=>({canceled:false,filePaths:[options.filters?.[0]?.extensions?.includes('csv')?csvFile:file]})};
register({ipcMain,dialog,mainWindow:()=>({}),dataDir:()=>temp,queueWrite:fn=>fn()});
async function invoke(name,...args){assert(handlers.has(name),`Missing handler: ${name}`);return handlers.get(name)({},...args)}
(async()=>{
 const connected=await invoke('weekly:connect');assert.equal(connected.connected,true);assert.equal(connected.format,'.xls');
 const all=await invoke('weekly:list');assert.equal(all.weeks.length,2);assert.equal(all.weeks[0].inExcel,true);
 let record=await invoke('weekly:load-draft','2026-10-16');assert.equal(record.existing.G,99);assert.equal(record.existing.P,25000);
 const parsed=await invoke('weekly:import-csv','weekly','2026-10-16','week-all');assert.equal(parsed.rows,4);assert.equal(parsed.missed,1);assert.equal(parsed.canceled,1);
 const draft={weekEnding:'2026-10-16',sources:{weekly:parsed},overrides:{G:123},manual:{K:67,L:5},comments:'My notes',commentsEdited:true,vtSecondType:'Virtual Orientation'};
 const res=await invoke('weekly:save-draft',draft);assert(res.savedAt);
 record=await invoke('weekly:load-draft','2026-10-16');assert.equal(record.draft.overrides.G,123);assert.equal(record.draft.manual.K,67);
 const list=await invoke('weekly:list');assert.equal(list.weeks[0].hasDraft,true);
 const preview=await invoke('weekly:preview-write',draft);
 assert.equal(preview.row,725);assert.equal(preview.updates.G,123);assert.equal(preview.updates.K,67);
 for(const protectedCol of ['F','O','P'])assert.equal(Object.hasOwn(preview.updates,protectedCol),false);
 assert.equal(preview.existing.O,'=(G725*130)+(H725*310)');
 const output=await invoke('weekly:write-workbook',draft,preview.fileVersion);assert.equal(output.row,725);
 assert.equal(lastWrite.updates.G,123);assert.equal(lastWrite.updates.Q,'My notes');
 for(const protectedCol of ['F','O','P'])assert.equal(Object.hasOwn(lastWrite.updates,protectedCol),false);
 assert(fs.existsSync(output.backup));assert.equal(path.extname(output.backup),'.xls');
 // Deleting the local copy never deletes any Excel rows.
 assert.equal((await invoke('weekly:delete-draft','2026-10-16')).deleted,true);
 assert.equal((await invoke('weekly:list')).weeks.length,2);
 await assert.rejects(()=>invoke('weekly:import-csv','ahead','2026-10-16','ahead-doctors'),/outside/);
 await assert.rejects(()=>invoke('weekly:preview-write',{weekEnding:'2026-10-02',manual:{K:2}}),/older week/);
 console.log('Weekly history, detail, CSV, overrides, backups and protected columns: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
