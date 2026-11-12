'use strict';
const assert=require('node:assert/strict'),core=require('../src/monthly-core'),w=require('../src/weekly-core');
assert.deepEqual(core.period('2024-02'),{start:'2024-02-01',end:'2024-02-29'});
assert.deepEqual(core.period('2026-11'),{start:'2026-11-01',end:'2026-11-30'});
for(const invalid of ['2026-00','2026-13','2026-1','bad'])assert.throws(()=>core.period(invalid));
const head='Date,Time,Patient,Doctor,Type,Status\n';
const all=head+[
 '11/01/2026,10:00 AM,A,Dr,VDE Doctor-Tech,Confirmed',
 '11/01/2026,10:00 AM,B,Dr,NP 99203,Confirmed',
 '11/01/2026,10:00 AM,C,Dr,VIP Doctor Only,Missed',
 '11/01/2026,10:00 AM,D,Dr,Patient Consultation,Confirmed',
 '11/01/2026,10:00 AM,E,Dr,EP 99213,Cancelled',
 '11/01/2026,10:00 AM,F,Dr,EP 99213,Missed',
 '11/01/2026,10:00 AM,G,Dr,Office Follow-Up,Cancelled',
 '11/01/2026,10:00 AM,H,Dr,Office Follow Up,Canceled',
 '11/01/2026,10:00 AM,I,VT,Virtual Orientation,Confirmed',
 '11/01/2026,10:00 AM,J,VT,Office VT,Confirmed',
 '11/01/2026,10:00 AM,K,VT,Virtual VT,Confirmed',
 '11/01/2026,10:00 AM,L,VT,Virtual Orientation,Missed',
 '11/01/2026,10:00 AM,M,VT,Home Maintenance,Confirmed',
 '11/01/2026,10:00 AM,N,VT,Home Maintenance,Cancelled'
].join('\n')+'\n';
const parsed=w.parseCsv(all,core.period('2026-11'));
const source=core.fileSummary({...parsed,fileName:'all.csv'});
const monthly=core.sanitize({month:'2026-11',mode:'all',sources:{all:source},manual:{B:14,C:0,H:138},comments:'Clinic monthly report',commentsEdited:true});
const values=core.updates(monthly);
assert.deepEqual(Object.fromEntries(Object.entries(values).filter(([k])=>k!=='M')),{D:2,E:1,F:1,G:1,I:2,J:1,K:1,L:2,B:14,C:0,H:138});
assert.equal(values.M,'Clinic monthly report');
assert.equal(source.counts['Virtual Orientation'].valid,1);
assert.equal(source.counts['Home Maintenance'].valid,1);
assert.equal(source.counts['Office Follow-Up'].canceled,2);
assert.throws(()=>w.parseCsv(head+'12/01/2026,10:00 AM,A,Dr,EP 99213,Cancelled\n',core.period('2026-11')),/outside/);
assert.throws(()=>core.sanitize({month:'2026-11',manual:{B:-1}}),/Invalid/);
assert.throws(()=>core.sanitize({month:'2026-11',manual:{B:2.5}}),/Invalid/);
const drTypes=new Set(core.DOCTOR_ALLOWED),vtTypes=new Set(core.THERAPIST_ALLOWED);
const makeFile=(slot)=>core.fileSummary({...w.parseCsv(head+all.split('\n').slice(1).filter(line=>line&&slot.has(line.split(',')[4].replace('Office Follow Up','Office Follow-Up'))).join('\n')+'\n',core.period('2026-11')),fileName:'schedule.csv'});
const doctors=makeFile(drTypes),therapists=makeFile(vtTypes);
core.validateSlot(doctors,'doctors');core.validateSlot(therapists,'therapists');
assert.deepEqual(core.metrics({doctors,therapists}),core.metrics({all:source}));
assert.throws(()=>core.aggregate({all:source,doctors}),/either one/);
// An export may contain other appointment types from the same schedule.
// Ignore types that do not belong to the chosen Monthly CSV slot.
assert.doesNotThrow(()=>core.validateSlot(therapists,'doctors'));
assert.deepEqual(core.metrics({doctors,therapists:doctors}),{D:2,E:1,F:1,G:0,I:0,J:0,K:1,L:2});
const partial=core.metrics({doctors});assert.equal(partial.G,undefined);assert.equal(partial.D,2);
const blank=core.sanitize({month:'2026-11',mode:'split',manual:{H:20}});assert.equal(blank.mode,'split');assert.deepEqual(core.updates(blank),{H:20});
console.log('Monthly month boundaries, 13-column mappings, canceled-only metrics, VT sessions, source split, protected/manual fields: PASS');
