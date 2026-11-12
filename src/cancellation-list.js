/* Pure display helpers for the active Exam Cancelations list.
   These do not update the Excel schema or stored records. */
(function (scope, factory) {
  const helpers = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (scope) scope.ClinicCancellationList = helpers;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const CLOSED = ['Rescheduled', 'Will Not Reschedule', 'No Answer After 3 Attempts'];
  function attempts(record) {
    return [1, 2, 3].reduce((total, n) => total + (String(record['attempt' + n + 'At'] ?? '').trim() ? 1 : 0), 0);
  }
  function displayStatus(record) {
    if (CLOSED.includes(record._state)) return record._state;
    return ['Awaiting 1st contact', 'Awaiting 2nd contact', 'Awaiting 3rd contact'][Math.min(attempts(record), 2)];
  }
  function lastContact(record) {
    for (const n of [3, 2, 1]) {
      const date = String(record['attempt' + n + 'At'] ?? '').trim();
      if (date) return date;
    }
    return String(record.lastFollowUpDate ?? '').trim();
  }
  return { attempts, displayStatus, lastContact, CLOSED };
});
