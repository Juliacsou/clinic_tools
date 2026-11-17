'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('../src/v224-workflows');

// 1. Workflow state transitions
console.log('Testing cancellationState transitions...');

// Scenario 1: Initial state without contact
assert.equal(flow.cancellationState({}), 'Follow-up');

// Scenario 2: 3 attempts without manual override -> No Answer After 3 Attempts
const threeAttempts = {
  attempt1At: '2026-10-01T10:00',
  attempt2At: '2026-10-02T10:00',
  attempt3At: '2026-10-03T10:00'
};
assert.equal(flow.cancellationState(threeAttempts), 'No Answer After 3 Attempts');

// Scenario 3: Patient calls back after 3 attempts and schedules -> Rescheduled
assert.equal(flow.cancellationState({ ...threeAttempts, followUpStatus: 'Rescheduled', rescheduled: 'YES' }), 'Rescheduled');

// Scenario 4: Patient calls back after 3 attempts and says they will not reschedule -> Will Not Reschedule
assert.equal(flow.cancellationState({ ...threeAttempts, followUpStatus: 'Will Not Reschedule', rescheduled: 'NO' }), 'Will Not Reschedule');

// Scenario 5: User returns patient to Follow-up after 3 attempts -> Follow-up
assert.equal(flow.cancellationState({ ...threeAttempts, followUpStatus: 'Follow-up', rescheduled: 'NO' }), 'Follow-up');
assert.equal(flow.cancellationState({ ...threeAttempts, followUpStatus: 'needs follow-up', rescheduled: 'NO' }), 'Follow-up');

// Scenario 6: Patient said Will Not Reschedule, then later calls to Reschedule
const willNot = { followUpStatus: 'Will Not Reschedule', closureReason: 'Will Not Reschedule', rescheduled: 'NO' };
assert.equal(flow.cancellationState(willNot), 'Will Not Reschedule');
const changedToRescheduled = { ...willNot, followUpStatus: 'Rescheduled', rescheduled: 'YES', closureReason: 'Rescheduled' };
assert.equal(flow.cancellationState(changedToRescheduled), 'Rescheduled');

// Scenario 7: Patient was Rescheduled, then cancels/declines -> Will Not Reschedule
const rescheduled = { followUpStatus: 'Rescheduled', closureReason: 'Rescheduled', rescheduled: 'YES' };
assert.equal(flow.cancellationState(rescheduled), 'Rescheduled');
const changedToWillNot = { ...rescheduled, followUpStatus: 'Will Not Reschedule', rescheduled: 'NO', closureReason: 'Will Not Reschedule' };
assert.equal(flow.cancellationState(changedToWillNot), 'Will Not Reschedule');

// Scenario 8: Patient was Rescheduled or Will Not Reschedule, then returned to Follow-up
const returnedToFollowup = { ...rescheduled, followUpStatus: 'Follow-up', rescheduled: 'NO', closureReason: '' };
assert.equal(flow.cancellationState(returnedToFollowup), 'Follow-up');

// 2. Static source code checks
console.log('Testing source code wiring...');
const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const ux2Src = fs.readFileSync(path.join(__dirname, '../src/ux-pages2.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');

// main.js checks
assert.ok(mainSrc.includes("merged.followUpStatus = 'Rescheduled'"));
assert.ok(mainSrc.includes("merged.followUpStatus = 'Will Not Reschedule'"));
assert.ok(mainSrc.includes("merged.followUpStatus = 'Follow-up'"));
assert.ok(mainSrc.includes("merged.followUpStatus = 'No Answer After 3 Attempts'"));

// ux-pages2.js checks
assert.ok(ux2Src.includes('quickRescheduleBtn'), 'ux-pages2 must have quickRescheduleBtn');
assert.ok(ux2Src.includes('quickWillNotBtn'), 'ux-pages2 must have quickWillNotBtn');
assert.ok(ux2Src.includes('quickReturnFollowBtn'), 'ux-pages2 must have quickReturnFollowBtn');
assert.ok(ux2Src.includes('toggleEditHistoryBtn'), 'ux-pages2 must have toggleEditHistoryBtn');
assert.ok(ux2Src.includes('editContactHistoryForm'), 'ux-pages2 must have editContactHistoryForm');
assert.ok(ux2Src.includes('cancelCloseForm'), 'ux-pages2 must retain cancelCloseForm id');
assert.ok(ux2Src.includes('cancelClosureReason'), 'ux-pages2 must retain cancelClosureReason id');
assert.ok(ux2Src.includes('btn-clear-attempt'), 'ux-pages2 must have clear attempt buttons');

// renderer.js checks
assert.ok(rendererSrc.includes('reopenCancellationFollowup'), 'renderer.js must have return to follow-up');
assert.ok(rendererSrc.includes('toggleEditHistoryStandalone'), 'renderer.js must have edit history button');

console.log('Manual status change and contact history editing tests: PASS');
