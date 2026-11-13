const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ClinicDates = require('./us-dates');

const DATA_HEADERS = [
  'Date',
  'Patient Name',
  'Age',
  'DOB',
  'Patient/Parent Concerns or Symptoms',
  'Recommended Evaluation',
  '1st Contact - Date/Time',
  '1st Contact - Comment',
  '2nd Contact - Date/Time',
  '2nd Contact - Comment',
  '3rd Contact - Date/Time',
  '3rd Contact - Comment',
  'Call Referring Dr.',
  'Letter to Patient',
  'Thank You Letter',
  'Reason for Not Booking',
  'Referral PDF',
  'Booking Status',
  'Parent Name',
  'Phone',
  'Email',
  'Grade',
  'Referring Doctor',
  'Office Name',
  'Referring Doctor Phone',
  'Amblyopia/Strabismus'
];
const SYSTEM_REFERRAL_HEADERS = new Set(['Referral PDF', 'Booking Status']);

const DATE_FIELDS = new Set(['Date', 'DOB', 'Call Referring Dr.', 'Letter to Patient', 'Thank You Letter']);
const DATETIME_FIELDS = new Set(['1st Contact - Date/Time', '2nd Contact - Date/Time', '3rd Contact - Date/Time']);
let mainWindow;
let writeQueue = Promise.resolve();

