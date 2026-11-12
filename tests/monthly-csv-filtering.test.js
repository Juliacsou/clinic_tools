'use strict';
const assert=require('node:assert/strict');
const monthly=require('../src/monthly-core'),weekly=require('../src/weekly-core');
const header='Date,Time,Patient,Doctor,Type,Status\n';
const row=(date,type,status='Confirmed',who='VT')=>`${date},09:00 AM,TEST,${who},${type},${status}\n`;
const range=monthly.period('2026-10');
// Therapist schedule can contain doctor-tech visits and many unrelated types.
const therapists=weekly.parseCsv(header+
 row('10/01/2026','Office VT')+
 row('10/02/2026','Virtual VT')+
 row('10/03/2026','Virtual Orientation')+
 row('10/04/2026','Home Maintenance')+
 row('10/05/2026','VDE Doctor-Tech')+
 row('10/06/2026','VIP Doctor-Tech')+
 row('10/07/2026','VDE Tech')+
 row('10/08/2026','Paperwork')+
 row('10/09/2026','Hold My Spot')+
 row('10/10/2026','Administration')+
 row('10/11/2026','Office VT','Cancelled'),range);
const doctors=weekly.parseCsv(header+
 row('10/01/2026','VDE Doctor-Tech','Confirmed','Dr')+
 row('10/02/2026','VIP Doctor-Tech','Missed','Dr')+
 row('10/03/2026','NP 99203','Confirmed','Dr')+
 row('10/04/2026','Patient Consultation','Confirmed','Dr')+
 row('10/05/2026','EP 99213','Cancelled','Dr')+
 row('10/06/2026','Office Follow-Up','Cancelled','Dr')+
 row('10/06/2026','Office Follow-Up','Confirmed','Dr')+
 row('10/07/2026','Office VT','Confirmed','Dr'),range);
assert.doesNotThrow(()=>monthly.validateSlot(therapists,'therapists'));
assert.doesNotThrow(()=>monthly.validateSlot(doctors,'doctors'));
const doctorSummary=monthly.fileSummary({...doctors,rows:doctors.rows},'doctors');
const therapistSummary=monthly.fileSummary({...therapists,rows:therapists.rows},'therapists');
assert.equal(therapistSummary.counts['VDE Doctor-Tech'],undefined);
assert.equal(therapistSummary.counts['VIP Doctor-Tech'],undefined);
assert.equal(doctorSummary.counts['Office VT'],undefined);
const summary={month:'2026-10',mode:'split',sources:{doctors:doctorSummary,therapists:therapistSummary}};
assert.deepEqual(monthly.metrics(monthly.sanitize(summary).sources),{D:2,E:1,F:1,G:1,I:2,J:1,K:1,L:1});
// An older persisted summary with unrelated types must still be safely filtered.
assert.deepEqual(monthly.metrics({doctors,therapists}),{D:2,E:1,F:1,G:1,I:2,J:1,K:1,L:1});
// A whole month can have no tracked appointment types: valid CSV, zero metrics.
const other=weekly.parseCsv(header+row('10/13/2026','Paperwork')+row('10/14/2026','Hold My Spot'),range);
assert.doesNotThrow(()=>monthly.validateSlot(other,'therapists'));
assert.deepEqual(monthly.metrics({therapists:monthly.fileSummary(other,'therapists')}),{G:0,I:0,J:0});
// Bad file structure/dates must still fail, not silently produce zeros.
assert.throws(()=>weekly.parseCsv('bad,header\na,b\n',range),/required \"date\"/);
assert.throws(()=>weekly.parseCsv(header+row('11/01/2026','Office VT'),range),/outside/);
console.log('Monthly split CSV filtering: ignores unrelated appointments, prevents overlap, supports zero months, checks dates: PASS');
