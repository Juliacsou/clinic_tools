const assert = require('node:assert/strict');
const d = require('../src/us-dates');
assert.equal(d.toISODate('11/02/2026'),'2026-11-02');
assert.equal(d.toISODate('02/10/2026'),'2026-02-10');
assert.equal(d.toISODate('2026-11-10'),'2026-11-10');
assert.equal(d.toISODate('2026-10-21T10:00:00Z'),'2026-10-21');
assert.equal(d.toUSDate('2026-02-10'),'02/10/2026');
assert.equal(d.toUSDate('2/1/2026'),'02/01/2026');
for(const s of ['02/30/2026','13/01/2026','31/01/2026','2026-11-31','2026-00-01','01-02-2026']) assert.equal(d.toISODate(s),null,s);
const scrambled=['11/02/2026','2026-11-10','02/10/2026','09/16/2026','10/04/2026','10/05/2026'];
assert.deepEqual(scrambled.sort((a,b)=>d.sortKey(a).localeCompare(d.sortKey(b))),[
 '02/10/2026','09/16/2026','10/04/2026','10/05/2026','11/02/2026','2026-11-10'
]);
assert.ok(d.sortKey('NONE') > d.sortKey('10/21/2026'));
console.log('US date parsing, formatting and chronological sorting passed');
