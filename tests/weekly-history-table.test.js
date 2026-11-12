'use strict';
const assert=require('node:assert/strict');
const {combine}=require('../src/weekly-history');
const source=(slotId,counts)=>({slotId,rows:1,counts,dates:{min:'2026-10-30',max:'2026-10-30'}});
const ct=n=>({total:n,canceled:0,missed:0,valid:n});
const workbook=[
 {weekEnding:'2026-10-29',row:13,values:{B:90,C:40,D:12,E:3,G:8,H:5,I:2,J:1,M:50,N:4,K:3,L:0},notes:'Saved note'},
 {weekEnding:'2026-10-22',row:12,values:{B:80,G:5,M:30},notes:'Older week'}
];
const drafts={
 '2026-10-29':{savedAt:'2026-10-30T14:00:00Z',exportedAt:'2026-10-29T15:00:00Z',sources:{
 weekly:{counts:{'Office VT':ct(10),'Virtual VT':ct(5),'Virtual Orientation':ct(13)}},
 ahead:{periodMode:'annual',files:[source('ahead-doctors',{}),source('ahead-therapists',{})],counts:{'VDE Doctor-Tech':ct(2),'Patient Consultation':ct(7),'Virtual Orientation':ct(9)}}
 },manual:{K:6},overrides:{N:2},comments:'Latest pending note',commentsEdited:true},
 '2026-11-05':{savedAt:'2026-11-06T11:00:00Z',sources:{weekly:{counts:{'Office VT':ct(4),'Virtual VT':ct(2),'Virtual Orientation':ct(5)}}},manual:{L:0}}
};
const rows=combine(drafts,workbook);
assert.deepEqual(rows.map(r=>r.weekEnding),['2026-11-05','2026-10-29','2026-10-22']);
assert.equal(rows[0].inExcel,false);
assert.equal(rows[0].values.M,6,'VT Sessions excludes Virtual Orientation');
assert.equal(rows[0].values.J,5);
assert.equal(rows[0].values.B,null);
assert.equal(rows[0].values.L,0,'Manual zero must be shown');
assert.equal(rows[1].values.B,2,'Pending annual Ahead replaces Excel value');
assert.equal(rows[1].values.D,7);assert.equal(rows[1].values.E,9);
assert.equal(rows[1].values.M,15);assert.equal(rows[1].values.N,2);
assert.equal(rows[1].values.K,6);assert.equal(rows[1].notes,'Latest pending note');
assert.equal(rows[2].values.B,80);assert.equal(rows[2].notes,'Older week');
const finalized=combine({'2026-10-29':{...drafts['2026-10-29'],exportedAt:'2026-10-31T00:00:00Z'}},workbook);
assert.equal(finalized[0].values.B,90,'Saved Excel values take priority for exported drafts');
const old=combine({'2026-11-12':{sources:{ahead:{periodMode:'legacy',counts:{'VDE Doctor-Tech':ct(999)}}}}},[]);
assert.equal(old[0].values.B,null,'Legacy 4-week Ahead never populates annual table');
console.log('All Weeks: saved Excel figures, pending draft overlay, protected annual semantics and zero values: PASS');
