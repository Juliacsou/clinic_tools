'use strict';
// Regression test: exercise the real Monthly IPC backend + real Monthly Excel
// adapter together. Only ExcelJS's disk codec is replaced by an in-memory fake.
// Older tests stubbed the entire adapter, masking a missing requireFile export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monthly-real-adapter-'));
const weeklySettings = path.join(temp, 'weekly-reports');
fs.mkdirSync(weeklySettings, { recursive: true });
const workbookPath = path.join(temp, 'clinic-workbook.xlsx');
fs.writeFileSync(workbookPath, 'ORIGINAL WORKBOOK', 'utf8');
fs.writeFileSync(path.join(weeklySettings, 'settings.json'), JSON.stringify({ workbookPath }));

const headings = ['Month Year', '# of inquiries', '# free Screenings', 'OM Exams Done',
  'Percept Test Done', '# VT Consults Done', '# New VT Starts',
  'Total # VT Pts Enrolled', '# VT Sessions', '# VT Grads',
  '# Cancellations 99215/Annuals', '# Cancellations 99213/Follow ups', 'Comments'];
const rows = new Map();
function getRow(index) {
  if (!rows.has(index)) {
    const cells = new Map();
    rows.set(index, {
      number: index,
      getCell(i) {
        if (!cells.has(i)) cells.set(i, { value: null, style: {}, numFmt: null });
        return cells.get(i);
      },
      eachCell(options, cb) {
        for (const [column, cell] of cells) if (options.includeEmpty || cell.value != null) cb(cell, column);
      }
    });
  }
  return rows.get(index);
}
headings.forEach((h, i) => { getRow(1).getCell(i + 1).value = h; });
getRow(2).getCell(1).value = new Date('2026-10-01T12:00:00Z');
getRow(2).getCell(2).value = 21;
getRow(2).getCell(13).value = 'October report';
const sheet = {
  name: 'monthly',
  getRow,
  getCell(address) {
    const match = address.match(/^([A-M])(\d+)$/);
    assert(match, 'Expected a valid Monthly cell address: ' + address);
    return getRow(Number(match[2])).getCell(match[1].charCodeAt(0) - 64);
  },
  eachRow(_options, cb) {
    for (const [index, row] of [...rows].sort((a, b) => a[0] - b[0])) cb(row, index);
  }
};
class FakeWorkbook {
  constructor() {
    this.worksheets = [sheet];
    this.calcProperties = {};
    this.xlsx = {
      readFile: async () => {},
      writeFile: async target => fs.writeFileSync(target, 'UPDATED WORKBOOK', 'utf8')
    };
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'exceljs') return { Workbook: FakeWorkbook };
  return originalLoad.apply(this, arguments);
};

(async () => {
  const excel = require('../src/monthly-excel');
  const register = require('../src/monthly-backend');
  assert.equal(typeof excel.requireFile, 'function',
    'Monthly adapter must export the file validator used by monthly:write');
  assert.doesNotThrow(() => excel.requireFile(workbookPath));
  assert.throws(() => excel.requireFile(path.join(temp, 'missing.xlsx')), /existing/);
  assert.throws(() => excel.requireFile(path.join(temp, 'missing.csv')), /existing/);

  const handlers = new Map();
  register({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: {}, mainWindow: () => null,
    dataDir: () => temp, queueWrite: fn => fn()
  });
  const call = (name, ...args) => handlers.get(name)({}, ...args);
  const draft = {
    month: '2026-11', mode: 'all', sources: {},
    manual: { B: 57, C: 0, H: 180 },
    comments: 'Monthly save integration regression', commentsEdited: true
  };
  const preview = await call('monthly:preview', draft);
  assert.equal(preview.exists, false);
  assert.deepEqual(preview.updates,
    { B: 57, C: 0, H: 180, M: 'Monthly save integration regression' });
  assert.equal(preview.fileHash.length, 64);

  const saved = await call('monthly:write', draft, preview.fileHash);
  assert.equal(saved.row, 3);
  assert.equal(saved.rowAction, 'append-month');
  assert(fs.existsSync(saved.backup), 'Saving Monthly must produce a backup first');
  assert.equal(fs.readFileSync(saved.backup, 'utf8'), 'ORIGINAL WORKBOOK');
  assert.equal(fs.readFileSync(workbookPath, 'utf8'), 'UPDATED WORKBOOK');
  assert.equal(sheet.getCell('B3').value, 57);
  assert.equal(sheet.getCell('H3').value, 180);
  assert.equal(sheet.getCell('M3').value, 'Monthly save integration regression');

  const updated = await call('monthly:load', '2026-11');
  assert.equal(updated.inExcel, true);
  assert.equal(updated.existing.B, 57);
  assert.equal(updated.existing.M, 'Monthly save integration regression');
  assert.equal(updated.draft.exportedAt != null, true);

  // Also verify an existing month's row is updated in place, rather than appended.
  const existingDraft = { month: '2026-10', manual: { B: 39 } };
  const existingPreview = await call('monthly:preview', existingDraft);
  assert.equal(existingPreview.exists, true);
  const existingResult = await call('monthly:write', existingDraft, existingPreview.fileHash);
  assert.equal(existingResult.row, 2);
  assert.equal(existingResult.rowAction, 'update-existing');
  assert.equal(sheet.getCell('B2').value, 39);
  assert.equal(sheet.getCell('B3').value, 57, 'Saving October must not change November');

  const backups = fs.readdirSync(path.join(temp, 'monthly-reports', 'backups')).length;
  await assert.rejects(() => call('monthly:write', draft, preview.fileHash), /modified/);
  assert.equal(fs.readdirSync(path.join(temp, 'monthly-reports', 'backups')).length, backups,
    'Stale preview must not create another backup or write to Excel');
  console.log('Monthly real adapter: preview -> backup -> append/update -> reload -> stale hash rejection: PASS');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
});
