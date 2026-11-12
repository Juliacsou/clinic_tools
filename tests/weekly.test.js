'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {parseCsv,periods,computeMetrics,csvRows}=require('../src/weekly-core');
const example='Date,Time,Patient,Doctor,Type,Status,Next Appt.,Email,Notes,Location,Invoice\r\n'
 + '10/19/2026,9:00 AM,"Example, Ada",Doctor A,VDE Doctor-Tech,Signed Out,,,,Primary,\r\n'
 + '10/19/2026,10:00 AM,"Example, Ada",Doctor A,VDE Doctor-Tech,Canceled,,,,Primary,\r\n'
 + '10/20/2026,9:00 AM,Example,Doctor A,VIP Doctor-Tech,Missed,,,,Primary,\r\n'
 + '10/20/2026,10:00 AM,Example,Doctor A,NP 99203,Confirmed,,,,Primary,\r\n'
 + '10/21/2026,11:00 AM,Example,Doctor A,Virtual Orientation,Unconfirmed,,,,Primary,\r\n'
 + '10/22/2026,12:00 PM,Example,Doctor A,Office VT,Canceled,,,,Primary,\r\n'
 + '10/22/2026,1:00 PM,Example,Doctor A,Virtual VT,Confirmed,,,,Primary,\r\n'
 + '10/23/2026,9:00 AM,Example,Doctor A,Home Maintenance,Signed Out,,,"note line 1\nline 2",Primary,\r\n';
const p=periods('2026-10-23');
assert.deepEqual(p,{weekly:{start:'2026-10-19',end:'2026-10-23'},ahead:{start:'2026-10-24',end:'2027-10-23'}});
assert.deepEqual(periods('2026-10-22'),{weekly:{start:'2026-10-19',end:'2026-10-22'},ahead:{start:'2026-10-23',end:'2027-10-22'}});
assert.equal(csvRows(example).length,9);
const parsed=parseCsv(example,p.weekly);
assert.equal(parsed.rows,8);assert.equal(parsed.canceled,2);assert.equal(parsed.missed,1);
assert.equal(parsed.counts['VDE Doctor-Tech'].valid,1);
assert.equal(parsed.counts['Virtual Orientation'].valid,1);
assert.equal(parsed.counts['Virtual VT'].valid,1);
assert.equal(parsed.counts['Office VT'].valid,0);
const m1=computeMetrics({weekly:parsed});
assert.equal(m1.G.value,2);assert.equal(m1.H.value,1);assert.equal(m1.M.value,1);assert.equal(m1.N.value,1);
assert.equal(computeMetrics({weekly:parsed},'Virtual VT').M.value,1);
assert.throws(()=>parseCsv(example,{start:'2026-10-24',end:'2027-10-23'}),/outside/);
assert.throws(()=>parseCsv('Date,Type,Status\n13\/12\/2026,Office VT,Confirmed',{start:'2026-12-01',end:'2026-12-31'}),/Invalid appointment dates/);
assert.throws(()=>parseCsv('Date,Type\n10\/23\/2026,Office VT',p.weekly),/status/);
// EP 99213 is identified for auditing but excluded from Ocular Motor and Perception Tests.
const epFixture='Date,Type,Status\n'
 + '10/19/2026,EP 99213,Confirmed\n'
 + '10/19/2026,EP99213,Canceled\n'
 + '10/20/2026,EP99213,Missed\n'
 + '10/20/2026,NP 99203,Signed Out\n'
 + '10/21/2026,VIP Doctor-Tech,Unconfirmed\n';
const ep=parseCsv(epFixture,p.weekly);
assert.equal(ep.counts['EP 99213'].total,3);
assert.equal(ep.counts['EP 99213'].canceled,1);
assert.equal(ep.counts['EP 99213'].missed,1);
assert.equal(ep.counts['EP 99213'].valid,1);
assert.equal(computeMetrics({weekly:ep}).G.value,2);
assert.equal(computeMetrics({weekly:ep}).H.value,1,'EP and NP must not be counted as perception tests');
const aheadEp=parseCsv('Date,Type,Status\n10/26/2026,EP 99213,Unconfirmed\n10/27/2026,EP99213,Canceled\n',p.ahead);
assert.equal(computeMetrics({ahead:aheadEp}).B.value,0);
assert.equal(computeMetrics({ahead:aheadEp}).C.value,0);
const csv=process.env.CRYSTAL_TEST_CSV;
if(csv && fs.existsSync(csv)){
 const real=parseCsv(fs.readFileSync(csv,'utf8'),{start:'2026-10-12',end:'2026-10-16'});
 assert.equal(real.rows,393);assert.equal(real.canceled,56);assert.equal(real.missed,3);
 assert.equal(real.counts['Office VT'].valid,124);assert.equal(real.counts['Virtual VT'].valid,14);
 assert.equal(real.counts['Home Maintenance'].valid,5);
 assert.equal(real.counts['VDE Doctor-Tech'].valid,6);
 const calculated=computeMetrics({weekly:real},'Virtual VT');
 assert.equal(calculated.M.value,138);assert.equal(calculated.N.value,5);assert.equal(calculated.I.value,12);
 assert.equal(computeMetrics({weekly:real}).M.value,138); // Office VT + Virtual VT, never Virtual Orientation
 console.log('Crystal PM full CSV regression: PASS');
}
console.log('Weekly CSV parser, periods, exclusions, categorization and metrics: PASS');
