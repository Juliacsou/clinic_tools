/* Waitlist presentation rules. These never modify stored workbook values. */
(function (root, factory) {
  const api = factory(root && root.ClinicDates);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WaitlistRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (dates) {
  'use strict';
  const DOCTORS = Object.freeze(['Dr Jenna', 'Dr Chi', 'Either']);
  function doctorGroup(value) {
    const name = String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
    if (/^dr\.? jenna$/.test(name)) return 'Dr Jenna';
    if (/^dr\.? chi$/.test(name)) return 'Dr Chi';
    return 'Either';
  }
  function scheduledField(section) { return section === 'pcs' ? 'pcDate' : 'dateScheduled'; }
  function isPastDate(value, today) {
    const parse = dates && dates.toISODate;
    if (!parse) return false;
    const target = parse(value);
    if (!target) return false; // Blank, "NONE", and free-text date ranges are not overdue dates.
    const comparison = parse(today || new Date());
    return !!comparison && target < comparison;
  }
  return Object.freeze({ DOCTORS, doctorGroup, scheduledField, isPastDate });
});
