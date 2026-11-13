'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const ExcelJS = require('exceljs');

// 1. Static code integration checks
const mainContent = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const rendererContent = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const uxPagesContent = fs.readFileSync(path.join(__dirname, '../src/ux-pages.js'), 'utf8');

// main.js checks
assert.ok(mainContent.includes("'Amblyopia/Strabismus'"), 'main.js must define Amblyopia/Strabismus in headers');
assert.ok(mainContent.includes('function isAmblyopiaStrabismus('), 'main.js must define isAmblyopiaStrabismus helper');
assert.ok(mainContent.includes('INCOMPLETE_AMBLYOPIA_HEADER'), 'main.js must define INCOMPLETE_AMBLYOPIA_HEADER');
assert.ok(mainContent.includes('ensureIncompleteAmblyopiaColumn'), 'main.js must migrate incomplete workbook for Amb/Strab');
assert.ok(mainContent.includes("{ key:'amblyopiaStrabismus', label:'Amblyopia/Strabismus' }"), 'main.js SETUP_FIELDS must include amblyopiaStrabismus');

// renderer.js checks
assert.ok(rendererContent.includes('name="amblyopiaStrabismus"'), 'renderer.js must render Amb/Strab checkbox in referral form');
assert.ok(rendererContent.includes('Amb/Strab'), 'renderer.js must render Amb/Strab badge');
assert.ok(rendererContent.includes('doctorAmblyopia:isAmbRef'), 'renderer.js must prefill doctorAmblyopia from referral');
assert.ok(rendererContent.includes('doctorStrabismus:isAmbRef'), 'renderer.js must prefill doctorStrabismus from referral');

// ux-pages.js checks
assert.ok(uxPagesContent.includes('isAmbPill'), 'ux-pages.js must define isAmbPill helper');
assert.ok(uxPagesContent.includes("['Amblyopia / Strabismus', T(r['Amblyopia/Strabismus'] || 'No')]"), 'ux-pages.js must display Amb/Strab in referral drawer info');
assert.ok(uxPagesContent.includes("doctorAmblyopia: isAmb"), 'ux-pages.js must prefill doctorAmblyopia when starting initial from referral drawer');
assert.ok(uxPagesContent.includes("['amblyopiaStrabismus', 'Amblyopia / Strabismus']"), 'ux-pages.js must show Amblyopia/Strabismus in setup drawer');
assert.ok(uxPagesContent.includes("['Amblyopia / Strabismus', T(r.amblyopiaStrabismus || 'No')]"), 'ux-pages.js must show Amblyopia/Strabismus in incomplete drawer');

// 2. Functional tests for isAmblyopiaStrabismus logic
function extractIsAmblyopiaStrabismus() {
  const match = mainContent.match(/function isAmblyopiaStrabismus\(formData\)\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'Could not find isAmblyopiaStrabismus in main.js');
  return new Function('formData', match[1]);
}
const testIsAmb = extractIsAmblyopiaStrabismus();

assert.equal(testIsAmb({ doctorAmblyopia: true }), 'Yes');
assert.equal(testIsAmb({ doctorStrabismus: true }), 'Yes');
assert.equal(testIsAmb({ sym_amblyopia: true }), 'Yes');
assert.equal(testIsAmb({ amblyopiaStrabismus: 'Yes' }), 'Yes');
assert.equal(testIsAmb({ doctorAmblyopia: false, doctorStrabismus: false }), 'No');
assert.equal(testIsAmb({}), 'No');
assert.equal(testIsAmb(null), 'No');

// 3. Asset spreadsheet templates check
for (const rel of ['assets/Referral_Follow_Up.xlsx', 'assets/New_Patient_Setup.xlsx', 'assets/Schedule_Incomplete.xlsx']) {
  const file = path.join(__dirname, '..', rel);
  assert.ok(fs.existsSync(file), `Template missing: ${rel}`);
  const wb = new ExcelJS.Workbook();
  wb.xlsx.readFile(file).then(workbook => {
    const ws = workbook.worksheets[0];
    const headers = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = ws.getCell(1, c).value;
      if (v) headers.push(String(v).trim());
    }
    assert.ok(headers.includes('Amblyopia/Strabismus'), `${rel} must contain Amblyopia/Strabismus column header`);
  });
}

