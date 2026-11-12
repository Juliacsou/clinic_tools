'use strict';
const assert=require('node:assert/strict');
const weekly=require('../src/weekly-core');
const monthly=require('../src/monthly-core');
const csv=(rows)=>'Date,Time,Patient,Doctor,Type,Status\n'+rows.map((r,i)=>`11/${String(i+1).padStart(2,'0')}/2026,10:00 AM,TEST${i},Dr,${r[0]},${r[1]}`).join('\n')+'\n';
const period=monthly.period('2026-11');
const doctors=weekly.parseCsv(csv([
 ['Office Follow-Up','Cancelled'],
 ['Office Follow Up','Canceled'],
 ['office follow-up','Cancelled'],
 ['Office Follow-Up','Confirmed'],
 ['Office Follow-Up','Missed'],
 ['EP 99213','Cancelled'],
 ['EP 99213','Confirmed'],
 ['Paperwork','Cancelled']
]),period);
assert.equal(doctors.counts['Office Follow-Up'].total,5,'canonicalize real Crystal appointment type');
assert.equal(doctors.counts['Office Follow-Up'].canceled,3,'only cancelled Office Follow-Up counted');
assert.equal(doctors.counts['Office Follow-Up'].valid,1);
assert.equal(doctors.counts['Office Follow-Up'].missed,1);
const split=monthly.fileSummary({...doctors,fileName:'doctors.csv'},'doctors');
assert.deepEqual(monthly.metrics({doctors:split}),{D:0,E:0,F:0,K:1,L:3});
const therapists=weekly.parseCsv(csv([['Virtual Orientation','Confirmed'],['Office VT','Confirmed'],['Office Follow-Up','Cancelled']]),period);
const ts=monthly.fileSummary({...therapists,fileName:'therapists.csv'},'therapists');
assert.equal(ts.counts['Office Follow-Up'],undefined,'therapist CSV must not contribute doctor cancellations');
assert.deepEqual(monthly.metrics({doctors:split,therapists:ts}),{D:0,E:0,F:0,G:1,I:1,J:0,K:1,L:3});
const combined=weekly.parseCsv(csv([['Office Follow-Up','Cancelled'],['EP 99213','Cancelled'],['Virtual Orientation','Confirmed'],['Office VT','Confirmed']]),period);
assert.deepEqual(monthly.metrics({all:monthly.fileSummary({...combined,fileName:'all.csv'},'all')}),{D:0,E:0,F:0,G:1,I:1,J:0,K:1,L:1});
// Preserve the meaning of older v2.26.5 persisted monthly draft summaries.
const legacy={counts:{'Follow-Up':{total:2,valid:0,canceled:2,missed:0}},rows:2,fileName:'legacy.csv'};
assert.equal(monthly.metrics({doctors:monthly.fileSummary(legacy,'doctors')}).L,2);
assert.equal(monthly.METRICS.find(m=>m.col==='L').types[0],'Office Follow-Up');
console.log('Monthly Office Follow-Up (Crystal exact name, cancelled statuses, split/full and old draft): PASS');
