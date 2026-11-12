'use strict';
// Even if an Excel adapter returns success, a mismatching persisted value must
// prevent marking a Monthly draft as exported; the pre-write backup survives.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'monthly-verify-failure-'));
fs.mkdirSync(path.join(temp,'weekly-reports'));
const workbook=path.join(temp,'workbook.xlsx');fs.writeFileSync(workbook,'ORIGINAL');
fs.writeFileSync(path.join(temp,'weekly-reports','settings.json'),JSON.stringify({workbookPath:workbook}));
let hasWritten=false;
const fake={
 requireFile:()=>{},
 inspect:async(_file,month)=>hasWritten?{months:[],latest:'2026-12',exists:true,row:2,existing:{B:5}}:{months:[],latest:'2026-11',exists:false,row:2,existing:{}},
 write:async()=>{hasWritten=true;return {row:2,rowAction:'append-month'};}
};
const original=Module._load;Module._load=function(name,parent){if(name==='./monthly-excel'&&parent?.filename.endsWith('monthly-backend.js'))return fake;return original.apply(this,arguments);};
let register;try{register=require('../src/monthly-backend');}finally{Module._load=original;}
const handlers=new Map();register({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},mainWindow:()=>null,dataDir:()=>temp,queueWrite:fn=>fn()});
const call=(name,...args)=>handlers.get(name)({},...args);
(async()=>{
 const draft={month:'2026-12',manual:{B:57},sources:{},mode:'all'};
 await call('monthly:save',draft);
 const preview=await call('monthly:preview',draft);
 await assert.rejects(call('monthly:write',draft,preview.fileHash),/verification failed for Monthly cell B2/i);
 assert.equal(fs.readFileSync(workbook,'utf8'),'ORIGINAL');
 const saved=JSON.parse(fs.readFileSync(path.join(temp,'monthly-reports','drafts.json'),'utf8'))['2026-12'];
 assert.equal(saved.exportedAt,null,'Unverified workbook writes must never be marked as exported');
 const backupDir=path.join(temp,'monthly-reports','backups');
 const backups=fs.readdirSync(backupDir);assert.equal(backups.length,1);
 assert.equal(fs.readFileSync(path.join(backupDir,backups[0]),'utf8'),'ORIGINAL');
 console.log('Monthly write verification: readback mismatch blocks export, backup and pending draft preserved: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
