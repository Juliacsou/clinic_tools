'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'), fsp=fs.promises, os=require('os'), path=require('path');
const {manager}=require('../src/data-directory');
(async()=>{
 const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'clinic-data-test-'));
 try{
  const old=path.join(temp,'old','data'),newRoot=path.join(temp,'other','data'),pref=path.join(temp,'settings');
  await fsp.mkdir(path.join(old,'weekly-reports'),{recursive:true});
  await fsp.mkdir(newRoot,{recursive:true});
  await fsp.mkdir(pref,{recursive:true});
  await fsp.writeFile(path.join(old,'Referral_Follow_Up.xlsx'),'UNCHANGED SOURCE');
  await fsp.writeFile(path.join(old,'weekly-reports','Weekly Reports.xls'),'WEEKLY ORIGINAL');
  await fsp.writeFile(path.join(old,'weekly-reports','settings.json'),JSON.stringify({workbookPath:path.join(old,'weekly-reports','Weekly Reports.xls')}));
  const app={getPath:key=>{assert.equal(key,'userData');return pref;}};
  const manager1=manager(app,()=>old);
  assert.equal(manager1.initialise(),old);
  const metadata=await manager1.describe(newRoot);assert.equal(metadata.kind,'empty');
  await assert.rejects(()=>manager1.describe(path.join(old,'weekly-reports')),/separate/);
  const result=await manager1.switchTo(newRoot,'copy');
  assert.equal(result.previous,old);assert.equal(manager1.current(),newRoot);
  assert.equal(await fsp.readFile(path.join(newRoot,'Referral_Follow_Up.xlsx'),'utf8'),'UNCHANGED SOURCE');
  assert.equal(await fsp.readFile(path.join(old,'Referral_Follow_Up.xlsx'),'utf8'),'UNCHANGED SOURCE');
  const rebased=JSON.parse(await fsp.readFile(path.join(newRoot,'weekly-reports','settings.json'),'utf8'));
  assert.equal(rebased.workbookPath,path.join(newRoot,'weekly-reports','Weekly Reports.xls'));
  assert.equal(manager(app,()=>path.join(temp,'another-source','data')).initialise(),newRoot,'folder survives portable executable location changes');
  const unrelated=path.join(temp,'other2');await fsp.mkdir(unrelated);await fsp.writeFile(path.join(unrelated,'notes.txt'),'do not touch');
  await assert.rejects(()=>manager1.describe(unrelated),/unrelated files/);
  assert.equal(await fsp.readFile(path.join(unrelated,'notes.txt'),'utf8'),'do not touch');
  console.log('Custom data folder: copy, original preservation, path rebasing, restart persistence and conflict blocking: PASS');
 }finally{await fsp.rm(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
