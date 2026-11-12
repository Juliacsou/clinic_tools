'use strict';
const assert=require('node:assert/strict');
const Module=require('module');
const original=Module._load;
Module._load=function(req,parent){if(req==='exceljs'&&parent?.filename.endsWith('weekly-excel.js'))return {};return original.apply(this,arguments)};
let excel;
try{excel=require('../src/weekly-excel');}finally{Module._load=original;}
const {resolve,toLetter}=excel.layout;
const classic=[
 'WEEK ENDING','# new Ocular motor Booked Ahead',"# Percep Tests 'Booked Ahead",'# VT Consults Booked Ahead',
 'Total # new patients for  OM & Percep ','VT Pts Scheduled to Start','# of new inquiries','# Ocular Motor Exams Done',
 'Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients',
 '# VT Sessions','# VT closing','Totals Charges','Total Income','Comments'
];
const compact=[
 'WEEK ENDING','autofill # new Ocular motor Booked Ahead',"autofill # Percep Tests 'Booked Ahead",'autofill # VT Consults Booked Ahead',
 ' autofill VT Pts Scheduled to Start','# of new inquiries','autofill # Ocular Motor Exams Done','autofill Percept Test Done',
 'autofill # VT Consults Done','autofill # New VT Starts','Total # VT Pts Enrolled','#Discontinued Patients',
 ' autofill # VT Sessions','autofill # VT closing','autofill Totals Charges','Total Income','Comments'
];
const a=resolve(classic),b=resolve(compact);
assert.equal(a.layout,'classic');assert.equal(b.layout,'compact');
const expectedClassic={B:'B',C:'C',D:'D',E:'F',F:'G',G:'H',H:'I',I:'J',J:'K',K:'L',L:'M',M:'N',N:'O',O:'P',P:'Q',Q:'R'};
const expectedCompact={B:'B',C:'C',D:'D',E:'E',F:'F',G:'G',H:'H',I:'I',J:'J',K:'K',L:'L',M:'M',N:'N',O:'O',P:'P',Q:'Q'};
assert.deepEqual(a.map,expectedClassic);
assert.deepEqual(b.map,expectedCompact);
const updates={B:14,E:4,G:12,M:110,N:8,Q:'A note'};
const rawHeaders=Object.fromEntries(classic.map((h,i)=>[toLetter(i+1),h]));
const {physical,allowed}=excel.makePhysicalUpdates(updates,a.map,rawHeaders);
assert.deepEqual(physical,{B:14,F:4,H:12,N:110,O:8,R:'A note'});
assert.equal(allowed.O,'# VT closing');
for(const forbidden of ['E','G','P','Q'])assert.equal(Object.hasOwn(physical,forbidden),false,`${forbidden} belongs to a different indicator or is protected in classic layout`);
assert.deepEqual(excel.makePhysicalUpdates({F:10},a.map,rawHeaders).physical,{G:10});
for(const bad of [{O:100},{P:20}])assert.throws(()=>excel.makePhysicalUpdates(bad,a.map,rawHeaders),/Protected/);
const changed=classic.slice();changed[14]='VT Sessions';assert.throws(()=>resolve(changed),/Missing required Weekly headings|Ambiguous/);
const duplicate=classic.concat(['# VT Sessions']);assert.throws(()=>resolve(duplicate),/Ambiguous headings/);
const badDate=classic.slice();badDate[0]='Report Date';assert.throws(()=>resolve(badDate),/Week Ending/);
console.log('Two source workbook layouts: 14 editable mappings + 2 protected mappings + 1 extra classic-only field: PASS');