function appRoot() {
  if (app.isPackaged) {
    return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

const dataFolder = require('./data-directory').manager(app, () => path.join(appRoot(), 'data'));
function dataDir() { return dataFolder.current(); }
function referralsDir() { return path.join(dataDir(), 'referrals'); }
function backupsDir() { return path.join(dataDir(), 'backups'); }
function workbookPath() { return path.join(dataDir(), 'Referral_Follow_Up.xlsx'); }
function initialDir() { return path.join(dataDir(), 'initial-contact'); }
function initialFormsDir() { return path.join(initialDir(), 'forms'); }
function initialBackupsDir() { return path.join(initialDir(), 'backups'); }
function initialSettingsPath() { return path.join(initialDir(), 'settings.json'); }
function initialSimulationPath() { return path.join(initialDir(), 'Initial_Contact_Tracking_SIMULATION.xlsx'); }
function cancellationDir() { return path.join(dataDir(), 'exam-cancellations'); }
function cancellationBackupsDir() { return path.join(cancellationDir(), 'backups'); }
function cancellationSettingsPath() { return path.join(cancellationDir(), 'settings.json'); }
function cancellationSimulationPath() { return path.join(cancellationDir(), 'Exam_Cancellations_SIMULATION.xlsx'); }
function setupDir() { return path.join(dataDir(), 'new-patient-setup'); }
function setupBackupsDir() { return path.join(setupDir(), 'backups'); }
function setupWorkbookPath() { return path.join(setupDir(), 'New_Patient_Setup.xlsx'); }
function setupFormDataPath() { return path.join(setupDir(), 'initial-contact-data.json'); }
function incompleteWorkbookPath() { return path.join(setupDir(), 'Schedule_Incomplete.xlsx'); }
function incompleteBackupsDir() { return path.join(setupDir(), 'schedule-incomplete-backups'); }
function waitlistDir() { return path.join(dataDir(), 'waitlist'); }
function waitlistBackupsDir() { return path.join(waitlistDir(), 'backups'); }
function waitlistSettingsPath() { return path.join(waitlistDir(), 'settings.json'); }
function waitlistOpeningsPath() { return path.join(waitlistDir(), 'Openings.xlsx'); }
function reportsDir() { return path.join(dataDir(), 'reports'); }

function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function replaceKnownBrokenWorkbook(targetPath, templatePath, knownBadHashes) {
  if (!fs.existsSync(targetPath)) return;
  const hash = fileSha256(targetPath);
  if (!knownBadHashes.includes(hash)) return;
  const recoveryDir = path.join(path.dirname(targetPath), 'recovery-backups');
  await fsp.mkdir(recoveryDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
  await fsp.copyFile(targetPath, path.join(recoveryDir, `${path.basename(targetPath, '.xlsx')}_pre_v2_6_${stamp}.xlsx`));
  await fsp.copyFile(templatePath, targetPath);
}

async function ensureDataFiles() {
  await fsp.mkdir(referralsDir(), { recursive: true });
  await fsp.mkdir(backupsDir(), { recursive: true });
  await fsp.mkdir(initialFormsDir(), { recursive: true });
  await fsp.mkdir(initialBackupsDir(), { recursive: true });
  await fsp.mkdir(cancellationBackupsDir(), { recursive: true });
  await fsp.mkdir(setupBackupsDir(), { recursive: true });
  await fsp.mkdir(incompleteBackupsDir(), { recursive: true });
  await fsp.mkdir(waitlistBackupsDir(), { recursive: true });
  await fsp.mkdir(reportsDir(), { recursive: true });
  if (!fs.existsSync(workbookPath())) {
    const template = app.isPackaged
      ? path.join(process.resourcesPath, 'template', 'Referral_Follow_Up.xlsx')
      : path.join(appRoot(), 'assets', 'Referral_Follow_Up.xlsx');
    await fsp.copyFile(template, workbookPath());
  }
  if (!fs.existsSync(initialSimulationPath())) {
    const sim = app.isPackaged
      ? path.join(process.resourcesPath, 'template', 'Initial_Contact_Tracking_SIMULATION.xlsx')
      : path.join(appRoot(), 'assets', 'Initial_Contact_Tracking_SIMULATION.xlsx');
    await fsp.copyFile(sim, initialSimulationPath());
  }
  if (!fs.existsSync(cancellationSimulationPath())) {
    const sim = app.isPackaged
      ? path.join(process.resourcesPath, 'template', 'Exam_Cancellations_SIMULATION.xlsx')
      : path.join(appRoot(), 'assets', 'Exam_Cancellations_SIMULATION.xlsx');
    await fsp.copyFile(sim, cancellationSimulationPath());
  }
  if (!fs.existsSync(setupWorkbookPath())) {
    const template = app.isPackaged
      ? path.join(process.resourcesPath, 'template', 'New_Patient_Setup.xlsx')
      : path.join(appRoot(), 'assets', 'New_Patient_Setup.xlsx');
    await fsp.copyFile(template, setupWorkbookPath());
  }
  if (!fs.existsSync(incompleteWorkbookPath())) {
    const template = app.isPackaged
      ? path.join(process.resourcesPath, 'template', 'Schedule_Incomplete.xlsx')
      : path.join(appRoot(), 'assets', 'Schedule_Incomplete.xlsx');
    await fsp.copyFile(template, incompleteWorkbookPath());
  }

  if (!fs.existsSync(waitlistOpeningsPath())) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Openings');
    ws.addRow(['Dr', 'Appointment Type', 'Date', 'Time']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17345C' } };
    ws.columns = [{width:18},{width:22},{width:15},{width:14}];
    ws.autoFilter = 'A1:D1';
    await wb.xlsx.writeFile(waitlistOpeningsPath());
  }

  // v2.5 shipped two internal workbooks with an Excel table definition that
  // ExcelJS could not parse. Repair only the untouched v2.5 copies by hash,
  // preserving any workbook that the user has already changed.
  const cancellationTemplate = app.isPackaged
    ? path.join(process.resourcesPath, 'template', 'Exam_Cancellations_SIMULATION.xlsx')
    : path.join(appRoot(), 'assets', 'Exam_Cancellations_SIMULATION.xlsx');
  const setupTemplate = app.isPackaged
    ? path.join(process.resourcesPath, 'template', 'New_Patient_Setup.xlsx')
    : path.join(appRoot(), 'assets', 'New_Patient_Setup.xlsx');
  await replaceKnownBrokenWorkbook(
    cancellationSimulationPath(),
    cancellationTemplate,
    ['7130e7c20332b5b749b72bc3da6508401720ed31e4e1dec0419a138c56da5d93']
  );
  await replaceKnownBrokenWorkbook(
    setupWorkbookPath(),
    setupTemplate,
    ['94f94bc9725debee4222f4eacce9a891fea15518e35c060c657f9a7e8a4299e8']
  );
}


async function backupWorkbook() {
  if (!fs.existsSync(workbookPath())) return;
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0'), '_', String(now.getHours()).padStart(2,'0'), String(now.getMinutes()).padStart(2,'0'), String(now.getSeconds()).padStart(2,'0'), '_', String(now.getMilliseconds()).padStart(3,'0')].join('');
  await fsp.copyFile(workbookPath(), path.join(backupsDir(), `Referral_Follow_Up_${stamp}.xlsx`));
}

function serializeDate(value, withTime = false) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  if (!withTime) return `${yyyy}-${mm}-${dd}`;
  return `${yyyy}-${mm}-${dd}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function toExcelDate(value, withTime = false) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!withTime) {
    const iso = ClinicDates.toISODate(value);
    if (!iso) return null;
    const [y,m,d] = iso.split('-').map(Number);
    return new Date(y,m-1,d); // Create a local calendar date; the Excel number format controls its display.
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasValue(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
function contactCount(rec) {
  return ['1st','2nd','3rd'].reduce((n,p) => n + (hasValue(rec[`${p} Contact - Date/Time`]) ? 1 : 0), 0);
}
function nextAttempt(rec) {
  for (let i = 0; i < 3; i++) {
    const p = ['1st','2nd','3rd'][i];
    if (!hasValue(rec[`${p} Contact - Date/Time`])) return i + 1;
  }
  return null;
}
function deriveStatus(rec) {
  if (String(rec['Booking Status'] || '').toLowerCase() === 'scheduled') return 'Scheduled';
  if (hasValue(rec['Reason for Not Booking'])) return 'Not booked';
  const count = contactCount(rec);
  if (count === 0) return 'Awaiting 1st contact';
  if (count === 1) return 'Awaiting 2nd contact';
  if (count === 2) return 'Awaiting 3rd contact';
  if (count >= 3 && !hasValue(rec['Call Referring Dr.'])) return 'Call referring doctor';
  if (hasValue(rec['Call Referring Dr.']) && !hasValue(rec['Letter to Patient'])) return 'Referring doctor contacted';
  if (hasValue(rec['Letter to Patient'])) return 'Letter sent';
  return 'In progress';
}

async function loadWorkbook() {
  await ensureDataFiles();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(workbookPath());
  const ws = wb.getWorksheet('Referrals');
  if (!ws) throw new Error("The workbook does not contain a 'Referrals' worksheet.");
  const migrated = ensureSchema(ws);
  if (migrated) {
    const guide = wb.getWorksheet('Field Guide');
    if (guide) {
      const existing = new Set();
      for (let r = 2; r <= guide.rowCount; r++) existing.add(String(guide.getCell(r,1).value || '').trim());
      for (const [field, type] of [['Parent Name','Text'],['Phone','Text'],['Email','Text'],['Grade','Text'],['Referring Doctor','Text'],['Office Name','Text'],['Referring Doctor Phone','Text / phone number'],['Amblyopia/Strabismus','Text (Yes/No)']]) {
        if (!existing.has(field)) guide.addRow([field, type]);
      }
    }
    await backupWorkbook();
    await wb.xlsx.writeFile(workbookPath());
  }
  return { wb, ws };
}

function ensureSchema(ws) {
  let changed = false;
  DATA_HEADERS.forEach((header, idx) => {
    const cell = ws.getCell(1, idx + 1);
    const existing = cell.value == null ? '' : String(cell.value).trim();
    // The original 18 columns are never moved or renamed. New demographic
    // fields are appended so existing client data remains in place.
    if (idx < 18 && existing !== header) {
      throw new Error('Workbook columns do not match the required Referral Follow-Up template.');
    }
    if (idx >= 18 && !existing) {
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17345C' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const widths = { 'Parent Name': 24, 'Phone': 18, 'Email': 30, 'Grade': 14, 'Referring Doctor': 24, 'Office Name': 28, 'Referring Doctor Phone': 20, 'Amblyopia/Strabismus': 22 };
      ws.getColumn(idx + 1).width = widths[header] || 20;
      changed = true;
    } else if (idx >= 18 && existing !== header) {
      throw new Error('Workbook columns do not match the required Referral Follow-Up template.');
    }
  });
  if (changed) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ws.rowCount, 2), column: DATA_HEADERS.length } };
  return changed;
}

function rowToRecord(row) {
  const rec = {};
  DATA_HEADERS.forEach((h, i) => {
    let v = row.getCell(i+1).value;
    if (v && typeof v === 'object' && v.text) v = v.text;
    if (DATE_FIELDS.has(h)) v = serializeDate(v, false);
    if (DATETIME_FIELDS.has(h)) v = serializeDate(v, true);
    rec[h] = v ?? '';
  });
  rec._row = row.number;
  rec._status = deriveStatus(rec);
  rec._next_attempt = nextAttempt(rec);
  const referralFiles = parseReferralFiles(rec['Referral PDF']);
  rec._pdf_files = referralFiles.map((name, index) => ({ name, index, exists: fs.existsSync(path.join(referralsDir(), path.basename(name))) }));
  rec._pdf_exists = rec._pdf_files.some(x => x.exists);
  return rec;
}

function allRecords(ws) {
  const out = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!hasValue(row.getCell(2).value)) continue;
    out.push(rowToRecord(row));
  }
  return out;
}

function firstAvailableRow(ws) {
  for (let r = 2; r <= Math.max(ws.rowCount, 2); r++) {
    if (!hasValue(ws.getCell(r, 2).value)) return r;
  }
  return ws.rowCount + 1;
}

function writeRecord(ws, rowNumber, data) {
  const row = ws.getRow(rowNumber);
  DATA_HEADERS.forEach((header, idx) => {
    if (SYSTEM_REFERRAL_HEADERS.has(header)) return;
    let value = data[header];
    if (DATE_FIELDS.has(header)) value = toExcelDate(value, false);
    else if (DATETIME_FIELDS.has(header)) value = toExcelDate(value, true);
    else if (header === 'Age') value = hasValue(value) ? Number(value) : null;
    else value = hasValue(value) ? String(value).trim() : null;
    const cell = row.getCell(idx + 1);
    cell.value = value;
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF0000FF' } };
    if (DATE_FIELDS.has(header)) cell.numFmt = 'mm/dd/yyyy';
    if (DATETIME_FIELDS.has(header)) cell.numFmt = 'mm/dd/yyyy h:mm AM/PM';
  });
  row.commit?.();
}

async function saveWorkbook(wb) {
  await backupWorkbook();
  try {
    await wb.xlsx.writeFile(workbookPath());
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error('The Excel workbook appears to be open. Close Excel and try again.');
    throw err;
  }
}

function sanitizeName(name) {
  return String(name || 'patient').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^[_\.]+|[_\.]+$/g, '') || 'patient';
}

function parseReferralFiles(value) {
  if (!value) return [];
  return String(value).split('||').map(x => x.trim()).filter(Boolean).slice(0, 3);
}

async function copyPdfForReferral(sourcePath, rowNumber, patientName, ordinal = 1) {
  if (!sourcePath) return '';
  const fd = await fsp.open(sourcePath, 'r');
  const buf = Buffer.alloc(5);
  await fd.read(buf, 0, 5, 0);
  await fd.close();
  if (buf.toString() !== '%PDF-') throw new Error('Referral document must be a valid PDF file.');
  await fsp.mkdir(referralsDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,17);
  const filename = `REF${String(rowNumber - 1).padStart(5,'0')}_${sanitizeName(patientName)}_${stamp}_${ordinal}.pdf`;
  const destPath = path.join(referralsDir(), filename);
  await fsp.copyFile(sourcePath, destPath);
  const stat = await fsp.stat(destPath);
  if (!stat || stat.size < 5) throw new Error('Referral PDF copy verification failed.');
  return filename;
}

async function copyReferralPdfList(sourcePaths, rowNumber, patientName, existing = []) {
  const sources = Array.isArray(sourcePaths) ? sourcePaths.filter(Boolean) : [];
  if (existing.length + sources.length > 3) throw new Error('A referral can have a maximum of 3 PDF files.');
  const files = [...existing];
  for (let i = 0; i < sources.length; i++) {
    files.push(await copyPdfForReferral(sources[i], rowNumber, patientName, files.length + 1));
  }
  return files;
}

async function recycleReferralSources(sourcePaths) {
  const warnings = [];
  const sources = Array.isArray(sourcePaths) ? sourcePaths.filter(Boolean) : [];
  const destDir = path.resolve(referralsDir());
  for (const sourcePath of sources) {
    try {
      const resolved = path.resolve(sourcePath);
      if (path.dirname(resolved) === destDir) continue;
      if (!fs.existsSync(resolved)) continue;
      try {
        await shell.trashItem(resolved);
      } catch {
        // Fallback to direct deletion below if Recycle Bin is unavailable for this path.
      }
      if (fs.existsSync(resolved)) {
        try {
          await fsp.unlink(resolved);
        } catch {
          await fsp.chmod(resolved, 0o666).catch(() => {});
          await fsp.unlink(resolved);
        }
      }
    } catch (err) {
      warnings.push(`Could not remove ${path.basename(sourcePath)} from its original location: ${err.message || err}`);
    }
  }
  return warnings;
}

async function markMatchingReferralScheduled(formData = {}) {
  const { wb, ws } = await loadWorkbook();
  const statusCol = DATA_HEADERS.indexOf('Booking Status') + 1;
  const explicitRow = Number(formData._referralRow || formData.referralRow || 0);
  const targetName = normalizeHeader(formData.patientName);
  const targetDob = String(formData.dob || '').trim();
  let matchedRow = null;

  if (Number.isInteger(explicitRow) && explicitRow >= 2 && explicitRow <= ws.rowCount && hasValue(ws.getCell(explicitRow, 2).value)) {
    matchedRow = explicitRow;
  } else if (targetName) {
    for (let r = 2; r <= ws.rowCount; r++) {
      if (!hasValue(ws.getCell(r, 2).value)) continue;
      const rec = rowToRecord(ws.getRow(r));
      if (['Scheduled', 'Not booked'].includes(rec._status)) continue;
      if (normalizeHeader(rec['Patient Name']) !== targetName) continue;
      if (targetDob && rec['DOB'] && rec['DOB'] !== targetDob) continue;
      matchedRow = r;
      break;
    }
  }

  if (!matchedRow) return { updated: false, rowNumber: null };
  const currentVal = String(ws.getCell(matchedRow, statusCol).value || '').trim();
  if (currentVal.toLowerCase() !== 'scheduled') {
    ws.getCell(matchedRow, statusCol).value = 'Scheduled';
    await saveWorkbook(wb);
  }
  return { updated: true, rowNumber: matchedRow };
}

function queueWrite(fn) {
  const task = writeQueue.then(fn, fn);
  writeQueue = task.catch(() => {});
  return task;
}

ipcMain.handle('referrals:list', async () => {
  const { ws } = await loadWorkbook();
  return allRecords(ws);
});

ipcMain.handle('referrals:export-contacted-report', async () => {
  const { ws } = await loadWorkbook();
  const records = allRecords(ws).filter(r => hasValue(r['Call Referring Dr.']));
  if (!records.length) throw new Error('No patients have a Referring Doctor contact date yet.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Referring Doctor Contact Report',
    defaultPath: path.join(reportsDir(), `Referring_Doctor_Contact_Report_${new Date().toISOString().slice(0,10)}.xlsx`),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const out = new ExcelJS.Workbook();
  const outWs = out.addWorksheet('Referring Dr Contacted');
  const headers = ['Referral Date','Patient Name','Age','DOB','Parent Name','Patient Phone','Patient Email','Grade','Concerns / Symptoms','Recommended Evaluation','Referring Doctor','Referring Doctor Phone','Office Name','1st Contact','1st Comment','2nd Contact','2nd Comment','3rd Contact','3rd Comment','Referring Dr Contacted Date','Current Status'];
  outWs.addRow(headers);
  outWs.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
  outWs.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF17345C'} };
  for (const r of records) {
    outWs.addRow([
      r['Date'] ? toExcelDate(r['Date'], false) : null,
      r['Patient Name'], r['Age'] || '', r['DOB'] ? toExcelDate(r['DOB'], false) : null,
      r['Parent Name'], r['Phone'], r['Email'], r['Grade'], r['Patient/Parent Concerns or Symptoms'], r['Recommended Evaluation'],
      r['Referring Doctor'], r['Referring Doctor Phone'], r['Office Name'],
      r['1st Contact - Date/Time'] ? toExcelDate(r['1st Contact - Date/Time'], true) : null, r['1st Contact - Comment'],
      r['2nd Contact - Date/Time'] ? toExcelDate(r['2nd Contact - Date/Time'], true) : null, r['2nd Contact - Comment'],
      r['3rd Contact - Date/Time'] ? toExcelDate(r['3rd Contact - Date/Time'], true) : null, r['3rd Contact - Comment'],
      r['Call Referring Dr.'] ? toExcelDate(r['Call Referring Dr.'], false) : null, r._status
    ]);
  }
  [1,4,20].forEach(c => { for(let r=2;r<=outWs.rowCount;r++) if(outWs.getCell(r,c).value instanceof Date) outWs.getCell(r,c).numFmt='mm/dd/yyyy'; });
  [14,16,18].forEach(c => { for(let r=2;r<=outWs.rowCount;r++) if(outWs.getCell(r,c).value instanceof Date) outWs.getCell(r,c).numFmt='mm/dd/yyyy h:mm AM/PM'; });
  const widths=[14,24,8,14,24,18,30,12,42,22,24,20,28,22,32,22,32,22,32,20,24];
  widths.forEach((w,i)=>outWs.getColumn(i+1).width=w);
  outWs.views=[{state:'frozen',ySplit:1}];
  outWs.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
  await out.xlsx.writeFile(result.filePath);
  return result.filePath;
});

ipcMain.handle('referrals:get', async (_, rowNumber) => {
  const { ws } = await loadWorkbook();
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > ws.rowCount) return null;
  const row = ws.getRow(rowNumber);
  if (!hasValue(row.getCell(2).value)) return null;
  return rowToRecord(row);
});

ipcMain.handle('referrals:create', (_, data) => queueWrite(async () => {
  if (!String(data['Patient Name'] || '').trim()) throw new Error('Patient Name is required.');
  const { wb, ws } = await loadWorkbook();
  const rowNumber = firstAvailableRow(ws);
  writeRecord(ws, rowNumber, data);
  if (Array.isArray(data._pdfSourcePaths) && data._pdfSourcePaths.length) {
    const files = await copyReferralPdfList(data._pdfSourcePaths, rowNumber, data['Patient Name']);
    ws.getCell(rowNumber, DATA_HEADERS.indexOf('Referral PDF') + 1).value = files.join('||');
    ws.getCell(rowNumber, DATA_HEADERS.indexOf('Referral PDF') + 1).font = { name: 'Aptos', size: 10, color: { argb: 'FF008000' } };
  }
  ws.getCell(rowNumber, DATA_HEADERS.indexOf('Booking Status') + 1).value = '';
  await saveWorkbook(wb);
  const moveWarnings = await recycleReferralSources(data._pdfSourcePaths);
  return { rowNumber, moveWarnings };
}));

ipcMain.handle('referrals:update', (_, rowNumber, data) => queueWrite(async () => {
  const { wb, ws } = await loadWorkbook();
  if (rowNumber < 2 || rowNumber > ws.rowCount || !hasValue(ws.getCell(rowNumber,2).value)) throw new Error('Referral not found.');
  writeRecord(ws, rowNumber, data);
  if (Array.isArray(data._pdfSourcePaths) && data._pdfSourcePaths.length) {
    const pdfCol = DATA_HEADERS.indexOf('Referral PDF') + 1;
    const existing = parseReferralFiles(ws.getCell(rowNumber, pdfCol).value);
    const files = await copyReferralPdfList(data._pdfSourcePaths, rowNumber, data['Patient Name'], existing);
    ws.getCell(rowNumber, pdfCol).value = files.join('||');
    ws.getCell(rowNumber, pdfCol).font = { name: 'Aptos', size: 10, color: { argb: 'FF008000' } };
  }
  await saveWorkbook(wb);
  const moveWarnings = await recycleReferralSources(data._pdfSourcePaths);
  return { rowNumber, moveWarnings };
}));

ipcMain.handle('referrals:attach-pdf', (_, rowNumber, pdfSourcePaths) => queueWrite(async () => {
  const { wb, ws } = await loadWorkbook();
  const r = Number(rowNumber);
  if (!Number.isInteger(r) || r < 2 || r > ws.rowCount || !hasValue(ws.getCell(r, 2).value)) throw new Error('Referral not found.');
  const sources = Array.isArray(pdfSourcePaths) ? pdfSourcePaths.filter(Boolean) : [];
  if (!sources.length) return { rowNumber: r, moveWarnings: [] };
  const patientName = String(ws.getCell(r, DATA_HEADERS.indexOf('Patient Name') + 1).value || 'patient').trim();
  const pdfCol = DATA_HEADERS.indexOf('Referral PDF') + 1;
  const existing = parseReferralFiles(ws.getCell(r, pdfCol).value);
  const files = await copyReferralPdfList(sources, r, patientName, existing);
  ws.getCell(r, pdfCol).value = files.join('||');
  ws.getCell(r, pdfCol).font = { name: 'Aptos', size: 10, color: { argb: 'FF008000' } };
  await saveWorkbook(wb);
  const moveWarnings = await recycleReferralSources(sources);
  return { rowNumber: r, files, moveWarnings };
}));

ipcMain.handle('referrals:add-contact', (_, rowNumber, payload) => queueWrite(async () => {
  const attempt = Number(payload.attempt);
  if (![1,2,3].includes(attempt)) throw new Error('Invalid contact attempt.');
  if (!payload.contact_datetime) throw new Error('Contact date/time is required.');
  const { wb, ws } = await loadWorkbook();
  const prefixes = {1:'1st',2:'2nd',3:'3rd'};
  const prefix = prefixes[attempt];
  const dtCol = DATA_HEADERS.indexOf(`${prefix} Contact - Date/Time`) + 1;
  const commentCol = DATA_HEADERS.indexOf(`${prefix} Contact - Comment`) + 1;
  ws.getCell(rowNumber, dtCol).value = toExcelDate(payload.contact_datetime, true);
  ws.getCell(rowNumber, dtCol).numFmt = 'mm/dd/yyyy h:mm AM/PM';
  ws.getCell(rowNumber, commentCol).value = String(payload.comment || '').trim() || null;
  await saveWorkbook(wb);
  return true;
}));

ipcMain.handle('referrals:update-next-steps', (_, rowNumber, payload) => queueWrite(async () => {
  const { wb, ws } = await loadWorkbook();
  for (const h of ['Call Referring Dr.','Letter to Patient','Thank You Letter']) {
    const col = DATA_HEADERS.indexOf(h)+1;
    ws.getCell(rowNumber,col).value = toExcelDate(payload[h], false);
    ws.getCell(rowNumber,col).numFmt = 'mm/dd/yyyy';
  }
  const reasonCol = DATA_HEADERS.indexOf('Reason for Not Booking')+1;
  ws.getCell(rowNumber, reasonCol).value = String(payload['Reason for Not Booking'] || '').trim() || null;
  await saveWorkbook(wb);
  return true;
}));

ipcMain.handle('referrals:set-booking-status', (_, rowNumber, status) => queueWrite(async () => {
  const { wb, ws } = await loadWorkbook();
  ws.getCell(rowNumber, DATA_HEADERS.indexOf('Booking Status') + 1).value = status === 'Scheduled' ? 'Scheduled' : '';
  await saveWorkbook(wb);
  return true;
}));

ipcMain.handle('referrals:delete', (_, rowNumber) => queueWrite(async () => {
  const { wb, ws } = await loadWorkbook();
  const r = Number(rowNumber);
  if (!Number.isInteger(r) || r < 2 || r > ws.rowCount || !hasValue(ws.getCell(r, 2).value)) throw new Error('Referral not found.');
  ws.spliceRows(r, 1);
  await saveWorkbook(wb);
  return true;
}));

ipcMain.handle('pdf:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF Documents', extensions: ['pdf'] }] });
  return result.canceled ? [] : result.filePaths.slice(0, 3);
});

ipcMain.handle('pdf:open', async (_, rowNumber, fileIndex = 0) => {
  const { ws } = await loadWorkbook();
  const rec = rowToRecord(ws.getRow(rowNumber));
  const files = parseReferralFiles(rec['Referral PDF']);
  const idx = Number(fileIndex);
  if (!files.length || !files[idx]) throw new Error('Referral PDF file was not found for this patient.');
  const file = path.join(referralsDir(), path.basename(files[idx]));
  if (!fs.existsSync(file)) throw new Error('Referral PDF file was not found.');
  const result = await shell.openPath(file);
  if (result) throw new Error(result);
  return true;
});

ipcMain.handle('app:data-location', async () => dataDir());
ipcMain.handle('app:choose-data-location', () => queueWrite(async () => {
  const picker=await dialog.showOpenDialog(mainWindow, {title:'Choose Clinic Tools data folder',properties:['openDirectory','createDirectory']});
  if(picker.canceled||!picker.filePaths[0])return null;
  const destination=await dataFolder.describe(picker.filePaths[0]);
  if(destination.kind==='current')return {path:dataDir(),unchanged:true};
  const existing=destination.kind==='existing';
  const choice=await dialog.showMessageBox(mainWindow, {
    type:'question',buttons:[existing?'Use this existing data folder':'Copy my current data here','Cancel'],defaultId:1,cancelId:1,noLink:true,
    title:'Confirm data folder',
    message:existing?'Use the existing Clinic Tools data in this folder?':'Copy all existing Clinic Tools data into this empty folder?',
    detail:(existing?'Nothing will be copied or overwritten. Verify this is the correct existing data folder.':'The current data folder will remain intact as a backup. No files will be deleted.')+'\n\n'+destination.path
  });
  if(choice.response!==0)return null;
  const result=await dataFolder.switchTo(destination.path,existing?'existing':'copy');
  await ensureDataFiles();
  return result;
}));


// ---------------- Initial Contact / Deposit Tracking ----------------
const INITIAL_FIELDS = [
  { key: 'patientName', label: 'Patient Name', aliases: ['patient name'] },
  { key: 'age', label: 'Age', aliases: ['age'] },
  { key: 'initialContactDate', label: 'Date of Initial Contact', aliases: ['date of initial contact','initial contact date'] },
  { key: 'depositNeeded', label: 'Deposit needed?', aliases: ['deposit needed?','deposit needed'] },
  { key: 'depositTaken', label: 'Deposit taken?', aliases: ['deposit taken?','deposit taken'] },
  { key: 'referralSource', label: 'Referral Source', aliases: ['referral source'] },
  { key: 'examScheduled', label: 'Exam Scheduled (date)', aliases: ['exam scheduled (date)','exam scheduled','exam scheduled date'] },
  { key: 'examType', label: 'Exam Type', aliases: ['exam type'] },
  { key: 'parentMeeting', label: 'Parent Meeting (date)', aliases: ['parent meeting (date)','parent meeting','parent meeting date'] }
];

function normalizeHeader(v) {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[“”]/g,'"').trim();
}
function getInitialSettings() {
  try { return JSON.parse(fs.readFileSync(initialSettingsPath(), 'utf8')); } catch { return null; }
}
async function saveInitialSettings(settings) {
  await fsp.writeFile(initialSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}
async function analyzeInitialWorkbook(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Excel workbook was not found.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  let best = null;
  wb.eachSheet(ws => {
    const maxRows = Math.min(Math.max(ws.rowCount, 1), 80);
    for (let r=1; r<=maxRows; r++) {
      const row = ws.getRow(r);
      const headers = [];
      const mapping = {};
      for (let c=1; c<=Math.max(ws.columnCount, 1); c++) {
        let raw = row.getCell(c).value;
        if (raw && typeof raw === 'object' && raw.text) raw = raw.text;
        const text = String(raw ?? '').trim();
        headers.push({ col: c, text });
        const norm = normalizeHeader(text);
        for (const f of INITIAL_FIELDS) {
          if (!mapping[f.key] && f.aliases.some(a => norm === normalizeHeader(a))) mapping[f.key] = c;
        }
      }
      const score = Object.keys(mapping).length;
      if (!best || score > best.score) best = { worksheet: ws.name, headerRow: r, mapping, headers: headers.filter(h=>h.text), score };
    }
  });
  if (!best) throw new Error('No worksheets were found in the selected workbook.');
  return best;
}
function currentInitialWorkbookPath() {
  const settings = getInitialSettings();
  if (settings?.workbookPath && fs.existsSync(settings.workbookPath)) return settings.workbookPath;
  return initialSimulationPath();
}
async function initialWorkbookInfo() {
  const settings = getInitialSettings();
  const workbook = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(workbook);
  const usingSimulation = path.resolve(workbook) === path.resolve(initialSimulationPath());
  return { workbookPath: workbook, usingSimulation, analysis, configured: !!settings?.workbookPath };
}
async function backupInitialWorkbook(filePath) {
  if (!fs.existsSync(filePath)) return;
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  const base = path.basename(filePath, path.extname(filePath));
  await fsp.copyFile(filePath, path.join(initialBackupsDir(), `${sanitizeName(base)}_${stamp}_${crypto.randomBytes(3).toString('hex')}.xlsx`));
}
function excelCellValue(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim();
}
async function appendInitialTracking(data) {
  const filePath = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(filePath);
  if (analysis.score < INITIAL_FIELDS.length) {
    const missing = INITIAL_FIELDS.filter(f => !analysis.mapping[f.key]).map(f=>f.label);
    throw new Error(`The selected spreadsheet is missing required columns: ${missing.join(', ')}.`);
  }
  await backupInitialWorkbook(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(analysis.worksheet);
  const patientCol = analysis.mapping.patientName;
  let target = analysis.headerRow + 1;
  let lastUsed = analysis.headerRow;
  for (let r=analysis.headerRow+1; r<=Math.max(ws.rowCount, analysis.headerRow+1); r++) {
    const v = ws.getRow(r).getCell(patientCol).value;
    if (hasValue(v)) lastUsed = r;
  }
  target = lastUsed + 1;
  const sourceRow = target > analysis.headerRow + 1 ? ws.getRow(target - 1) : null;
  const row = ws.getRow(target);
  if (sourceRow) {
    for (let c=1; c<=ws.columnCount; c++) {
      try {
        row.getCell(c).style = JSON.parse(JSON.stringify(sourceRow.getCell(c).style || {}));
        row.getCell(c).numFmt = sourceRow.getCell(c).numFmt;
      } catch {}
    }
    row.height = sourceRow.height;
  }
  const vals = {
    patientName: data.patientName,
    age: data.age,
    initialContactDate: data.initialContactDate,
    depositNeeded: data.depositNeeded,
    depositTaken: data.depositTaken,
    referralSource: data.referralSource,
    examScheduled: data.examScheduled,
    examType: data.examType,
    parentMeeting: data.parentMeeting
  };
  for (const f of INITIAL_FIELDS) {
    const cell = row.getCell(analysis.mapping[f.key]);
    let value = vals[f.key];
    if (['initialContactDate','examScheduled','parentMeeting'].includes(f.key) && value) {
      value = toExcelDate(value, false);
      cell.numFmt = 'mm/dd/yyyy';
    } else if (f.key === 'age' && hasValue(value)) value = Number(value);
    else value = excelCellValue(value);
    cell.value = value;
  }
  try { await wb.xlsx.writeFile(filePath); }
  catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error('The tracking workbook appears to be open in Excel. Close it and try again.');
    throw err;
  }
  return { rowNumber: target, workbookPath: filePath, worksheet: analysis.worksheet };
}


// One workbook transaction for all siblings. Never overwrite existing patient rows.
async function appendInitialFamilyTracking(records) {
  if (!Array.isArray(records) || records.length < 2 || records.length > 8) throw new Error('Select 2 to 8 patients.');
  const Family = require('./initial-family');
  Family.collectNames(records);
  const filePath = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(filePath);
  if (analysis.score < INITIAL_FIELDS.length) throw new Error('The connected tracking Excel has missing fields.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(analysis.worksheet);
  const patientCol = analysis.mapping.patientName;
  const contactCol = analysis.mapping.initialContactDate;
  let lastUsed = analysis.headerRow;
  const existing = new Map();
  for (let r = analysis.headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = initialPlainValue(row.getCell(patientCol).value).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) continue;
    lastUsed = r;
    const date = initialPlainValue(row.getCell(contactCol).value, true);
    existing.set(`${name}|${date}`, r);
  }
  const results = [];
  let added = 0;
  for (const data of records) {
    const name = String(data.patientName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const date = String(data.initialContactDate || '').slice(0, 10);
    const matchingRow = existing.get(`${name}|${date}`);
    if (matchingRow) {
      results.push({ patientName: data.patientName, rowNumber: matchingRow, worksheet: ws.name, existing: true });
      continue;
    }
    const target = ++lastUsed;
    const prev = target > analysis.headerRow + 1 ? ws.getRow(target - 1) : null;
    const row = ws.getRow(target);
    if (prev) {
      for (let c = 1; c <= ws.columnCount; c++) {
        try { row.getCell(c).style = JSON.parse(JSON.stringify(prev.getCell(c).style || {})); } catch {}
      }
      row.height = prev.height;
    }
    const vals = { patientName: data.patientName, age: data.age, initialContactDate: data.initialContactDate,
      depositNeeded: data.depositNeeded, depositTaken: data.depositTaken,
      referralSource: data.referralSource, examScheduled: data.examScheduled,
      examType: data.examType, parentMeeting: data.parentMeeting };
    for (const f of INITIAL_FIELDS) {
      const cell = row.getCell(analysis.mapping[f.key]);
      let value = vals[f.key];
      if (['initialContactDate', 'examScheduled', 'parentMeeting'].includes(f.key) && value) {
        value = toExcelDate(value, false); cell.numFmt = 'mm/dd/yyyy';
      } else if (f.key === 'age' && hasValue(value)) value = Number(value);
      else value = excelCellValue(value);
      cell.value = value;
    }
    existing.set(`${name}|${date}`, target);
    results.push({ patientName: data.patientName, rowNumber: target, worksheet: ws.name, existing: false });
    added++;
  }
  if (added) {
    await backupInitialWorkbook(filePath);
    const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.family-${crypto.randomUUID()}.tmp.xlsx`);
    try {
      await wb.xlsx.writeFile(temp);
      await fsp.rename(temp, filePath);
    } catch (e) {
      throw new Error(`Unable to update the tracking Excel. The original was left unchanged; close it in Excel and retry. ${e.message}`);
    } finally { await fsp.unlink(temp).catch(() => {}); }
  }
  return { results, workbookPath: filePath, worksheet: ws.name, added };
}


