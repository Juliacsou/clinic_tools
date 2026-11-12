'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dates = require('../src/us-dates.js');
// Load the browser-oriented UMD in a sandbox, and verify using the same date library the app uses.
const context = { ClinicDates: dates };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/waitlist-rules.js'), 'utf8'), context);
const rules = context.WaitlistRules;
assert.deepEqual(Array.from(rules.DOCTORS), ['Dr Jenna', 'Dr Chi', 'Either']);
for (const [value, expected] of [
  ['Dr Jenna', 'Dr Jenna'], ['Dr. Jenna', 'Dr Jenna'], ['DR JENNA', 'Dr Jenna'],
  ['Dr Chi', 'Dr Chi'], ['Dr. Chi', 'Dr Chi'], ['Either', 'Either'],
  ['Dr. Jenna ONLY', 'Either'], ['Any provider', 'Either'], ['', 'Either'], [null, 'Either']
]) assert.equal(rules.doctorGroup(value), expected, `Doctor: ${value}`);
for (const [section, field] of Object.entries({testings:'dateScheduled',pcs:'pcDate',followup:'dateScheduled',annuals:'dateScheduled'}))
  assert.equal(rules.scheduledField(section), field);
const today = '2026-10-21';
for (const [date, expected] of [
  ['10/20/2026', true], ['2026-10-20', true], ['02/10/2026', true],
  ['10/21/2026', false], ['2026-10-21', false], ['10/22/2026', false],
  ['', false], ['NONE', false], ['09/08 & 09/10', false], ['02/30/2026', false]
]) assert.equal(rules.isPastDate(date, today), expected, `Overdue: ${date}`);
const ux = fs.readFileSync(path.join(__dirname, '../src/ux-pages2.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
assert.ok(html.indexOf('waitlist-rules.js') < html.indexOf('renderer.js'));
assert.match(ux, /key === 'date' \? 'Date Added'/);
assert.match(ux, /section === 'followup' && key === 'type'/);
assert.match(ux, /WaitlistRules\.isPastDate\(r\[key\]\)/);
assert.match(ux, /WaitlistRules\.doctorGroup\(r\.doctor\) === v/);
assert.match(ux, /doctorInput\.dataset\.changed !== 'yes'/);
assert.match(renderer, /<select name="\$\{key\}" data-wl-doctor>/);
console.log('Waitlist rules and UI wiring: OK');
