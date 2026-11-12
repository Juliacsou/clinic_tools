'use strict';
const assert=require('node:assert/strict'),Module=require('module');
const orig=Module._load;
Module._load=function(req,parent){if(req==='exceljs'&&parent?.filename.endsWith('weekly-excel.js'))return {};return orig.apply(this,arguments)};
let x;try{x=require('../src/weekly-excel')}finally{Module._load=orig;}
const classicMap=x.layout.resolve(['WEEK ENDING','# new Ocular motor Booked Ahead',"# Percep Tests 'Booked Ahead",'# VT Consults Booked Ahead','Total # new patients for OM & Percep','VT Pts Scheduled to Start','# of new inquiries','# Ocular Motor Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients','# VT Sessions','# VT closing','Totals Charges','Total Income','Comments']).map;
const compactMap=x.layout.resolve(['WEEK ENDING','autofill # new Ocular motor Booked Ahead',"autofill # Percep Tests 'Booked Ahead",'# VT Consults Booked Ahead','VT Pts Scheduled to Start','# of new inquiries','# Ocular Motor Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients','# VT Sessions','# VT closing','Totals Charges','Total Income','Comments']).map;
for(const map of [classicMap,compactMap]){
 const v={[map.B]:40,[map.G]:7,[map.H]:0,[map.M]:140,[map.N]:5,[map.O]:900000};
 const out=x.projectHistoryRow('2026-10-16',v,map);
 assert.equal(out.values.B,40);assert.equal(out.values.G,7);assert.equal(out.values.H,0);
 assert.equal(out.values.M,140);assert.equal(out.values.N,5);
 assert.equal(Object.hasOwn(out.values,'O'),false,'Never transfer protected charges into charts');
 assert.equal(out.values.C,null);
 const withNotes=x.projectHistoryRow('2026-10-16',v,map,'Clinic-wide note',725);
 assert.equal(withNotes.notes,'Clinic-wide note');assert.equal(withNotes.row,725);
 }
 assert.equal(x.numberOrNull({formula:'1+1',result:2}),2);
 assert.equal(x.numberOrNull({formula:'1+1'}),null);
 assert.equal(x.numberOrNull(''),null);
 console.log('Read-only chart mapping respects classic/compact headers, missing values, formulas and financial protection: PASS');