function initialPlainValue(v, isDate = false) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return serializeDate(v, false);
  if (typeof v === 'object') {
    if (v.text !== undefined) v = v.text;
    else if (v.result !== undefined) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map(x => x.text || '').join('');
  }
  if (isDate && typeof v === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return serializeDate(d, false);
  }
  return String(v ?? '').trim();
}

function deriveDepositState(rec) {
  const needed = normalizeHeader(rec.depositNeeded);
  const taken = normalizeHeader(rec.depositTaken);
  if (taken === 'yes' || taken.startsWith('yes ')) return 'Paid';
  if (needed === 'no') return 'No deposit required';
  if (taken === 'no/fes' || taken === 'no fes' || taken === 'fes') return 'No payment required';
  if (needed === 'yes') return 'Pending';
  return 'Needs review';
}

async function listInitialTracking() {
  const filePath = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(analysis.worksheet);
  const out = [];
  const dateKeys = new Set(['initialContactDate','examScheduled','parentMeeting']);
  for (let r = analysis.headerRow + 1; r <= ws.rowCount; r++) {
    const patientCell = ws.getRow(r).getCell(analysis.mapping.patientName);
    if (!hasValue(patientCell.value)) continue;
    const rec = { _row: r };
    for (const f of INITIAL_FIELDS) {
      const col = analysis.mapping[f.key];
      rec[f.key] = col ? initialPlainValue(ws.getRow(r).getCell(col).value, dateKeys.has(f.key)) : '';
    }
    rec._depositState = deriveDepositState(rec);
    out.push(rec);
  }
  return { records: out, workbookPath: filePath, worksheet: analysis.worksheet, headerRow: analysis.headerRow };
}

async function getInitialTrackingRecord(rowNumber) {
  const result = await listInitialTracking();
  return result.records.find(r => r._row === Number(rowNumber)) || null;
}

async function updateInitialTracking(rowNumber, data) {
  const filePath = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(filePath);
  if (analysis.score < INITIAL_FIELDS.length) {
    const missing = INITIAL_FIELDS.filter(f => !analysis.mapping[f.key]).map(f => f.label);
    throw new Error(`The selected spreadsheet is missing required columns: ${missing.join(', ')}.`);
  }
  await backupInitialWorkbook(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(analysis.worksheet);
  const r = Number(rowNumber);
  if (!Number.isInteger(r) || r <= analysis.headerRow || r > ws.rowCount) throw new Error('Tracking row was not found.');
  const dateKeys = new Set(['initialContactDate','examScheduled','parentMeeting']);
  for (const f of INITIAL_FIELDS) {
    const cell = ws.getRow(r).getCell(analysis.mapping[f.key]);
    let value = data[f.key];
    if (dateKeys.has(f.key) && value) {
      value = toExcelDate(value, false);
      cell.numFmt = 'mm/dd/yyyy';
    } else if (f.key === 'age' && hasValue(value)) value = Number(value);
    else value = excelCellValue(value);
    cell.value = value;
  }
  try { await wb.xlsx.writeFile(filePath); }
  catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error('The tracking workbook appears to be open in Excel. Close it and try again.');
    throw err;
  }
  return { rowNumber: r, workbookPath: filePath, worksheet: analysis.worksheet };
}

async function deleteInitialTracking(rowNumber) {
  const filePath = currentInitialWorkbookPath();
  const analysis = await analyzeInitialWorkbook(filePath);
  await backupInitialWorkbook(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(analysis.worksheet);
  const r = Number(rowNumber);
  if (!Number.isInteger(r) || r <= analysis.headerRow || r > ws.rowCount) throw new Error('Tracking row was not found.');
  const patientName = initialPlainValue(ws.getRow(r).getCell(analysis.mapping.patientName).value);
  if (!patientName) throw new Error('Tracking row was not found.');
  // Remove the actual Excel row so the patient disappears from the monthly tracking sheet.
  ws.spliceRows(r, 1);
  try { await wb.xlsx.writeFile(filePath); }
  catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error('The tracking workbook appears to be open in Excel. Close it and try again.');
    throw err;
  }
  return { deleted: true, patientName, workbookPath: filePath, worksheet: analysis.worksheet };
}

