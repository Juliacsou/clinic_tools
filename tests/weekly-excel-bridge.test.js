'use strict';
const assert=require('node:assert/strict');
const Module=require('module');
const load=Module._load;
// Only JSON decoding is exercised; no ExcelJS or Windows/COM is needed.
Module._load=function(request,parent,isMain){
 if(request==='exceljs' && parent?.filename.endsWith('weekly-excel.js'))return {};
 return load.apply(this,arguments);
};
let parse;
try {parse=require('../src/weekly-excel').parseLegacyResponse;}
finally {Module._load=load;}
const data={ok:true,weeks:[{date:'2026-10-16',row:42}],latestDate:'2026-10-16',row:42,exists:true,existing:{}};
const json=JSON.stringify(data);
assert.deepEqual(parse(json),data,'standard PowerShell JSON');
assert.deepEqual(parse(' \ufeff'+json+'\r\n'),data,'BOM and whitespace');
assert.deepEqual(parse(JSON.stringify(json)),data,'JSON-encoded JSON response');
assert.deepEqual(parse('"'+json+'"'),data,'unexpected wrapping quotes from Windows bridge');
assert.deepEqual(parse('{"ok":false,"error":"Workbook inaccessible"}'),{ok:false,error:'Workbook inaccessible'});
for(const sample of ['{bad JSON','"{bad JSON"','<html>Error</html>','"'+json.slice(0,-1)+'"']){
 assert.throws(()=>parse(sample),/unreadable response/,'reject unexpected formats');
}
console.log('Legacy .xls bridge JSON decoding and regression cases: PASS');
// Regression for portable Electron: PowerShell must execute a real .ps1 file on
// disk, never a virtual path inside app.asar.
const fs=require('fs');
const path=require('path');
const os=require('os');
const excel=require('../src/weekly-excel');
const pkg=require('../package.json');
assert(pkg.build.extraResources.some(x=>x.from==='src/weekly-legacy-excel.ps1' && x.to==='weekly/weekly-legacy-excel.ps1'), 'portable build must explicitly include PowerShell bridge');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-stage-regression-'));
 try{
  const staged=await excel.stageLegacyScript(tmp);
  assert.equal(staged,path.join(tmp,'legacy-excel.ps1'));
  assert.equal(fs.existsSync(staged),true,'PowerShell -File path must exist');
  assert.equal(fs.readFileSync(staged,'utf8'),fs.readFileSync(path.join(__dirname,'../src/weekly-legacy-excel.ps1'),'utf8'),'staging preserves original script exactly');
  assert.equal(excel.locateLegacyScript().file.endsWith('.ps1'),true);
  console.log('Legacy Excel portable script staging: PASS');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
