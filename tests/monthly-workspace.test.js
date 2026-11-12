'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),core=require('../src/monthly-core');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'monthly-clinic-'));
const connected=path.join(temp,'weekly-reports');fs.mkdirSync(connected);
const workbook=path.join(temp,'workbook.xlsx');fs.writeFileSync(workbook,'MONTHLY');fs.writeFileSync(path.join(connected,'settings.json'),JSON.stringify({workbookPath:workbook}));
const doctorRows='Date,Time,Patient,Doctor,Type,Status\n11/01/2026,10:00 AM,X,Dr,VDE Doctor-Tech,Confirmed\n11/02/2026,11:00 AM,Y,Dr,EP 99213,Cancelled\n11/03/2026,11:00 AM,Z,Dr,Office Follow-Up,Cancelled\n11/08/2026,10:00 AM,N,Dr,Office VT,Confirmed\n';
const therapistRows='Date,Time,Patient,Doctor,Type,Status\n11/04/2026,10:00 AM,J,VT,Office VT,Confirmed\n11/05/2026,11:00 AM,K,VT,Virtual VT,Confirmed\n11/06/2026,11:00 AM,L,VT,Virtual Orientation,Confirmed\n11/07/2026,11:00 AM,M,VT,Home Maintenance,Confirmed\n11/09/2026,10:00 AM,P,VT,VDE Doctor-Tech,Confirmed\n11/10/2026,11:00 AM,Q,VT,VIP Doctor-Tech,Confirmed\n11/11/2026,10:00 AM,R,VT,Paperwork,Confirmed\n11/12/2026,10:00 AM,S,VT,Hold My Spot,Confirmed\n';
const fDr=path.join(temp,'doctors.csv'),fVt=path.join(temp,'therapists.csv');fs.writeFileSync(fDr,doctorRows);fs.writeFileSync(fVt,therapistRows);
let saved=null;
const xlsx={
 inspect:async(_file,month)=>({months:saved?[{month:'2026-11',values:saved,row:4}]:[],latest:saved?'2026-11':'2026-06',exists:!!saved&&month==='2026-11',row:4,existing:saved||{}}),
 write:async(_file,month,updates)=>{saved={...updates};fs.writeFileSync(workbook,'MONTHLY-v2');return {row:4,rowAction:'append-month'};},
 requireFile:()=>{}
};
const old=Module._load;
Module._load=function(request,parent){if(request==='./monthly-excel'&&parent?.filename?.endsWith('monthly-backend.js'))return xlsx;return old.apply(this,arguments);};
let register;try{register=require('../src/monthly-backend');}finally{Module._load=old;}
const handlers=new Map();let selection=fDr;
register({ipcMain:{handle:(key,handler)=>handlers.set(key,handler)},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selection]})},mainWindow:()=>null,dataDir:()=>temp,queueWrite:async f=>f()});
const call=(key,...args)=>handlers.get(key)({},...args);
(async()=>{
 let d=await call('monthly:import','2026-11','doctors');assert.equal(d.counts['EP 99213'].canceled,1);
 selection=fVt;let t=await call('monthly:import','2026-11','therapists');assert.equal(t.counts['Virtual VT'].valid,1);assert.equal(t.counts['VDE Doctor-Tech'],undefined);assert.equal(t.counts['VIP Doctor-Tech'],undefined);assert.equal(d.counts['Office VT'],undefined);
 const payload={month:'2026-11',mode:'split',sources:{doctors:d,therapists:t},manual:{B:19,C:0,H:157},comments:'Closed on holiday',commentsEdited:true};
 await call('monthly:save',payload);
 const loaded=await call('monthly:load','2026-11');assert.equal(loaded.draft.sources.therapists.counts['Office VT'].valid,1);
 assert(!fs.readFileSync(path.join(temp,'monthly-reports','drafts.json'),'utf8').includes('X,Dr'),'no patient-level details saved');
 const preview=await call('monthly:preview',payload);assert.equal(preview.updates.D,1);assert.equal(preview.updates.I,2);assert.equal(preview.updates.G,1);assert.equal(preview.updates.J,1);assert.equal(preview.updates.K,1);assert.equal(preview.updates.L,1);assert.equal(preview.updates.H,157);
 const r=await call('monthly:write',payload,preview.fileHash);assert.equal(r.row,4);assert(fs.existsSync(r.backup));
 const after=await call('monthly:list');assert.equal(after.months[0].month,'2026-11');assert.equal(after.months[0].values.I,2);
 await assert.rejects(()=>call('monthly:write',payload,preview.fileHash),/modified/);
 const bad=await call('monthly:load','2026-11');assert.equal(bad.inExcel,true);
 assert.equal(core.updates(core.sanitize(payload)).M,'Closed on holiday');
 console.log('Monthly IPC, CSV fields, Excel save preview, backups, data privacy, history and stale Excel protection: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