function cleanPdfText(v) { return String(v ?? '').replace(/[\r\n]+/g, ' ').trim(); }
function drawTextFit(page, text, x, y, maxWidth, opts={}) {
  if (!text) return;
  const font = opts.font;
  let size = opts.size || 9;
  let t = cleanPdfText(text);
  while (size > 6 && font.widthOfTextAtSize(t, size) > maxWidth) size -= 0.4;
  page.drawText(t, { x, y, size, font, color: rgb(0,0,0) });
}
function drawMultiline(page, text, x, yTop, width, height, opts={}) {
  if (!text) return;
  const font = opts.font; const size = opts.size || 8.5; const lineHeight = opts.lineHeight || 10.5;
  const words = String(text).replace(/\r/g,'').split(/\s+/); const lines=[]; let cur='';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test,size) <= width) cur=test; else { if(cur) lines.push(cur); cur=w; }
  }
  if(cur) lines.push(cur);
  const maxLines=Math.floor(height/lineHeight);
  lines.slice(0,maxLines).forEach((line,i)=>page.drawText(line,{x,y:yTop-i*lineHeight,size,font,color:rgb(0,0,0)}));
}
function drawCheck(page, checked, x, y, font) { if (checked) page.drawText('X',{x,y,size:9,font,color:rgb(0,0,0)}); }
function formatPdfDate(v) { if(!v) return ''; const [y,m,d]=String(v).slice(0,10).split('-'); return y&&m&&d?`${m}/${d}/${y}`:String(v); }
function formatPdfTime(v) {
  if (!v) return '';
  const x = String(v).trim();
  let m = x.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    let h = Number(m[1]), min = Number(m[2]);
    if (h < 1 || h > 12 || min < 0 || min > 59) return x;
    return `${h}:${String(min).padStart(2,'0')} ${m[3].toUpperCase()}`;
  }
  m = x.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return x;
  const hh = Number(m[1]), min = Number(m[2]);
  if (hh < 0 || hh > 23 || min < 0 || min > 59) return x;
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h = hh % 12 || 12;
  return `${h}:${String(min).padStart(2,'0')} ${ap}`;
}

async function generateInitialPdf(formData, outputPath) {
  const template = app.isPackaged
    ? path.join(process.resourcesPath, 'template', 'Initial_Contact_Form_2026.pdf')
    : path.join(appRoot(), 'assets', 'Initial_Contact_Form_2026.pdf');
  const bytes = await fsp.readFile(template);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // The clinic template contains default values in a few interactive fields
  // (for example Grade, Exam Type and Credit Card Type). Clear those defaults
  // before flattening so our generated values never overlap the template values.
  try {
    const form = pdf.getForm();
    for (const field of form.getFields()) {
      try {
        if (typeof field.setText === 'function') field.setText('');
        else if (typeof field.uncheck === 'function') field.uncheck();
        else if (typeof field.clear === 'function') field.clear();
      } catch {}
    }
    form.flatten();
  } catch {}
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages(); const p1=pages[0], p2=pages[1], p3=pages[2];
  // Page 1 demographics
  drawTextFit(p1, formatPdfDate(formData.date), 70, 635, 70, {font,size:10.5});
  drawTextFit(p1, formData.patientName, 213, 635, 242, {font,size:10.5});
  drawTextFit(p1, formData.age, 497, 651, 55, {font,size:11});
  drawTextFit(p1, formatPdfDate(formData.dob), 497, 629, 95, {font,size:10.5});
  drawTextFit(p1, formData.parentName, 113, 610, 232, {font,size:10.5});
  drawTextFit(p1, formData.phone, 401, 607, 145, {font,size:10.5});
  drawTextFit(p1, formData.email, 116, 582, 247, {font,size:10});
  drawTextFit(p1, formData.grade, 483, 582, 68, {font,size:11});
  drawTextFit(p1, formData.referralSource, 274, 552, 292, {font,size:10});
  // Doctor referral checkboxes
  drawCheck(p1, formData.doctorAmblyopia, 238, 483, font);
  drawCheck(p1, formData.doctorStrabismus, 296, 483, font);
  drawCheck(p1, formData.doctorConvergence, 410, 484, font);
  drawCheck(p1, formData.glassesContacts === 'Yes', 302, 469, font);
  drawCheck(p1, formData.glassesContacts === 'No', 334, 469, font);
  drawCheck(p1, formData.newRx === 'Yes', 190, 454, font);
  drawCheck(p1, formData.newRx === 'No', 223, 454, font);
  drawMultiline(p1, formData.doctorNotes, 76, 438, 485, 58, {font,size:9.5,lineHeight:11});
  const symptomPos = {
    school: [36,305], blurry:[35,290], close:[35,276], academic:[35,263], trauma:[35,246],
    losing:[201,304], amblyopia:[201,290], blinking:[202,274], reversals:[202,260], special:[203,245],
    tired:[362,303], headaches:[362,290], adhd:[362,277], bumping:[363,262], comprehension:[361,244], covers:[467,303]
  };
  for (const [k,pos] of Object.entries(symptomPos)) drawCheck(p1, !!formData[`sym_${k}`], pos[0], pos[1], font);
  drawMultiline(p1, formData.nonDoctorNotes, 76, 214, 462, 62, {font,size:9.5,lineHeight:11});
  // Page 2 appointment fields
  if (formData.youngExamType) drawTextFit(p2, formData.youngExamType, 104, 635, 95, {font,size:10.5});
  drawTextFit(p2, formatPdfDate(formData.youngExamDate), 239, 634, 104, {font,size:10.5});
  drawTextFit(p2, formatPdfTime(formData.youngExamTime), 370, 634, 196, {font,size:10.5});
  drawCheck(p2, !!formData.youngWaitingList, 461, 614, font);
  if (formData.doctor === 'Dr. McDermed') drawCheck(p2,true,188,452,font);
  if (formData.doctor === 'Dr. Chi') drawCheck(p2,true,319,453,font);
  drawTextFit(p2, formData.devExamType, 108, 439, 90, {font,size:10.5});
  drawTextFit(p2, formatPdfDate(formData.devExamDate), 239, 438, 96, {font,size:10.5});
  drawTextFit(p2, formatPdfTime(formData.devExamTime), 370, 438, 196, {font,size:10.5});
  drawTextFit(p2, formatPdfDate(formData.parentMeetingDate), 239, 422, 96, {font,size:10.5});
  drawTextFit(p2, formatPdfTime(formData.parentMeetingTime), 370, 422, 196, {font,size:10.5});
  drawCheck(p2, !!formData.devWaitingList, 465, 403, font);
  drawTextFit(p2, formData.email, 259, 343, 100, {font,size:9.5});
  drawTextFit(p2, formData.cardType, 52, 243, 68, {font,size:10});
  drawTextFit(p2, formData.cardNumber, 179, 243, 212, {font,size:10});
  drawTextFit(p2, formData.cardExpiration, 468, 243, 75, {font,size:10});
  drawTextFit(p2, formData.cardholderName, 48, 191, 145, {font,size:10});
  drawTextFit(p2, formData.cardZip, 238, 191, 143, {font,size:10});
  drawTextFit(p2, formData.cardCode, 455, 191, 78, {font,size:10});
  drawTextFit(p3, formData.vtCostPerSession, 460, 488, 32, {font,size:10});
  const outBytes = await pdf.save();
  await fsp.writeFile(outputPath, outBytes);
}

ipcMain.handle('initial:info', async () => initialWorkbookInfo());
ipcMain.handle('initial:choose-workbook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties:['openFile'], filters:[{name:'Excel Workbooks',extensions:['xlsx']}] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const analysis = await analyzeInitialWorkbook(filePath);
  return { filePath, analysis };
});
ipcMain.handle('initial:connect-workbook', async (_, filePath) => {
  const analysis = await analyzeInitialWorkbook(filePath);
  const missing = INITIAL_FIELDS.filter(f=>!analysis.mapping[f.key]).map(f=>f.label);
  if (missing.length) throw new Error(`This workbook cannot be connected yet. Missing columns: ${missing.join(', ')}.`);
  await saveInitialSettings({ workbookPath:filePath, worksheet:analysis.worksheet, headerRow:analysis.headerRow, connectedAt:new Date().toISOString() });
  return initialWorkbookInfo();
});
ipcMain.handle('initial:use-simulation', async () => {
  try { await fsp.unlink(initialSettingsPath()); } catch {}
  return initialWorkbookInfo();
});
ipcMain.handle('initial:list-tracking', async () => listInitialTracking());
ipcMain.handle('initial:get-tracking', async (_, rowNumber) => getInitialTrackingRecord(rowNumber));
ipcMain.handle('initial:update-tracking', (_, rowNumber, data) => queueWrite(() => updateInitialTracking(rowNumber, data)));
ipcMain.handle('initial:delete-tracking', (_, rowNumber) => queueWrite(() => deleteInitialTracking(rowNumber)));
ipcMain.handle('initial:generate-pdf', async (_, formData) => {
  if (!String(formData.patientName||'').trim()) throw new Error('Patient Name is required.');
  const baseName = `${sanitizeName(formData.patientName)}_${formData.date || new Date().toISOString().slice(0,10)}_Initial_Contact.pdf`;
  const localPath = path.join(initialFormsDir(), baseName);
  const save = await dialog.showSaveDialog(mainWindow, { title:'Save Initial Contact PDF', defaultPath:baseName, filters:[{name:'PDF Document',extensions:['pdf']}] });
  if (save.canceled || !save.filePath) return null;
  await generateInitialPdf(formData, localPath);
  if (path.resolve(save.filePath) !== path.resolve(localPath)) await fsp.copyFile(localPath, save.filePath);
  return { localPath, exportedPath:save.filePath, filename:baseName };
});
// Generate a PDF for every child, in one chosen directory, without replacing existing files.
ipcMain.handle('initial:generate-family-pdfs', async (_, patients) => {
  const Family = require('./initial-family');
  Family.collectNames(patients);
  if (patients.length < 2) throw new Error('Add a sibling before using the family export.');
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder for sibling Initial Contact PDFs',
    properties: ['openDirectory', 'createDirectory']
  });
  if (picked.canceled || !picked.filePaths?.[0]) return null;
  const directory = picked.filePaths[0];
  const files = [];
  const created = [];
  try {
    for (const patient of patients) {
      const stem = `${sanitizeName(patient.patientName)}_${String(patient.date || new Date().toISOString().slice(0,10)).replace(/[^0-9-]/g, '')}_Initial_Contact`;
      let filename = `${stem}.pdf`, n = 2;
      while (fs.existsSync(path.join(directory, filename))) filename = `${stem}_${n++}.pdf`;
      const exportedPath = path.join(directory, filename);
      // This path is never reused or overwritten; if export fails no partial files remain.
      await generateInitialPdf(patient, exportedPath);
      created.push(exportedPath);
      files.push({ patientName: patient.patientName, localPath: exportedPath, exportedPath, filename });
    }
    return { files, directory };
  } catch (err) {
    await Promise.all(created.map(f => fsp.unlink(f).catch(() => {})));
    throw err;
  }
});

ipcMain.handle('initial:save-family-tracking', (_, records) =>
  queueWrite(() => appendInitialFamilyTracking(records)));

ipcMain.handle('initial:open-pdf', async (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Generated PDF was not found.');
  const result=await shell.openPath(filePath); if(result) throw new Error(result); return true;
});
ipcMain.handle('initial:save-tracking', (_, data) => queueWrite(() => appendInitialTracking(data)));


// ---------------- Exam Cancellations ----------------
const CANCELLATION_FIELDS = [
  { key:'patientName', label:'Patient Name', aliases:['patient name','patient'] },
  { key:'age', label:'Age', aliases:['age'] },
  { key:'referralSource', label:'Referral Source', aliases:['referral source','referred by','referrer'] },
  { key:'examType', label:'Exam Type', aliases:['exam type','appointment type'] },
  { key:'originalAppointmentDate', label:'Original Appointment Date', aliases:['original appointment date','appointment date','original exam date'] },
  { key:'cancellationDate', label:'Cancellation / No-Show Date', aliases:['cancellation / no-show date','cancellation date','no-show date','cancel date'] },
  { key:'eventType', label:'Event Type', aliases:['event type','cancellation type','cancel / no-show','cancel/no-show'] },
  { key:'cancellationReason', label:'Cancellation Reason', aliases:['cancellation reason','reason for cancellation','reason'] },
  { key:'secondOccurrence', label:'Second Cancellation / No-Show?', aliases:['second cancellation / no-show?','second cancellation / no-show','second occurrence?','second occurrence'] },
  { key:'rescheduled', label:'Rescheduled?', aliases:['rescheduled?','rescheduled'] },
  { key:'newAppointmentDate', label:'New Appointment Date', aliases:['new appointment date','rescheduled date','new exam date'] },
  { key:'followUpStatus', label:'Follow-Up Status', aliases:['follow-up status','follow up status','status'] },
  { key:'lastFollowUpDate', label:'Last Follow-Up Date', aliases:['last follow-up date','last follow up date','follow-up date','follow up date'] },
  { key:'followUpNotes', label:'Follow-Up Notes', aliases:['follow-up notes','follow up notes','notes'] },
  { key:'attempt1At', label:'1st Contact - Date/Time', aliases:['1st contact - date/time'] },
  { key:'attempt1Comment', label:'1st Contact - Comment', aliases:['1st contact - comment'] },
  { key:'attempt2At', label:'2nd Contact - Date/Time', aliases:['2nd contact - date/time'] },
  { key:'attempt2Comment', label:'2nd Contact - Comment', aliases:['2nd contact - comment'] },
  { key:'attempt3At', label:'3rd Contact - Date/Time', aliases:['3rd contact - date/time'] },
  { key:'attempt3Comment', label:'3rd Contact - Comment', aliases:['3rd contact - comment'] },
  { key:'closureReason', label:'Closure Reason', aliases:['closure reason'] },
  { key:'closedAt', label:'Closed At', aliases:['closed at'] }
];
const CANCELLATION_DATE_KEYS = new Set(['originalAppointmentDate','cancellationDate','newAppointmentDate','lastFollowUpDate']);
const CANCELLATION_NEW_FIELDS=CANCELLATION_FIELDS.slice(14);
const CancellationFlow=require('./v224-workflows');
function getCancellationSettings(){ try{return JSON.parse(fs.readFileSync(cancellationSettingsPath(),'utf8'));}catch{return null;} }
async function saveCancellationSettings(settings){ await fsp.writeFile(cancellationSettingsPath(),JSON.stringify(settings,null,2),'utf8'); }
async function analyzeCancellationWorkbook(filePath){
  if(!filePath||!fs.existsSync(filePath)) throw new Error('Excel workbook was not found.');
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath); let best=null;
  wb.eachSheet(ws=>{
    const maxRows=Math.min(Math.max(ws.rowCount,1),80);
    for(let r=1;r<=maxRows;r++){
      const row=ws.getRow(r), mapping={}, headers=[];
      for(let c=1;c<=Math.max(ws.columnCount,1);c++){
        let raw=row.getCell(c).value; if(raw&&typeof raw==='object'&&raw.text)raw=raw.text;
        const text=String(raw??'').trim(); headers.push({col:c,text}); const norm=normalizeHeader(text);
        for(const f of CANCELLATION_FIELDS){ if(!mapping[f.key]&&f.aliases.some(a=>norm===normalizeHeader(a))) mapping[f.key]=c; }
      }
      const score=Object.keys(mapping).length;
      if(!best||score>best.score) best={worksheet:ws.name,headerRow:r,mapping,headers:headers.filter(h=>h.text),score};
    }
  });
  if(!best) throw new Error('No worksheets were found in the selected workbook.');
  return best;
}
function currentCancellationWorkbookPath(){
  const settings=getCancellationSettings();
  if(settings?.workbookPath&&fs.existsSync(settings.workbookPath)) return settings.workbookPath;
  return cancellationSimulationPath();
}
async function cancellationWorkbookInfo(){
  const settings=getCancellationSettings(), workbook=currentCancellationWorkbookPath();
  const analysis=await analyzeCancellationWorkbook(workbook);
  return {workbookPath:workbook,usingSimulation:path.resolve(workbook)===path.resolve(cancellationSimulationPath()),analysis,configured:!!settings?.workbookPath};
}
async function backupCancellationWorkbook(filePath){
  if(!fs.existsSync(filePath))return;
  const stamp=new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14),base=path.basename(filePath,path.extname(filePath));
  await fsp.copyFile(filePath,path.join(cancellationBackupsDir(),`${sanitizeName(base)}_${stamp}_${crypto.randomBytes(3).toString('hex')}.xlsx`));
}
function cancellationState(rec){
  return CancellationFlow.cancellationState(rec);
}
// Append-only schema migration. Never reorder, remove, or populate historical records.
// Always back up the original file and validate the completed Excel before replacing it.
async function migrateCancellationWorkbook(filePath){
  const analysis=await analyzeCancellationWorkbook(filePath);
  if(!analysis.mapping.patientName || analysis.score<14) throw new Error('The selected cancellation workbook does not match the existing 14-column format. No migration was performed.');
  const missing=CANCELLATION_NEW_FIELDS.filter(f=>!analysis.mapping[f.key]);
  if(!missing.length)return {changed:false,added:[]};
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(filePath);
  const ws=wb.getWorksheet(analysis.worksheet);
  let c=Math.max(ws.columnCount,...analysis.headers.map(h=>h.col),0);
  for(const field of missing){
    c+=1;const cell=ws.getRow(analysis.headerRow).getCell(c);cell.value=field.label;
    const sample=ws.getRow(analysis.headerRow).getCell(analysis.mapping.followUpNotes||1);
    if(sample.style)cell.style=JSON.parse(JSON.stringify(sample.style));
    ws.getColumn(c).width=field.key.endsWith('Comment')?45:24;
  }
  // Serialize and test in a separate file; never risk overwriting a valid original on write failure.
  const temp=filePath+'.v224-'+process.pid+'.tmp.xlsx';
  try{
    await wb.xlsx.writeFile(temp);
    const verify=await analyzeCancellationWorkbook(temp);
    const absent=CANCELLATION_FIELDS.filter(f=>!verify.mapping[f.key]);
    if(absent.length)throw new Error('Migration verification failed: '+absent.map(f=>f.label).join(', '));
    await backupCancellationWorkbook(filePath);
    await fsp.rename(temp,filePath);
  }finally{await fsp.unlink(temp).catch(()=>{});}
  return {changed:true,added:missing.map(f=>f.label)};
}
async function ensureCancellationWorkbookSchema(filePath){
  return migrateCancellationWorkbook(filePath);
}

