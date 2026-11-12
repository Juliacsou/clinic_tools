// Regression: the actual original .xls has formulas in E724:E739 despite blank dates.
'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),Module=require('module');
const original=Module._load;
Module._load=function(req,parent){if(req==='exceljs'&&parent?.filename.endsWith('weekly-excel.js'))return {Workbook:function(){}};return original.apply(this,arguments)};
let excel;try{excel=require('../src/weekly-excel')}finally{Module._load=original}
class Sheet{
 constructor(rowData){this.cells=rowData;this.columnCount=18;}
 getRow(n){return {
  getCell:c=>this.cells[n]?.[c]||{value:null},
  eachCell:(_opts,fn)=>{for(const [col,cell] of Object.entries(this.cells[n]||{}))if(cell.value!==null&&cell.value!==undefined)fn(cell,Number(col))}
 }}
}
const formula=v=>({value:{formula:v,result:0}});
const prior={5:formula('C723'),16:formula('(H723*130)+(I723*310)+(N723*157)')};
const future={5:formula('C724'),16:formula('(H724*130)+(I724*310)+(N724*157)')};
const target=new Set(['B','C','D','F','H','I','J','K','L','M','N','O','R']);
let plan=excel.classifyPreparedRow(new Sheet({723:prior,724:future}),724,723,target);
assert.equal(plan.safe,true,'pre-filled relative formulas in untouched fields are legitimate templates');
plan=excel.classifyPreparedRow(new Sheet({723:prior,724:{...future,18:{value:'Doctor note'}}}),724,723,target);
assert.equal(plan.action,'insert-before-existing-content','unknown independent data must be preserved by inserting a new row');
plan=excel.classifyPreparedRow(new Sheet({723:prior,724:{5:formula('C724'),14:formula('M724')}}),724,723,target);
assert.equal(plan.safe,false,'template formulas targeted for update may not be silently erased');
plan=excel.classifyPreparedRow(new Sheet({723:prior,724:{5:formula('C999')}}),724,723,target);
assert.equal(plan.safe,false,'unexpected future formulas must not be assumed safe');
plan=excel.classifyPreparedRow(new Sheet({723:prior,724:{}}),724,723,target);
assert.equal(plan.safe,true,'blank row can be filled');
assert.equal(excel.formulaPattern('C723+F$1',723),excel.formulaPattern('C724+F$1',724));
const powershell=fs.readFileSync(path.join(__dirname,'../src/weekly-legacy-excel.ps1'),'utf8');
for(const token of ['Test-PreparedWeekRow','FormulaR1C1','EntireRow.Insert()','CountA($remainder)','rowAction'])assert(powershell.includes(token),`COM writer missing ${token}`);
assert(!powershell.includes('The next Excel row contains other data. Nothing was modified.'));
assert(powershell.includes('ws.Columns.Count'), 'writer must respect actual Excel version column limit');
assert(!/Range\('AG'\s*\+\s*\$candidate\s*\+\s*':XFD'/.test(powershell), 'legacy BIFF8 must not reference XFD');
assert(powershell.includes("$phase = 'save workbook to disk'"), 'write errors must identify the failing Excel step');
console.log('Excel row policy: original future formulas preserved; unexpected data shifted instead of overwritten. PASS');
