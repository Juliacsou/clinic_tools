/* US date helpers. ISO YYYY-MM-DD is the internal exchange format; user-visible
   dates are MM/DD/YYYY. Never parse ambiguous dates using JS Date.parse(). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ClinicDates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function parts(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
    }
    const s = String(value == null ? '' : value).trim();
    let y, m, d;
    let match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (match) { y=+match[1]; m=+match[2]; d=+match[3]; }
    else {
      match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      m=+match[1]; d=+match[2]; y=+match[3];
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return [y,m,d];
  }
  const pad = n => String(n).padStart(2,'0');
  function toISODate(value) { const p=parts(value); return p ? `${p[0]}-${pad(p[1])}-${pad(p[2])}` : null; }
  function toUSDate(value) { const p=parts(value); return p ? `${pad(p[1])}/${pad(p[2])}/${p[0]}` : null; }
  function sortKey(value) { const s=String(value == null ? '' : value).trim(); if(!s)return ''; const iso=toISODate(s); return iso ? `0${iso}` : `1${s.toLowerCase()}`; }
  return Object.freeze({ toISODate, toUSDate, sortKey });
});