async function listCancellationTracking(){
  const filePath=currentCancellationWorkbookPath(); await ensureCancellationWorkbookSchema(filePath); const analysis=await analyzeCancellationWorkbook(filePath);
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath); const ws=wb.getWorksheet(analysis.worksheet), out=[];
  for(let r=analysis.headerRow+1;r<=ws.rowCount;r++){
    const patientCol=analysis.mapping.patientName; if(!patientCol) break;
    if(!hasValue(ws.getRow(r).getCell(patientCol).value))continue;
    const rec={_row:r};
    for(const f of CANCELLATION_FIELDS){ const col=analysis.mapping[f.key]; rec[f.key]=col?initialPlainValue(ws.getRow(r).getCell(col).value,CANCELLATION_DATE_KEYS.has(f.key)):''; }
    rec._state=cancellationState(rec); out.push(rec);
  }
  return {records:out,workbookPath:filePath,worksheet:analysis.worksheet,headerRow:analysis.headerRow};
}
async function getCancellationRecord(rowNumber){ const result=await listCancellationTracking(); return result.records.find(r=>r._row===Number(rowNumber))||null; }
function ensureCancellationSchema(analysis){
  const missing=CANCELLATION_FIELDS.filter(f=>!analysis.mapping[f.key]).map(f=>f.label);
  if(missing.length) throw new Error(`The selected spreadsheet is missing required columns: ${missing.join(', ')}.`);
}
function writeCancellationFields(row,analysis,data){
  for(const f of CANCELLATION_FIELDS){
    const cell=row.getCell(analysis.mapping[f.key]); let value=data[f.key];
    if(CANCELLATION_DATE_KEYS.has(f.key)&&value){ value=toExcelDate(value,false); cell.numFmt='mm/dd/yyyy'; }
    else if(f.key==='age'&&hasValue(value)) value=Number(value); else value=excelCellValue(value);
    cell.value=value;
  }
}
async function appendCancellation(data){
  const filePath=currentCancellationWorkbookPath();await ensureCancellationWorkbookSchema(filePath);const analysis=await analyzeCancellationWorkbook(filePath); ensureCancellationSchema(analysis); await backupCancellationWorkbook(filePath);
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath); const ws=wb.getWorksheet(analysis.worksheet); const patientCol=analysis.mapping.patientName;
  let lastUsed=analysis.headerRow; for(let r=analysis.headerRow+1;r<=Math.max(ws.rowCount,analysis.headerRow+1);r++){if(hasValue(ws.getRow(r).getCell(patientCol).value))lastUsed=r;}
  const target=lastUsed+1,sourceRow=target>analysis.headerRow+1?ws.getRow(target-1):null,row=ws.getRow(target);
  if(sourceRow){for(let c=1;c<=ws.columnCount;c++){try{row.getCell(c).style=JSON.parse(JSON.stringify(sourceRow.getCell(c).style||{}));row.getCell(c).numFmt=sourceRow.getCell(c).numFmt;}catch{}}row.height=sourceRow.height;}
  writeCancellationFields(row,analysis,data);
  try{await wb.xlsx.writeFile(filePath);}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The cancellations workbook appears to be open in Excel. Close it and try again.');throw err;}
  return {rowNumber:target,workbookPath:filePath,worksheet:analysis.worksheet};
}
async function updateCancellation(rowNumber,data){
  const filePath=currentCancellationWorkbookPath();await ensureCancellationWorkbookSchema(filePath);const analysis=await analyzeCancellationWorkbook(filePath); ensureCancellationSchema(analysis); await backupCancellationWorkbook(filePath);
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath); const ws=wb.getWorksheet(analysis.worksheet),r=Number(rowNumber);
  if(!Number.isInteger(r)||r<=analysis.headerRow||r>ws.rowCount)throw new Error('Cancellation row was not found.');
  const original=await getCancellationRecord(r);
  const merged={...original,...data};
  if(normalizeHeader(merged.rescheduled)==='yes' || normalizeHeader(merged.followUpStatus)==='rescheduled'){merged.followUpStatus='Rescheduled';merged.rescheduled='YES';merged.closureReason='Rescheduled';merged.closedAt=merged.closedAt||new Date().toISOString();}
  if(['will not reschedule','closed / not interested'].includes(normalizeHeader(merged.followUpStatus))){merged.followUpStatus='Will Not Reschedule';merged.closureReason='Will Not Reschedule';merged.closedAt=merged.closedAt||new Date().toISOString();}
  writeCancellationFields(ws.getRow(r),analysis,merged);
  try{await wb.xlsx.writeFile(filePath);}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The cancellations workbook appears to be open in Excel. Close it and try again.');throw err;}
  return {rowNumber:r,workbookPath:filePath,worksheet:analysis.worksheet};
}
async function addCancellationAttempt(rowNumber,payload){
  const record=await getCancellationRecord(rowNumber);
  if(!record)throw new Error('Cancellation record not found.');
  if(CancellationFlow.isCancellationClosed(record))throw new Error('This follow-up is already closed.');
  const attempt=CancellationFlow.nextCancellationAttempt(record);
  if(!attempt)throw new Error('All three attempts have been recorded.');
  const datetime=String(payload.contact_datetime||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetime)||Number.isNaN(Date.parse(datetime)))throw new Error('Please enter a valid contact date and time.');
  const patch={['attempt'+attempt+'At']:datetime,['attempt'+attempt+'Comment']:String(payload.comment||'').trim(),lastFollowUpDate:datetime.slice(0,10)};
  if(attempt===3){patch.followUpStatus='No Answer After 3 Attempts';patch.closureReason='No Answer After 3 Attempts';patch.closedAt=new Date().toISOString();}
  else patch.followUpStatus='Awaiting '+(attempt+1)+(attempt===1?'nd':'rd')+' Contact';
  return updateCancellation(rowNumber,patch);
}

async function deleteCancellation(rowNumber){
  const filePath=currentCancellationWorkbookPath(),analysis=await analyzeCancellationWorkbook(filePath); await backupCancellationWorkbook(filePath);
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath); const ws=wb.getWorksheet(analysis.worksheet),r=Number(rowNumber);
  if(!Number.isInteger(r)||r<=analysis.headerRow||r>ws.rowCount)throw new Error('Cancellation row was not found.');
  const patientName=initialPlainValue(ws.getRow(r).getCell(analysis.mapping.patientName).value); if(!patientName)throw new Error('Cancellation row was not found.');
  ws.spliceRows(r,1);
  try{await wb.xlsx.writeFile(filePath);}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The cancellations workbook appears to be open in Excel. Close it and try again.');throw err;}
  return {deleted:true,patientName};
}

