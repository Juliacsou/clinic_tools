/* Initial Contact family intake: keep each child independent while sharing caller information. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.InitialFamily = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const sharedFields = Object.freeze(['date', 'parentName', 'phone', 'email', 'referralSource']);
  // Keep appointments, concerns, diagnoses and payment card details per patient.
  const privateCardFields = Object.freeze(['cardType','cardNumber','cardExpiration','cardholderName','cardZip','cardCode']);
  function makeSibling(source) {
    const entry = { scriptVariant: source.scriptVariant || 'standard' };
    for (const key of sharedFields) entry[key] = source[key] || '';
    return entry;
  }
  function syncShared(patients, source) {
    return patients.map(patient => {
      const result = { ...patient };
      for (const key of sharedFields) result[key] = source[key] || '';
      return result;
    });
  }
  function collectNames(patients) {
    if (!Array.isArray(patients) || patients.length < 1) throw new Error('Add at least one patient.');
    if (patients.length > 8) throw new Error('A family can have at most eight patients in one intake.');
    const keys = new Set();
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i] || {};
      const name = String(p.patientName || '').trim();
      if (!name) throw new Error(`Enter the name for patient ${i + 1}.`);
      const key = `${name.toLowerCase().replace(/\s+/g, ' ')}|${String(p.dob || '').trim()}`;
      if (keys.has(key)) throw new Error(`The patient ${name} was added more than once.`);
      keys.add(key);
    }
  }
  return { sharedFields, privateCardFields, makeSibling, syncShared, collectNames };
});
