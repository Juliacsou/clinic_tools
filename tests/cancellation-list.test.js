'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('../src/cancellation-list');
const empty = {_state: 'Follow-up'};
assert.equal(helpers.attempts(empty), 0);
assert.equal(helpers.displayStatus(empty), 'Awaiting 1st contact');
assert.equal(helpers.lastContact(empty), '');
for (const [n, status] of [[1, 'Awaiting 2nd contact'], [2, 'Awaiting 3rd contact'], [3, 'Awaiting 3rd contact']]) {
  const r = {_state: 'Follow-up'};
  for (let i = 1; i <= n; i++) r[`attempt${i}At`] = `2026-10-0${i}T15:00`;
  assert.equal(helpers.attempts(r), n);
  assert.equal(helpers.displayStatus(r), status);
  assert.equal(helpers.lastContact(r), `2026-10-0${n}T15:00`);
}
assert.equal(helpers.lastContact({lastFollowUpDate:'2026-09-30'}), '2026-09-30');
assert.equal(helpers.lastContact({attempt1At:'2026-10-05T15:00',lastFollowUpDate:'2026-09-30'}), '2026-10-05T15:00');
assert.equal(helpers.attempts({attempt1At:'  ',attempt2At:'2026-10-05T15:00'}), 1);
for (const state of helpers.CLOSED) {
  assert.equal(helpers.displayStatus({_state:state}),state);
  assert.equal(helpers.displayStatus({_state:state, attempt1At:'2026-10-02T15:00'}),state);
}
const ui = fs.readFileSync(path.join(__dirname, '../src/ux-pages2.js'),'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'),'utf8');
assert.ok(html.indexOf('src="cancellation-list.js"') < html.indexOf('src="ux-pages2.js"'));
const start = ui.indexOf('async function renderCancellationLanding()');
const end = ui.indexOf('/* "Dr. Name @ Office"',start);
const list = ui.slice(start,end);
assert.ok(list.includes('key: \'attempts\''));
assert.ok(list.includes('class="dots"'));
assert.ok(list.includes('label: \'Last follow-up\''));
assert.ok(list.includes('daysSince(date)'));
assert.ok(list.includes('CancellationList.displayStatus(r)'));
assert.ok(list.includes('No contact yet'));
assert.ok(!list.includes("label: 'Cancelled or no-show'"));
assert.ok(!list.includes('eventType'));
assert.ok(!list.includes('CANCELLATION_STATUSES'));
assert.ok(list.includes("test: (r, value) => CancellationList.displayStatus(r) === value"));
// Confirm the data-entry form still retains event type and previous migration wiring.
assert.ok(fs.readFileSync(path.join(__dirname, '../src/renderer.js'),'utf8').includes('name="eventType"'));
console.log('Exam Cancelations v2.24.1 table (statuses, dots, recency, filters): PASS');
