const assert = require('node:assert/strict');
const Family = require('../src/initial-family');

const first = {
  date: '10/22/2026', patientName: 'Child One', age: '7', dob: '04/01/2019',
  parentName: 'Parent Example', phone: '555-0100', email: 'parent@example.test',
  referralSource: 'School', doctorNotes: 'Only child one', devExamDate: '11/03/2026',
  cardNumber: 'TEST ONLY', cardCode: 'TEST', grade: '2nd', scriptVariant: 'standard'
};
const sibling = Family.makeSibling(first);
for(const key of Family.sharedFields) assert.equal(sibling[key], first[key]);
for(const field of ['patientName','age','dob','grade','doctorNotes','devExamDate',...Family.privateCardFields])
  assert.equal(sibling[field], undefined, `${field} must stay specific to each patient`);
const all = Family.syncShared([first, {...sibling,patientName:'Child Two',age:'4',devExamDate:'12/01/2026'}],
  {...first, phone:'555-0111', parentName:'Updated Parent'});
assert.equal(all[0].phone,'555-0111');
assert.equal(all[1].phone,'555-0111');
assert.equal(all[0].patientName,'Child One');
assert.equal(all[1].patientName,'Child Two');
assert.equal(all[0].devExamDate,'11/03/2026');
assert.equal(all[1].devExamDate,'12/01/2026');
Family.collectNames(all);
assert.throws(()=>Family.collectNames([{patientName:'Kid'},{patientName:' kid '}]),/more than once/);
assert.throws(()=>Family.collectNames([{patientName:'A'},{}]),/patient 2/);
assert.throws(()=>Family.collectNames(Array.from({length:9},(_,i)=>({patientName:`Patient ${i}`}))),/eight/);
console.log('Family intake rules passed');