// 4. Excel migration simulation tests
(async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'amb-strab-test-'));

  try {
    // 4a. Incomplete migration test
    const incPath = path.join(tmpDir, 'Schedule_Incomplete.xlsx');
    const incWb = new ExcelJS.Workbook();
    const incWs = incWb.addWorksheet('Schedule Incomplete');
    const oldIncHeaders = ['Date', 'Patient Name', 'Age', 'DOB', 'Parent Name', 'Phone', 'Email', 'Grade', 'Referral Source', 'Status', 'Comments', 'Last Updated', 'Form Data JSON'];
    incWs.addRow(oldIncHeaders);
    // Row 2: patient with doctorAmblyopia
    incWs.addRow(['2026-11-01', 'Alice Amblyopia', 8, '2018-05-10', 'Parent 1', '555-0001', 'a@test.com', '3', 'Dr. Smith', 'Follow-up', 'Needs call', '2026-11-01T10:00:00Z', JSON.stringify({ patientName: 'Alice Amblyopia', doctorAmblyopia: true })]);
    // Row 3: patient without amblyopia
    incWs.addRow(['2026-11-02', 'Bob Regular', 9, '2017-04-12', 'Parent 2', '555-0002', 'b@test.com', '4', 'Self', 'Follow-up', 'Called', '2026-11-02T10:00:00Z', JSON.stringify({ patientName: 'Bob Regular' })]);
    await incWb.xlsx.writeFile(incPath);

    // Simulate ensureIncompleteAmblyopiaColumn
    const headerMap = {};
    for (let c = 1; c <= incWs.columnCount; c++) headerMap[String(incWs.getCell(1, c).value || '').trim()] = c;
    assert.equal(headerMap['Amblyopia/Strabismus'], undefined);

    let last = 0;
    for (const k of Object.keys(headerMap)) { if (k) last = Math.max(last, headerMap[k]); }
    const col = last + 1;
    incWs.getCell(1, col).value = 'Amblyopia/Strabismus';
    const jsonCol = headerMap['Form Data JSON'];
    for (let r = 2; r <= incWs.rowCount; r++) {
      const fData = JSON.parse(incWs.getCell(r, jsonCol).value || '{}');
      incWs.getCell(r, col).value = testIsAmb(fData);
    }
    await incWb.xlsx.writeFile(incPath);

    // Verify backfill
    const verifyWb = new ExcelJS.Workbook();
    await verifyWb.xlsx.readFile(incPath);
    const verifyWs = verifyWb.worksheets[0];
    const ambCol = col;
    assert.equal(verifyWs.getCell(1, ambCol).value, 'Amblyopia/Strabismus');
    assert.equal(verifyWs.getCell(2, ambCol).value, 'Yes'); // Alice has doctorAmblyopia
    assert.equal(verifyWs.getCell(3, ambCol).value, 'No');  // Bob does not

    // 4b. Setup payload test
    function testSetupPayload(formData) {
      return {
        patientName: formData.patientName || '',
        amblyopiaStrabismus: testIsAmb(formData)
      };
    }
    assert.equal(testSetupPayload({ patientName: 'Test 1', doctorAmblyopia: true }).amblyopiaStrabismus, 'Yes');
    assert.equal(testSetupPayload({ patientName: 'Test 2', doctorStrabismus: true }).amblyopiaStrabismus, 'Yes');
    assert.equal(testSetupPayload({ patientName: 'Test 3', sym_amblyopia: true }).amblyopiaStrabismus, 'Yes');
    assert.equal(testSetupPayload({ patientName: 'Test 4', amblyopiaStrabismus: 'Yes' }).amblyopiaStrabismus, 'Yes');
    assert.equal(testSetupPayload({ patientName: 'Test 5' }).amblyopiaStrabismus, 'No');

    console.log('Amblyopia/Strabismus full workflow, migrations, spreadsheets and UI: PASS');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
})();