ipcMain.handle('cancellations:info',async()=>cancellationWorkbookInfo());
ipcMain.handle('cancellations:choose-workbook',async()=>{const result=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Excel Workbooks',extensions:['xlsx']}]});if(result.canceled||!result.filePaths[0])return null;const filePath=result.filePaths[0];return {filePath,analysis:await analyzeCancellationWorkbook(filePath)};});
ipcMain.handle('cancellations:connect-workbook',async(_,filePath)=>{await ensureCancellationWorkbookSchema(filePath);const analysis=await analyzeCancellationWorkbook(filePath);ensureCancellationSchema(analysis);await saveCancellationSettings({workbookPath:filePath,worksheet:analysis.worksheet,headerRow:analysis.headerRow,connectedAt:new Date().toISOString()});return cancellationWorkbookInfo();});
ipcMain.handle('cancellations:use-simulation',async()=>{try{await fsp.unlink(cancellationSettingsPath());}catch{}return cancellationWorkbookInfo();});
ipcMain.handle('cancellations:list',async()=>listCancellationTracking());
ipcMain.handle('cancellations:get',async(_,rowNumber)=>getCancellationRecord(rowNumber));
ipcMain.handle('cancellations:create',(_,data)=>queueWrite(()=>appendCancellation(data)));
ipcMain.handle('cancellations:update',(_,rowNumber,data)=>queueWrite(()=>updateCancellation(rowNumber,data)));
ipcMain.handle('cancellations:add-contact',(_,rowNumber,payload)=>queueWrite(()=>addCancellationAttempt(rowNumber,payload)));
ipcMain.handle('cancellations:delete',(_,rowNumber)=>queueWrite(()=>deleteCancellation(rowNumber)));


function localTodayISO(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
// ---------------- New Patient Setup ----------------
function isAmblyopiaStrabismus(formData){
  if(!formData) return 'No';
  if(String(formData.amblyopiaStrabismus||'').toLowerCase()==='yes'||formData.amblyopiaStrabismus===true) return 'Yes';
  if(formData.doctorAmblyopia||formData.doctorStrabismus||formData.sym_amblyopia) return 'Yes';
  return 'No';
}

const SETUP_FIELDS = [
  { key:'initialContactDate', label:'Initial Contact Date' },
  { key:'patientName', label:'Patient Name' },
  { key:'age', label:'Age' },
  { key:'dob', label:'DOB' },
  { key:'parentName', label:'Parent Name' },
  { key:'phone', label:'Phone' },
  { key:'email', label:'Email' },
  { key:'grade', label:'Grade' },
  { key:'referralSource', label:'Referral Source' },
  { key:'examType', label:'Exam Type' },
  { key:'examDate', label:'Exam Date' },
  { key:'examTime', label:'Exam Time' },
  { key:'parentMeetingDate', label:'Parent Meeting Date' },
  { key:'parentMeetingTime', label:'Parent Meeting Time' },
  { key:'addPatientCrystal', label:'Add Patient to Crystal' },
  { key:'schedulePatientCrystal', label:'Schedule Patient on Crystal' },
  { key:'sendInitialEmail', label:'Send Initial Email' },
  { key:'notes', label:'Notes' },
  { key:'scheduledOn', label:'Scheduled On' },
  { key:'amblyopiaStrabismus', label:'Amblyopia/Strabismus' }
];
const SETUP_DATE_KEYS = new Set(['initialContactDate','dob','examDate','parentMeetingDate','scheduledOn']);
async function migrateSetupWorkbook(){
  const filePath=setupWorkbookPath();if(!fs.existsSync(filePath))return false;
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(filePath);const ws=wb.getWorksheet('New Patient Setup')||wb.worksheets[0];
  if(!ws)throw new Error('Missing New Patient Setup worksheet.');
  const existingHeaders = new Set();
  for(let c=1;c<=ws.columnCount;c++){
    const val=String(ws.getCell(1,c).value||'').trim();
    if(val) existingHeaders.add(val);
  }
  let changed = false;
  if(!existingHeaders.has('Scheduled On')){
    let last=0;
    for(let c=1;c<=ws.columnCount;c++){if(ws.getCell(1,c).value)last=c;}
    const c=last+1;
    ws.getCell(1,c).value='Scheduled On';
    const prevStyle=ws.getCell(1,last).style;
    if(prevStyle) ws.getCell(1,c).style=JSON.parse(JSON.stringify(prevStyle));
    ws.getColumn(c).width=18;
    existingHeaders.add('Scheduled On');
    changed = true;
  }
  if(!existingHeaders.has('Amblyopia/Strabismus')){
    let last=0;
    for(let c=1;c<=ws.columnCount;c++){if(ws.getCell(1,c).value)last=c;}
    const c=last+1;
    ws.getCell(1,c).value='Amblyopia/Strabismus';
    const prevStyle=ws.getCell(1,last).style;
    if(prevStyle) ws.getCell(1,c).style=JSON.parse(JSON.stringify(prevStyle));
    ws.getColumn(c).width=22;
    existingHeaders.add('Amblyopia/Strabismus');
    changed = true;
  }
  if(!changed) return false;
  const temp=filePath+'.v227-'+process.pid+'.tmp.xlsx';
  try{
    await wb.xlsx.writeFile(temp);
    const check=new ExcelJS.Workbook();await check.xlsx.readFile(temp);
    const checkWs=check.worksheets[0];
    const checkHeaders=new Set();
    for(let c=1;c<=checkWs.columnCount;c++) checkHeaders.add(String(checkWs.getCell(1,c).value||'').trim());
    if(!checkHeaders.has('Amblyopia/Strabismus'))throw new Error('Amblyopia/Strabismus migration verification failed');
    await backupSetupWorkbook();await fsp.rename(temp,filePath);
  }finally{await fsp.unlink(temp).catch(()=>{});}
  return true;
}
async function backupSetupWorkbook(){
  if(!fs.existsSync(setupWorkbookPath())) return;
  const stamp=new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,17);
  await fsp.copyFile(setupWorkbookPath(),path.join(setupBackupsDir(),`New_Patient_Setup_${stamp}_${crypto.randomBytes(3).toString('hex')}.xlsx`));
}
async function loadSetupWorkbook(){
  await ensureDataFiles(); await migrateSetupWorkbook();
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(setupWorkbookPath());
  const ws=wb.getWorksheet('New Patient Setup')||wb.worksheets[0];
  if(!ws) throw new Error('New Patient Setup workbook is missing its worksheet.');
  const headerMap={};
  for(let c=1;c<=ws.columnCount;c++) headerMap[String(ws.getCell(1,c).value||'').trim()]=c;
  const missing=SETUP_FIELDS.filter(f=>!headerMap[f.label]).map(f=>f.label);
  if(missing.length) throw new Error(`New Patient Setup workbook is missing columns: ${missing.join(', ')}.`);
  return {wb,ws,headerMap};
}
function setupState(rec){
  const done=['addPatientCrystal','schedulePatientCrystal','sendInitialEmail'].every(k=>normalizeHeader(rec[k])==='yes');
  return done?'Completed':'Needs Setup';
}
async function listSetupRecords(){
  const {ws,headerMap}=await loadSetupWorkbook(); const out=[];
  for(let r=2;r<=ws.rowCount;r++){
    if(!hasValue(ws.getCell(r,headerMap['Patient Name']).value)) continue;
    const rec={_row:r};
    for(const f of SETUP_FIELDS){rec[f.key]=initialPlainValue(ws.getCell(r,headerMap[f.label]).value,SETUP_DATE_KEYS.has(f.key));}
    rec._state=setupState(rec); out.push(rec);
  }
  return {records:out,workbookPath:setupWorkbookPath(),worksheet:ws.name};
}
async function getSetupRecord(rowNumber){const x=await listSetupRecords();return x.records.find(r=>r._row===Number(rowNumber))||null;}
function setupPayloadFromInitial(formData){
  const examDate=formData.devExamDate||formData.youngExamDate||'';
  const examTime=formData.devExamTime||formData.youngExamTime||'';
  const examType=formData.devExamType||formData.youngExamType||'';
  return {
    initialContactDate:formData.date||'', patientName:formData.patientName||'', age:formData.age||'', dob:formData.dob||'',
    parentName:formData.parentName||'', phone:formData.phone||'', email:formData.email||'', grade:formData.grade||'', referralSource:formData.referralSource||'',
    examType, examDate, examTime, parentMeetingDate:formData.parentMeetingDate||'', parentMeetingTime:formData.parentMeetingTime||'',
    addPatientCrystal:'', schedulePatientCrystal:'', sendInitialEmail:'', notes:'', scheduledOn:localTodayISO(),
    amblyopiaStrabismus: isAmblyopiaStrabismus(formData)
  };
}
async function appendSetupRecord(data){
  const {wb,ws,headerMap}=await loadSetupWorkbook();
  // Prevent accidental duplicates when a save is retried.
  for(let r=2;r<=ws.rowCount;r++){
    const name=normalizeHeader(initialPlainValue(ws.getCell(r,headerMap['Patient Name']).value));
    const dob=initialPlainValue(ws.getCell(r,headerMap['DOB']).value,true);
    if(name===normalizeHeader(data.patientName)&&(!data.dob||dob===data.dob)) {
      // An older setup record may have been created before the scheduling date was captured.
      // When it is saved again from a newly completed Initial Contact, capture today's confirmation.
      let updated = false;
      const onCell=ws.getCell(r,headerMap['Scheduled On']);
      if(onCell && !hasValue(onCell.value)) {onCell.value=toExcelDate(localTodayISO(),false);onCell.numFmt='mm/dd/yyyy';updated=true;}
      if(headerMap['Amblyopia/Strabismus'] && data.amblyopiaStrabismus) {
        const ambCell=ws.getCell(r,headerMap['Amblyopia/Strabismus']);
        if(!hasValue(ambCell.value) || data.amblyopiaStrabismus === 'Yes') {
          ambCell.value = data.amblyopiaStrabismus;
          updated = true;
        }
      }
      if(updated) {await backupSetupWorkbook();await wb.xlsx.writeFile(setupWorkbookPath());}
      return {rowNumber:r,workbookPath:setupWorkbookPath(),worksheet:ws.name,existing:true};
    }
  }
  await backupSetupWorkbook();
  if(!data.scheduledOn)data={...data,scheduledOn:localTodayISO()};
  if(!data.amblyopiaStrabismus)data={...data,amblyopiaStrabismus:isAmblyopiaStrabismus(data)};
  let target=ws.rowCount+1;
  while(target>2&&!hasValue(ws.getCell(target-1,headerMap['Patient Name']).value)) target--;
  if(target<2) target=2;
  const row=ws.getRow(target);
  for(const f of SETUP_FIELDS){
    const cell=row.getCell(headerMap[f.label]); let value=data[f.key];
    if(SETUP_DATE_KEYS.has(f.key)&&value){value=toExcelDate(value,false);cell.numFmt='mm/dd/yyyy';}
    else if(f.key==='age'&&hasValue(value)) value=Number(value);
    else value=excelCellValue(value);
    cell.value=value;
  }
  try{await wb.xlsx.writeFile(setupWorkbookPath());}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The New Patient Setup workbook is open in Excel. Close it and try again.');throw err;}
  return {rowNumber:target,workbookPath:setupWorkbookPath(),worksheet:ws.name,existing:false};
}
async function updateSetupRecord(rowNumber,data){
  const {wb,ws,headerMap}=await loadSetupWorkbook(); const r=Number(rowNumber);
  if(!Number.isInteger(r)||r<2||r>ws.rowCount) throw new Error('New Patient Setup row was not found.');
  await backupSetupWorkbook();
  for(const f of SETUP_FIELDS){
    if(!(f.key in data)) continue;
    const cell=ws.getCell(r,headerMap[f.label]); let value=data[f.key];
    if(SETUP_DATE_KEYS.has(f.key)&&value){value=toExcelDate(value,false);cell.numFmt='mm/dd/yyyy';}
    else if(f.key==='age'&&hasValue(value)) value=Number(value); else value=excelCellValue(value);
    cell.value=value;
  }
  await wb.xlsx.writeFile(setupWorkbookPath()); return {rowNumber:r};
}
async function deleteSetupRecord(rowNumber){
  const {wb,ws}=await loadSetupWorkbook(); const r=Number(rowNumber); if(!Number.isInteger(r)||r<2||r>ws.rowCount) throw new Error('New Patient Setup row was not found.');
  await backupSetupWorkbook(); ws.spliceRows(r,1); await wb.xlsx.writeFile(setupWorkbookPath()); return {deleted:true};
}
ipcMain.handle('setup:list',async()=>listSetupRecords());
ipcMain.handle('setup:get',async(_,rowNumber)=>getSetupRecord(rowNumber));
ipcMain.handle('setup:add-from-initial',(_,formData)=>queueWrite(()=>appendSetupRecord(setupPayloadFromInitial(formData))));
ipcMain.handle('setup:add',(_,data)=>queueWrite(()=>appendSetupRecord(data)));
ipcMain.handle('setup:update',(_,rowNumber,data)=>queueWrite(()=>updateSetupRecord(rowNumber,data)));
ipcMain.handle('setup:delete',(_,rowNumber)=>queueWrite(()=>deleteSetupRecord(rowNumber)));
ipcMain.handle('setup:open-workbook',async()=>{const result=await shell.openPath(setupWorkbookPath());if(result)throw new Error(result);return true;});
ipcMain.handle('app:copy-text',async(_,text)=>{clipboard.writeText(String(text??''));return true;});
ipcMain.handle('app:copy-rich',async(_,payload={})=>{const text=String(payload.text??'');const html=String(payload.html??'');clipboard.write({text,html});return true;});

// ---------------- Initial Contact sidecar data for New Patient Setup ----------------
function setupFormSignature(rec={}) {
  return [normalizeHeader(rec.patientName), String(rec.dob||''), String(rec.initialContactDate||'')].join('|');
}
async function readSetupFormStore(){
  try { return JSON.parse(await fsp.readFile(setupFormDataPath(),'utf8')); }
  catch { return { entries: [] }; }
}
async function writeSetupFormStore(store){
  await fsp.mkdir(setupDir(),{recursive:true});
  await fsp.writeFile(setupFormDataPath(),JSON.stringify(store,null,2),'utf8');
}
async function getSetupFormData(rowNumber){
  const rec=await getSetupRecord(rowNumber); if(!rec) return null;
  const store=await readSetupFormStore(); const sig=setupFormSignature(rec);
  const found=(store.entries||[]).find(x=>x.signature===sig);
  return found?.formData||null;
}
async function saveSetupFormData(rowNumber,formData){
  const rec=await getSetupRecord(rowNumber); if(!rec) throw new Error('New Patient Setup row was not found.');
  const store=await readSetupFormStore(); if(!Array.isArray(store.entries)) store.entries=[];
  const sig=setupFormSignature(rec); const now=new Date().toISOString();
  const idx=store.entries.findIndex(x=>x.signature===sig);
  const entry={signature:sig,patientName:rec.patientName||'',dob:rec.dob||'',initialContactDate:rec.initialContactDate||'',updatedAt:now,formData:{...formData}};
  if(idx>=0) store.entries[idx]=entry; else store.entries.push(entry);
  await writeSetupFormStore(store); return {saved:true};
}
ipcMain.handle('setup:get-form-data',(_,rowNumber)=>getSetupFormData(rowNumber));
ipcMain.handle('setup:save-form-data',(_,rowNumber,formData)=>queueWrite(()=>saveSetupFormData(rowNumber,formData)));

// ---------------- Schedule Incomplete ----------------
const INCOMPLETE_FOLLOWUP_HEADER='Follow-Up Notes';
const INCOMPLETE_AMBLYOPIA_HEADER='Amblyopia/Strabismus';
const INCOMPLETE_HEADERS=['Date','Patient Name','Age','DOB','Parent Name','Phone','Email','Grade','Referral Source','Amblyopia/Strabismus','Status','Comments','Last Updated','Form Data JSON'];
async function backupIncompleteWorkbook(){
  if(!fs.existsSync(incompleteWorkbookPath())) return;
  const stamp=new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,17);
  await fsp.copyFile(incompleteWorkbookPath(),path.join(incompleteBackupsDir(),`Schedule_Incomplete_${stamp}.xlsx`));
}
async function ensureIncompleteAmblyopiaColumn(wb,ws,headerMap){
  if(headerMap[INCOMPLETE_AMBLYOPIA_HEADER])return true;
  try{
    await backupIncompleteWorkbook();
    let last=0;for(const k of Object.keys(headerMap)){if(k)last=Math.max(last,headerMap[k]);}
    const col=last+1,src=ws.getCell(1,headerMap['Form Data JSON']||headerMap['Comments']||last),cell=ws.getCell(1,col);
    cell.value=INCOMPLETE_AMBLYOPIA_HEADER;
    if(src&&src.style)cell.style=JSON.parse(JSON.stringify(src.style));
    ws.getColumn(col).width=22;
    const jsonCol=headerMap['Form Data JSON'];
    if(jsonCol){
      for(let r=2;r<=ws.rowCount;r++){
        const rowCell=ws.getCell(r,col);
        if(!hasValue(rowCell.value)){
          try{
            const fData=JSON.parse(initialPlainValue(ws.getCell(r,jsonCol).value)||'{}');
            rowCell.value=isAmblyopiaStrabismus(fData);
          }catch{
            rowCell.value='No';
          }
        }
      }
    }
    await wb.xlsx.writeFile(incompleteWorkbookPath());
    headerMap[INCOMPLETE_AMBLYOPIA_HEADER]=col;
    return true;
  }catch(err){console.error('Could not add the Amblyopia/Strabismus column to Schedule Incomplete:',err);return false;}
}
async function loadIncompleteWorkbook(){
  await ensureDataFiles(); const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(incompleteWorkbookPath());
  const ws=wb.getWorksheet('Schedule Incomplete')||wb.worksheets[0]; if(!ws) throw new Error('Schedule Incomplete workbook is missing its worksheet.');
  const headerMap={}; for(let c=1;c<=ws.columnCount;c++) headerMap[String(ws.getCell(1,c).value||'').trim()]=c;
  await ensureIncompleteAmblyopiaColumn(wb,ws,headerMap);
  const missing=INCOMPLETE_HEADERS.filter(h=>!headerMap[h]); if(missing.length) throw new Error(`Schedule Incomplete workbook is missing columns: ${missing.join(', ')}.`);
  await ensureIncompleteFollowUpColumn(wb,ws,headerMap);
  return {wb,ws,headerMap};
}
// "Follow-Up Notes" is optional: it is appended AFTER the last existing column (no column is moved, no row is touched),
// a backup is made first, and a failure (for example the file is open in Excel) never blocks the screen.
let incompleteFollowUpFailedAt=0;
async function ensureIncompleteFollowUpColumn(wb,ws,headerMap){
  if(headerMap[INCOMPLETE_FOLLOWUP_HEADER])return true;
  if(Date.now()-incompleteFollowUpFailedAt<60000)return false;
  try{
    await backupIncompleteWorkbook();
    let last=0;for(const k of Object.keys(headerMap)){if(k)last=Math.max(last,headerMap[k]);}
    const col=last+1,src=ws.getCell(1,headerMap['Form Data JSON']||last),cell=ws.getCell(1,col);
    cell.value=INCOMPLETE_FOLLOWUP_HEADER;
    if(src&&src.style)cell.style=JSON.parse(JSON.stringify(src.style));
    ws.getColumn(col).width=42;
    await wb.xlsx.writeFile(incompleteWorkbookPath());
    headerMap[INCOMPLETE_FOLLOWUP_HEADER]=col;
    return true;
  }catch(err){incompleteFollowUpFailedAt=Date.now();console.error('Could not add the Follow-Up Notes column:',err);return false;}
}
function incompleteRowToRecord(ws,headerMap,r){
  const val=(label,isDate=false)=>headerMap[label]?initialPlainValue(ws.getCell(r,headerMap[label]).value,isDate):'';
  let formData={}; try{formData=JSON.parse(val('Form Data JSON')||'{}')}catch{}
  const ambVal = headerMap[INCOMPLETE_AMBLYOPIA_HEADER] ? val(INCOMPLETE_AMBLYOPIA_HEADER) : '';
  const isAmb = ambVal || isAmblyopiaStrabismus(formData);
  return {_row:r,date:val('Date',true),patientName:val('Patient Name'),age:val('Age'),dob:val('DOB',true),parentName:val('Parent Name'),phone:val('Phone'),email:val('Email'),grade:val('Grade'),referralSource:val('Referral Source'),amblyopiaStrabismus:isAmb,status:val('Status')||'Incomplete',comments:val('Comments'),lastUpdated:val('Last Updated'),followUpAvailable:!!headerMap[INCOMPLETE_FOLLOWUP_HEADER],followUpNotes:headerMap[INCOMPLETE_FOLLOWUP_HEADER]?val(INCOMPLETE_FOLLOWUP_HEADER):'',formData};
}
async function listIncompleteRecords(){ const {ws,headerMap}=await loadIncompleteWorkbook(); const out=[]; for(let r=2;r<=ws.rowCount;r++){if(!hasValue(ws.getCell(r,headerMap['Patient Name']).value))continue;out.push(incompleteRowToRecord(ws,headerMap,r));} return {records:out,workbookPath:incompleteWorkbookPath(),worksheet:ws.name}; }
async function getIncompleteRecord(rowNumber){const x=await listIncompleteRecords();return x.records.find(r=>r._row===Number(rowNumber))||null;}
async function appendIncompleteRecord(formData,comments=''){
  const {wb,ws,headerMap}=await loadIncompleteWorkbook(); const name=String(formData.patientName||'').trim(); if(!name) throw new Error('Patient Name is required.');
  // Reuse an existing active record for the same patient/DOB instead of duplicating it.
  for(let r=2;r<=ws.rowCount;r++){
    const rec=incompleteRowToRecord(ws,headerMap,r);
    if(normalizeHeader(rec.patientName)===normalizeHeader(name)&&(!formData.dob||rec.dob===formData.dob)&&['incomplete','follow-up','no answer'].includes(normalizeHeader(rec.status))){
      return updateIncompleteRecord(r,{formData,comments:comments||rec.comments,status:rec.status});
    }
  }
  await backupIncompleteWorkbook(); const r=ws.rowCount+1; const now=new Date();
  const values={'Date':formData.date?toExcelDate(formData.date,false):now,'Patient Name':name,'Age':hasValue(formData.age)?Number(formData.age):null,'DOB':formData.dob?toExcelDate(formData.dob,false):null,'Parent Name':formData.parentName||'','Phone':formData.phone||'','Email':formData.email||'','Grade':formData.grade||'','Referral Source':formData.referralSource||'','Amblyopia/Strabismus':isAmblyopiaStrabismus(formData),'Status':'Follow-up','Comments':comments||'','Last Updated':now.toISOString(),'Form Data JSON':JSON.stringify(formData)};
  for(const h of INCOMPLETE_HEADERS){const cell=ws.getCell(r,headerMap[h]);cell.value=values[h]??null;if(['Date','DOB'].includes(h)&&cell.value instanceof Date)cell.numFmt='mm/dd/yyyy';}
  await wb.xlsx.writeFile(incompleteWorkbookPath()); return {rowNumber:r,workbookPath:incompleteWorkbookPath(),worksheet:ws.name};
}
async function updateIncompleteRecord(rowNumber,patch={}){
  const {wb,ws,headerMap}=await loadIncompleteWorkbook(); const r=Number(rowNumber); if(!Number.isInteger(r)||r<2||r>ws.rowCount)throw new Error('Schedule Incomplete row was not found.');
  const current=incompleteRowToRecord(ws,headerMap,r); const fallback={date:current.date,patientName:current.patientName,age:current.age,dob:current.dob,parentName:current.parentName,phone:current.phone,email:current.email,grade:current.grade,referralSource:current.referralSource}; const formData=patch.formData?{...fallback,...current.formData,...patch.formData}:current.formData; await backupIncompleteWorkbook();
  const set=(h,v)=>{ws.getCell(r,headerMap[h]).value=v===undefined?null:v};
  if(patch.status!==undefined){if(!['Follow-up','No Answer','Scheduled','Will Not Schedule','Incomplete'].includes(patch.status))throw new Error('Invalid Schedule Incomplete status.');set('Status',patch.status);} if(patch.comments!==undefined)set('Comments',patch.comments);
  if(patch.followUpNotes!==undefined){if(!headerMap[INCOMPLETE_FOLLOWUP_HEADER])throw new Error('The Follow-Up Notes column could not be created in the Schedule Incomplete workbook. Close the file if it is open in Excel and try again.');set(INCOMPLETE_FOLLOWUP_HEADER,patch.followUpNotes);}
  if(patch.formData){
    set('Date',formData.date?toExcelDate(formData.date,false):null);
    set('Patient Name',formData.patientName||'');
    set('Age',hasValue(formData.age)?Number(formData.age):null);
    set('DOB',formData.dob?toExcelDate(formData.dob,false):null);
    set('Parent Name',formData.parentName||'');
    set('Phone',formData.phone||'');
    set('Email',formData.email||'');
    set('Grade',formData.grade||'');
    set('Referral Source',formData.referralSource||'');
    if(headerMap[INCOMPLETE_AMBLYOPIA_HEADER]) set(INCOMPLETE_AMBLYOPIA_HEADER, isAmblyopiaStrabismus(formData));
    set('Form Data JSON',JSON.stringify(formData));
    ws.getCell(r,headerMap['Date']).numFmt='mm/dd/yyyy';
    ws.getCell(r,headerMap['DOB']).numFmt='mm/dd/yyyy';
  } else if(patch.amblyopiaStrabismus !== undefined && headerMap[INCOMPLETE_AMBLYOPIA_HEADER]) {
    set(INCOMPLETE_AMBLYOPIA_HEADER, patch.amblyopiaStrabismus);
  }
  set('Last Updated',new Date().toISOString()); await wb.xlsx.writeFile(incompleteWorkbookPath());
  if(patch.status==='Scheduled'){
    try{await markMatchingReferralScheduled({...formData,patientName:formData?.patientName||current.patientName,dob:formData?.dob||current.dob});}catch(err){console.error('Could not mark referral scheduled from incomplete:',err);}
  }
  return {rowNumber:r};
}
async function deleteIncompleteRecord(rowNumber){const {wb,ws}=await loadIncompleteWorkbook();const r=Number(rowNumber);if(!Number.isInteger(r)||r<2||r>ws.rowCount)throw new Error('Schedule Incomplete row was not found.');await backupIncompleteWorkbook();ws.spliceRows(r,1);await wb.xlsx.writeFile(incompleteWorkbookPath());return {deleted:true};}
ipcMain.handle('incomplete:list',async()=>listIncompleteRecords());
ipcMain.handle('incomplete:get',async(_,rowNumber)=>getIncompleteRecord(rowNumber));
ipcMain.handle('incomplete:add',(_,formData,comments)=>queueWrite(()=>appendIncompleteRecord(formData,comments)));
ipcMain.handle('incomplete:update',(_,rowNumber,patch)=>queueWrite(()=>updateIncompleteRecord(rowNumber,patch)));
ipcMain.handle('incomplete:delete',(_,rowNumber)=>queueWrite(()=>deleteIncompleteRecord(rowNumber)));
ipcMain.handle('incomplete:open-workbook',async()=>{const result=await shell.openPath(incompleteWorkbookPath());if(result)throw new Error(result);return true;});


// ---------------- Waitlist / Openings ----------------
const WAITLIST_SHEETS = {
  testings: {
    worksheet:'Testings',
    fields:[
      {key:'date',label:'Date',aliases:['date'],fallbackCol:1,type:'date'},
      {key:'patientName',label:'Patient Name',aliases:['patient name',"patient's name",'patients name'],fallbackCol:2},
      {key:'type',label:'Type',aliases:['type'],fallbackCol:3},
      {key:'doctor',label:'Doctor',aliases:['doctor','dr'],fallbackCol:4},
      {key:'dayTimePref',label:'Day/Time Pref',aliases:['day/time pref','day/time pref.','day time pref'],fallbackCol:5},
      {key:'dateScheduled',label:'Date Sched.',aliases:['date sched.','date sched','date scheduled'],fallbackCol:6,type:'dateOrText'},
      {key:'notes',label:'Notes',aliases:['notes','note'],fallbackCol:7}
    ]
  },
  pcs: {
    worksheet:"PC's",
    fields:[
      {key:'date',label:'Date',aliases:['date'],fallbackCol:1,type:'date'},
      {key:'patientName',label:"Patient's Name",aliases:["patient's name",'patient name','patients name'],fallbackCol:2},
      {key:'doctor',label:'Doctor',aliases:['doctor','dr'],fallbackCol:3},
      {key:'testingDate',label:'Testing Date',aliases:['testing date','testing date '],fallbackCol:4,type:'dateOrText'},
      {key:'pcDate',label:'PC Date',aliases:['pc date'],fallbackCol:5,type:'dateOrText'},
      {key:'note',label:'Note',aliases:['note','notes'],fallbackCol:6},
      {key:'contacted',label:'Contacted',aliases:['contacted'],fallbackCol:7}
    ]
  },
  followup: {
    worksheet:'Follow-up',
    fields:[
      {key:'date',label:'Date',aliases:['date'],fallbackCol:1,type:'date'},
      {key:'patientName',label:"Patient's Name",aliases:["patient's name",'patient name','patients name'],fallbackCol:2},
      {key:'type',label:'Type',aliases:['type'],fallbackCol:3},
      {key:'doctor',label:'Doctor',aliases:['doctor','dr'],fallbackCol:4},
      {key:'dayTimePref',label:'Day/Time Pref.',aliases:['day/time pref.','day/time pref','day time pref'],fallbackCol:5},
      {key:'dateScheduled',label:'Date scheduled',aliases:['date scheduled','date sched.','date sched'],fallbackCol:6,type:'dateOrText'},
      {key:'request',label:'Request',aliases:['request'],fallbackCol:7},
      {key:'notes',label:'Notes',aliases:['notes','note'],fallbackCol:8}
    ]
  },
  annuals: {
    worksheet:'Annuals',
    optional:true,
    fields:[
      {key:'date',label:'Date',aliases:['date'],fallbackCol:1,type:'dateOrText'},
      {key:'patientName',label:'Patient Name',aliases:['patient name',"patient's name",'patients name'],fallbackCol:2},
      {key:'doctor',label:'Doctor',aliases:['doctor','dr'],fallbackCol:3},
      {key:'due',label:'Due',aliases:['due'],fallbackCol:4},
      {key:'dateScheduled',label:'Date Sched.',aliases:['date sched.','date sched','date scheduled'],fallbackCol:5,type:'dateOrText'},
      {key:'notes',label:'Notes',aliases:['notes','note'],fallbackCol:6},
      {key:'offered',label:'Offered',aliases:['offered'],fallbackCol:7}
    ]
  }
};
function getWaitlistSheet(wb,baseCfg){const ws=wb.getWorksheet(baseCfg.worksheet);if(!ws)throw new Error(`The waitlist workbook has no "${baseCfg.worksheet}" worksheet.`);return ws;}
function normalizeWaitlistSection(section){return typeof section==='string'&&WAITLIST_SHEETS[section]?section:'testings';}
function readWaitlistSettings(){try{return JSON.parse(fs.readFileSync(waitlistSettingsPath(),'utf8'));}catch{return null;}}
async function writeWaitlistSettings(settings){await fsp.mkdir(waitlistDir(),{recursive:true});await fsp.writeFile(waitlistSettingsPath(),JSON.stringify(settings,null,2),'utf8');}
function waitlistPlain(v,isDate=false){
  if(v===null||v===undefined)return '';
  if(v instanceof Date)return isDate?serializeDate(v,false):String(v);
  if(isDate && typeof v==='string')return ClinicDates.toISODate(v)||v;
  if(v&&typeof v==='object'){
    if(typeof v.text==='string')return v.text;
    if(Array.isArray(v.richText))return v.richText.map(x=>x.text||'').join('');
    if(v.result!==undefined&&v.result!==null)return waitlistPlain(v.result,isDate);
  }
  return String(v);
}
function normalizeWaitlistType(v){const x=String(v||'').trim().toUpperCase().replace(/\s+/g,' ');if(['FVDE','FDEV','VDE/FVDE','FVDE/VDE'].includes(x))return 'VDE';if(['FVIP','VIP/FVIP','FVIP/VIP'].includes(x))return 'VIP';return String(v||'').trim();}
function normalizeWaitlistHeader(v){return waitlistPlain(v).trim().replace(/\s+/g,' ').replace(/[’‘]/g,"'").toLowerCase();}
function waitlistHeaderMatches(value,aliases=[]){const h=normalizeWaitlistHeader(value);return !!h&&aliases.some(a=>h===normalizeWaitlistHeader(a));}
function resolveWaitlistLayout(ws,cfg){
  // The real clinic workbook is formatted for people, not as a database. Find the
  // header row/columns by text when possible and fall back to the known column
  // positions. Testings intentionally has a blank A1, so Date falls back to col 1.
  let headerRow=1;
  const patientField=cfg.fields.find(f=>f.key==='patientName');
  outer: for(let r=1;r<=Math.min(Math.max(ws.rowCount,1),8);r++){
    for(let c=1;c<=Math.min(Math.max(ws.columnCount,8),20);c++){
      if(waitlistHeaderMatches(ws.getCell(r,c).value,patientField.aliases)){headerRow=r;break outer;}
    }
  }
  const fields=cfg.fields.map(f=>{
    let col=null;
    for(let c=1;c<=Math.min(Math.max(ws.columnCount,8),40);c++){
      if(waitlistHeaderMatches(ws.getCell(headerRow,c).value,f.aliases)){col=c;break;}
    }
    if(!col)col=f.fallbackCol;
    return {...f,col};
  });
  const patientCol=(fields.find(f=>f.key==='patientName')||{}).col||2;
  return {...cfg,headerRow,patientCol,fields};
}
async function analyzeWaitlistWorkbook(filePath){
  if(!filePath||!fs.existsSync(filePath))throw new Error('Select the existing Current Waitlist Excel workbook first.');
  const wb=new ExcelJS.Workbook();
  try{await wb.xlsx.readFile(filePath)}catch(err){throw new Error(`The selected waitlist workbook could not be read: ${err.message||err}`)}
  const missing=Object.values(WAITLIST_SHEETS).filter(cfg=>!cfg.optional&&!wb.getWorksheet(cfg.worksheet)).map(cfg=>cfg.worksheet);
  if(missing.length)throw new Error(`The selected workbook is missing the required worksheet(s): ${missing.join(', ')}.`);
  return wb;
}
async function getWaitlistInfo(){
  const st=readWaitlistSettings();const filePath=st?.workbookPath||'';
  if(!filePath||!fs.existsSync(filePath))return {connected:false,workbookPath:filePath||''};
  try{
    const wb=await analyzeWaitlistWorkbook(filePath);
    const layouts={};
    for(const [key,cfg] of Object.entries(WAITLIST_SHEETS)){if(!wb.getWorksheet(cfg.worksheet))continue;layouts[key]=resolveWaitlistLayout(wb.getWorksheet(cfg.worksheet),cfg).fields.map(f=>({key:f.key,label:f.label,type:f.type||'text',col:f.col}));}
    return {connected:true,workbookPath:filePath,worksheets:Object.values(WAITLIST_SHEETS).map(x=>x.worksheet),layouts};
  }catch(err){return {connected:false,workbookPath:filePath,error:err.message||String(err),needsReconnect:true};}
}
async function backupWaitlist(filePath){if(!fs.existsSync(filePath))return;await fsp.mkdir(waitlistBackupsDir(),{recursive:true});const stamp=new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,17);await fsp.copyFile(filePath,path.join(waitlistBackupsDir(),`Current_Waitlist_${stamp}.xlsx`));}
function waitlistRecord(ws,r,cfg){const out={_row:r};for(const f of cfg.fields){const raw=ws.getCell(r,f.col).value;out[f.key]=waitlistPlain(raw,f.type==='date'||f.type==='dateOrText');if(f.key==='type')out[f.key]=normalizeWaitlistType(out[f.key]);}return out;}
function waitlistRowHasData(ws,r,cfg){return cfg.fields.some(f=>hasValue(ws.getCell(r,f.col).value));}
function waitlistLastDataRow(ws,cfg){let last=cfg.headerRow;for(let r=cfg.headerRow+1;r<=ws.rowCount;r++)if(waitlistRowHasData(ws,r,cfg))last=r;return last;}
async function listWaitlist(section='testings'){
  section=normalizeWaitlistSection(section);
  const baseCfg=WAITLIST_SHEETS[section];const st=readWaitlistSettings();
  if(!st?.workbookPath||!fs.existsSync(st.workbookPath))return {connected:false,records:[],workbookPath:st?.workbookPath||'',section};
  const wb=await analyzeWaitlistWorkbook(st.workbookPath);const ws=getWaitlistSheet(wb,baseCfg);const cfg=resolveWaitlistLayout(ws,baseCfg);const records=[];
  for(let r=cfg.headerRow+1;r<=ws.rowCount;r++){if(!hasValue(ws.getCell(r,cfg.patientCol).value))continue;records.push(waitlistRecord(ws,r,cfg));}
  return {connected:true,records,workbookPath:st.workbookPath,section,worksheet:cfg.worksheet,headerRow:cfg.headerRow,fields:cfg.fields.map(f=>({key:f.key,label:f.label,type:f.type||'text',col:f.col}))};
}
function copyWaitlistRowStyle(ws,targetRow,cfg){
  let sourceRow=cfg.headerRow+1;
  for(let r=cfg.headerRow+1;r<=ws.rowCount;r++){if(hasValue(ws.getCell(r,cfg.patientCol).value)){sourceRow=r;break;}}
  for(const f of cfg.fields){const src=ws.getCell(sourceRow,f.col),dst=ws.getCell(targetRow,f.col);if(src.style)dst.style=JSON.parse(JSON.stringify(src.style));dst.numFmt=src.numFmt;if(src.alignment)dst.alignment=JSON.parse(JSON.stringify(src.alignment));}
  if(ws.getRow(sourceRow).height)ws.getRow(targetRow).height=ws.getRow(sourceRow).height;
}
function waitlistValue(f,value){const raw=String(value??'').trim();if(!raw)return null;if(f.key==='type')return normalizeWaitlistType(raw);if(f.type==='date')return toExcelDate(raw,false);if(f.type==='dateOrText'){if(['NONE','NA','N/A'].includes(raw.toUpperCase()))return raw.toUpperCase();const d=toExcelDate(raw,false);return d||raw;}return raw;}
function writeWaitlistRow(ws,r,data,cfg){copyWaitlistRowStyle(ws,r,cfg);for(const f of cfg.fields){const cell=ws.getCell(r,f.col);cell.value=waitlistValue(f,data[f.key]);if(cell.value instanceof Date)cell.numFmt='mm/dd/yyyy';}}
async function saveWaitlistWorkbook(wb,filePath){await backupWaitlist(filePath);try{await wb.xlsx.writeFile(filePath);}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The waitlist workbook appears to be open in Excel. Close it and try again.');throw err;}}
async function addWaitlistRecord(section,data){
  section=normalizeWaitlistSection(section);const baseCfg=WAITLIST_SHEETS[section];const st=readWaitlistSettings();if(!st?.workbookPath)throw new Error('Connect the existing Current Waitlist Excel workbook before adding a patient.');
  const wb=await analyzeWaitlistWorkbook(st.workbookPath),ws=getWaitlistSheet(wb,baseCfg),cfg=resolveWaitlistLayout(ws,baseCfg);const name=String(data.patientName||'').trim();if(!name)throw new Error('Patient Name is required.');
  const row=waitlistLastDataRow(ws,cfg)+1;writeWaitlistRow(ws,row,data,cfg);await saveWaitlistWorkbook(wb,st.workbookPath);return {rowNumber:row,workbookPath:st.workbookPath};
}
async function updateWaitlistRecord(section,rowNumber,data){
  section=normalizeWaitlistSection(section);const baseCfg=WAITLIST_SHEETS[section];const st=readWaitlistSettings();if(!st?.workbookPath)throw new Error('Connect the existing Current Waitlist Excel workbook first.');
  const wb=await analyzeWaitlistWorkbook(st.workbookPath),ws=getWaitlistSheet(wb,baseCfg),cfg=resolveWaitlistLayout(ws,baseCfg);const r=Number(rowNumber);if(!Number.isInteger(r)||r<=cfg.headerRow||r>ws.rowCount||!hasValue(ws.getCell(r,cfg.patientCol).value))throw new Error('Waitlist patient was not found.');
  writeWaitlistRow(ws,r,data,cfg);await saveWaitlistWorkbook(wb,st.workbookPath);return {rowNumber:r};
}
async function deleteWaitlistRecord(section,rowNumber){
  section=normalizeWaitlistSection(section);const baseCfg=WAITLIST_SHEETS[section];const st=readWaitlistSettings();if(!st?.workbookPath)throw new Error('Connect the existing Current Waitlist Excel workbook first.');
  const wb=await analyzeWaitlistWorkbook(st.workbookPath),ws=getWaitlistSheet(wb,baseCfg),cfg=resolveWaitlistLayout(ws,baseCfg);const r=Number(rowNumber);if(!Number.isInteger(r)||r<=cfg.headerRow||r>ws.rowCount||!hasValue(ws.getCell(r,cfg.patientCol).value))throw new Error('Waitlist patient was not found.');
  await backupWaitlist(st.workbookPath);ws.spliceRows(r,1);try{await wb.xlsx.writeFile(st.workbookPath);}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The waitlist workbook appears to be open in Excel. Close it and try again.');throw err;}return true;
}

async function ensureOpeningsWorkbook(){await fsp.mkdir(waitlistDir(),{recursive:true});if(!fs.existsSync(waitlistOpeningsPath())){const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Openings');ws.addRow(['Dr','Appointment Type','Date','Time']);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17345C'}};ws.columns=[{width:18},{width:22},{width:15},{width:14}];ws.autoFilter='A1:D1';await wb.xlsx.writeFile(waitlistOpeningsPath());}}
async function loadOpenings(){await ensureOpeningsWorkbook();const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(waitlistOpeningsPath());return {wb,ws:wb.getWorksheet('Openings')};}
function openingRecord(ws,r){return {_row:r,doctor:waitlistPlain(ws.getCell(r,1).value),appointmentType:waitlistPlain(ws.getCell(r,2).value),date:waitlistPlain(ws.getCell(r,3).value,true),time:waitlistPlain(ws.getCell(r,4).value)};}
async function listOpenings(){const {ws}=await loadOpenings();const records=[];for(let r=2;r<=ws.rowCount;r++){if(!hasValue(ws.getCell(r,1).value)&&!hasValue(ws.getCell(r,2).value))continue;records.push(openingRecord(ws,r));}records.sort((a,b)=>ClinicDates.sortKey(a.date).localeCompare(ClinicDates.sortKey(b.date))||String(a.time||'').localeCompare(String(b.time||'')));return {records,workbookPath:waitlistOpeningsPath()};}
async function saveOpenings(wb){const backup=path.join(waitlistBackupsDir(),`Openings_${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,17)}.xlsx`);if(fs.existsSync(waitlistOpeningsPath()))await fsp.copyFile(waitlistOpeningsPath(),backup);try{await wb.xlsx.writeFile(waitlistOpeningsPath());}catch(err){if(err.code==='EBUSY'||err.code==='EPERM')throw new Error('The Openings workbook appears to be open in Excel. Close it and try again.');throw err;}}
async function addOpening(data){const {wb,ws}=await loadOpenings();let r=ws.rowCount+1;for(let i=2;i<=ws.rowCount;i++){if(!hasValue(ws.getCell(i,1).value)&&!hasValue(ws.getCell(i,2).value)){r=i;break;}}ws.getCell(r,1).value=String(data.doctor||'').trim();ws.getCell(r,2).value=String(data.appointmentType||'').trim();ws.getCell(r,3).value=toExcelDate(data.date,false);ws.getCell(r,3).numFmt='mm/dd/yyyy';ws.getCell(r,4).value=String(data.time||'').trim();await saveOpenings(wb);return {rowNumber:r};}
async function updateOpening(rowNumber,data){const {wb,ws}=await loadOpenings();const r=Number(rowNumber);if(!Number.isInteger(r)||r<2||r>ws.rowCount)throw new Error('Opening not found.');ws.getCell(r,1).value=String(data.doctor||'').trim();ws.getCell(r,2).value=String(data.appointmentType||'').trim();ws.getCell(r,3).value=toExcelDate(data.date,false);ws.getCell(r,3).numFmt='mm/dd/yyyy';ws.getCell(r,4).value=String(data.time||'').trim();await saveOpenings(wb);return true;}
async function deleteOpening(rowNumber){const {wb,ws}=await loadOpenings();const r=Number(rowNumber);if(!Number.isInteger(r)||r<2||r>ws.rowCount)throw new Error('Opening not found.');ws.spliceRows(r,1);await saveOpenings(wb);return true;}

ipcMain.handle('waitlist:info',async()=>getWaitlistInfo());
ipcMain.handle('waitlist:choose-workbook',async()=>{const result=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Excel Workbooks',extensions:['xlsx']}]});if(result.canceled)return null;const filePath=result.filePaths[0];await analyzeWaitlistWorkbook(filePath);await writeWaitlistSettings({workbookPath:filePath,connectedAt:new Date().toISOString()});return {connected:true,workbookPath:filePath,worksheets:Object.values(WAITLIST_SHEETS).map(x=>x.worksheet)};});
ipcMain.handle('waitlist:list',async(_,section='testings')=>listWaitlist(section));
ipcMain.handle('waitlist:add',(_,section,data)=>queueWrite(()=>addWaitlistRecord(section,data)));
ipcMain.handle('waitlist:update',(_,section,rowNumber,data)=>queueWrite(()=>updateWaitlistRecord(section,rowNumber,data)));
ipcMain.handle('waitlist:delete',(_,section,rowNumber)=>queueWrite(()=>deleteWaitlistRecord(section,rowNumber)));
ipcMain.handle('waitlist:open-workbook',async()=>{const st=readWaitlistSettings();if(!st?.workbookPath||!fs.existsSync(st.workbookPath))throw new Error('Connect the existing Current Waitlist Excel workbook first.');const result=await shell.openPath(st.workbookPath);if(result)throw new Error(result);return true;});
ipcMain.handle('openings:list',async()=>listOpenings());
ipcMain.handle('openings:add',(_,data)=>queueWrite(()=>addOpening(data)));
ipcMain.handle('openings:update',(_,row,data)=>queueWrite(()=>updateOpening(row,data)));
ipcMain.handle('openings:delete',(_,row)=>queueWrite(()=>deleteOpening(row)));
ipcMain.handle('openings:open-workbook',async()=>{await ensureOpeningsWorkbook();const result=await shell.openPath(waitlistOpeningsPath());if(result)throw new Error(result);return true;});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1550,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f4f7fb',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  dataFolder.initialise();
  await ensureDataFiles();
  try{await migrateSetupWorkbook();}catch(e){console.error('New Patient Setup migration pending:',e);}
  try{await ensureCancellationWorkbookSchema(currentCancellationWorkbookPath());}catch(e){console.error('Exam Cancellations migration pending:',e);}
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(e => { dialog.showErrorBox('Clinic Tools data folder', e.message); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* Weekly Report: separate, privacy-preserving Crystal PM CSV import + Excel export. */
require('./weekly-backend')({ ipcMain, dialog, mainWindow:()=>mainWindow, dataDir, queueWrite });
require('./monthly-backend')({ ipcMain, dialog, mainWindow:()=>mainWindow, dataDir, queueWrite });
