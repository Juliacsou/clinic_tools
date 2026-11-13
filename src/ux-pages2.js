/* Visual Health Clinic Tools — screens, part 2 (v2.15.0)
   Payment Tracking, Exam Cancelations, Waitlist and application start-up. */
(function () {
  'use strict';
  const UX = window.UX;
  const { $, $$, ico, chip, baseName, openDrawer, closeDrawer, switchTab, markClean, renderList, loading, fatal, showToast, setHeader } = UX;
  const { T, dash, facts, asRow, settingsLinks, sourceHtml, simBanner, daysSince } = UX.shared;
  const CancellationList = window.ClinicCancellationList;
  const api = () => window.clinicAPI;
  const ensurePage = async (key, fn) => { if (UX.page !== key) await fn(); };

  /* =============================================================== PAYMENT TRACKING */
  const SP = { tab: 'needs', q: '', filters: {}, sort: null, openId: '' };
  const depKind = (s) => (s === 'Paid' ? 'ok' : s === 'No deposit required' || s === 'No payment required' ? 'mute' : 'warn');
  const DEP_NEEDS = ['Pending', 'Needs review'];

  async function renderInitialLanding() {
    setHeader('Payment Tracking', '+ Add Patient', () => openPaymentDrawer(null));
    loading('Loading payments…');
    let info, tracking;
    try { [info, tracking] = await Promise.all([api().getInitialInfo(), api().listInitialTracking()]); } catch (e) { fatal(e, renderInitialLanding); return; }
    const all = tracking.records || [];
    renderList({
      pageKey: 'payment', state: SP, rows: all, rowId: (r) => r._row, rowLabel: (r) => r.patientName, noun: 'patients',
      searchPlaceholder: 'Search patient, referral source or exam…',
      searchText: (r) => [r.patientName, r.referralSource, r.examType, r.depositTaken, r.depositNeeded].join(' '),
      tabs: [
        { key: 'needs', label: 'Needs deposit follow-up', test: (r) => DEP_NEEDS.includes(r._depositState), empty: 'No deposits are waiting', emptyHint: 'Patients whose $50 deposit is still open show up here.' },
        { key: 'done', label: 'Paid or no payment needed', test: (r) => !DEP_NEEDS.includes(r._depositState), empty: 'Nothing here yet' }
      ],
      defaultSort: (tab) => ({ key: 'exam', dir: tab === 'needs' ? 'asc' : 'desc' }),
      banner: info.usingSimulation ? simBanner('Payment Tracking') : '',
      columns: [
        { key: 'patient', label: 'Patient', sort: (r) => String(r.patientName || '').toLowerCase(), html: (r) => `<div class="cell-main">${esc(r.patientName)}</div><div class="sub clip" title="${esc(r.referralSource || '')}">${esc(r.referralSource || '')}</div>` },
        { key: 'exam', label: 'Exam', sort: (r) => (r.examScheduled ? String(r.examScheduled).slice(0, 10) : ''), html: (r) => `<div>${dash(r.examType)}</div><div class="sub num">${r.examScheduled ? fmtDate(r.examScheduled) : 'Not scheduled'}</div>` },
        { key: 'contact', label: 'Initial contact', p: 2, sort: (r) => (r.initialContactDate ? String(r.initialContactDate).slice(0, 10) : ''), html: (r) => `<span class="num">${fmtDate(r.initialContactDate)}</span>` },
        { key: 'meeting', label: 'Parent meeting', p: 3, sort: (r) => (r.parentMeeting ? String(r.parentMeeting).slice(0, 10) : ''), html: (r) => `<span class="num">${fmtDate(r.parentMeeting)}</span>` },
        { key: 'deposit', label: 'Deposit', sort: (r) => r._depositState, html: (r) => `${chip(r._depositState, depKind(r._depositState))}${r.depositTaken && r.depositTaken !== 'YES' ? `<div class="sub" style="margin-top:3px">${esc(r.depositTaken)}</div>` : ''}` }
      ],
      intro: '<p>Track the initial deposit for each new patient in your monthly payment workbook.</p>',
      source: sourceHtml(info.workbookPath),
      onOpen: (r) => openPaymentDrawer(r._row),
      wire: settingsLinks
    });
  }

  async function openPaymentDrawer(rowNumber) {
    await ensurePage('payment', renderInitialLanding);
    const isEdit = !!rowNumber;
    let r = { depositNeeded: 'YES', initialContactDate: todayIso() };
    if (isEdit) {
      try { r = await api().getInitialTracking(rowNumber); } catch (e) { showToast(errorMessage(e), 'error'); return; }
      if (!r) { showToast('Patient was not found in the selected Excel file.', 'error'); renderInitialLanding(); return; }
    }
    const chips = ['YES via link', 'YES via cc', 'NO/FES', ''].map((v) => `<button type="button" class="chip" data-quick="${esc(v)}">${v || 'Clear'}</button>`).join('');
    openDrawer({
      title: isEdit ? r.patientName : 'Add patient to Payment Tracking', accent: '#e0b400',
      subtitle: isEdit ? esc(r.referralSource || 'Payment Tracking') : 'Writes a new row to the connected monthly workbook.',
      chip: isEdit ? chip(r._depositState, depKind(r._depositState)) : '',
      html: `<form id="paymentForm">
        <div class="dsection"><h3>Patient and appointment</h3><div class="dgrid">
          <label class="span-2">Patient name *<input name="patientName" required value="${esc(r.patientName || '')}"></label>
          <label>Age<input type="number" min="0" max="130" name="age" value="${esc(r.age || '')}"></label>
          <label>Date of initial contact${dateTextInput('initialContactDate', r.initialContactDate || '', true)}</label>
          <label class="span-2">Referral source<input name="referralSource" value="${esc(r.referralSource || '')}"></label>
          <label>Exam type<input name="examType" value="${esc(r.examType || '')}"></label>
          <label>Exam scheduled${dateTextInput('examScheduled', r.examScheduled || '')}</label>
          <label>Parent meeting${dateTextInput('parentMeeting', r.parentMeeting || '')}</label></div></div>
        <div class="dsection"><h3>Deposit</h3><div class="dgrid">
          <label>Deposit needed?<select name="depositNeeded"><option value="YES" ${r.depositNeeded !== 'NO' ? 'selected' : ''}>YES</option><option value="NO" ${r.depositNeeded === 'NO' ? 'selected' : ''}>NO</option></select></label>
          <label>Deposit taken?<input name="depositTaken" value="${esc(r.depositTaken || '')}" placeholder="Leave blank if not yet paid"></label></div>
          <div class="quick-values"><span>Quick values</span>${chips}</div></div>
      </form>`,
      footer: `${isEdit ? '<button type="button" class="btn btn-danger" id="deletePayment">Delete patient</button>' : '<button type="button" class="btn" data-close>Cancel</button>'}<span class="spacer"></span><button type="button" class="btn btn-primary" id="savePayment">${isEdit ? 'Save changes' : 'Add to Payment Tracking'}</button>`,
      onMount: (root) => {
        const form = $('#paymentForm', root);
        $$('[data-quick]', root).forEach((b) => { b.onclick = () => { form.elements.namedItem('depositTaken').value = b.dataset.quick; UX.markClean(); }; });
        const save = async () => {
          if (!form.reportValidity()) return;
          const payload = Object.fromEntries(new FormData(form).entries());
          try { normalizeDates(payload, [['initialContactDate', 'Date of Initial Contact'], ['examScheduled', 'Exam Scheduled'], ['parentMeeting', 'Parent Meeting']]); } catch (err) { showToast(errorMessage(err), 'error'); return; }
          try {
            if (isEdit) { await api().updateInitialTracking(rowNumber, payload); showToast('Payment Tracking updated.'); }
            else {
              const existing = (await api().listInitialTracking()).records.find((x) => normalizeHeaderUI(x.patientName) === normalizeHeaderUI(payload.patientName) && (!payload.initialContactDate || x.initialContactDate === payload.initialContactDate));
              if (existing) { showToast('This patient already appears in Payment Tracking.', 'error'); return; }
              const res = await api().saveInitialTracking(payload); showToast(`Patient added to Payment Tracking (row ${res.rowNumber}).`);
            }
            closeDrawer(true); renderInitialLanding();
          } catch (err) { showToast(errorMessage(err), 'error'); }
        };
        $('#savePayment', root).onclick = save;
        form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
        const del = $('#deletePayment', root);
        if (del) del.onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r.patientName}?`, message: 'This removes the row from the connected Payment Tracking Excel. A backup is created first.', confirmLabel: 'Delete patient', danger: true })) return;
          try { await api().deleteInitialTracking(rowNumber); showToast('Patient deleted from Payment Tracking.'); closeDrawer(true); renderInitialLanding(); } catch (err) { showToast(errorMessage(err), 'error'); }
        };
      }
    });
  }
  const renderInitialQuickAdd = () => openPaymentDrawer(null);
  const renderInitialTrackingDetail = async (row) => { await renderInitialLanding(); openPaymentDrawer(asRow(row)); };

  /* =============================================================== EXAM CANCELATIONS */
  const SC = { tab: 'open', q: '', filters: {}, sort: null, openId: '' };
  const cancelKind = (s) => (s === 'Rescheduled' ? 'ok' : ['Will Not Reschedule','No Answer After 3 Attempts'].includes(s) ? 'mute' : 'info');
  const CANCEL_DONE = ['Rescheduled', 'Will Not Reschedule', 'No Answer After 3 Attempts'];
  const isSecond = (r) => String(r.secondOccurrence || '').toUpperCase() === 'YES';

  async function renderCancellationLanding() {
    setHeader('Exam Cancelations', '+ New Cancelation', () => openCancellationNew());
    loading('Loading cancelations…');
    let info, result;
    try { [info, result] = await Promise.all([api().getCancellationInfo(), api().listCancellations()]); } catch (e) { fatal(e, renderCancellationLanding); return; }
    const recs = result.records || [];
    const attemptsColumn = {
      key: 'attempts', label: 'Attempts', sort: (r) => CancellationList.attempts(r),
      html: (r) => { const n = CancellationList.attempts(r); return `<span class="dots" title="${n} of 3 contact attempts logged">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; }
    };
    const lastFollowUpColumn = {
      key: 'last', label: 'Last follow-up', p: 2,
      sort: (r) => { const date = CancellationList.lastContact(r); return date ? daysSince(date) : Number.MAX_SAFE_INTEGER; },
      html: (r) => { const date = CancellationList.lastContact(r); const n = daysSince(date); return n === '' ? '<span class="muted">No contact yet</span>' : `<span class="num" title="Last contact: ${esc(fmtDateTime(date))}">${n} d</span>`; }
    };
    const statusColumn = {
      key: 'status', label: 'Status', sort: (r) => CancellationList.displayStatus(r),
      html: (r) => { const status = CancellationList.displayStatus(r); return chip(status, cancelKind(status)); }
    };
    const columns = [
      { key: 'patient', label: 'Patient', sort: (r) => String(r.patientName || '').toLowerCase(), html: (r) => `<div class="cell-main">${esc(r.patientName)}${isSecond(r) ? '<span class="flag" title="Second cancelation or no-show in a row">2nd</span>' : ''}</div><div class="sub clip" title="${esc(r.referralSource || '')}">${esc(r.referralSource || '')}</div>` },
      { key: 'exam', label: 'Exam', p: 2, sort: (r) => (r.originalAppointmentDate ? String(r.originalAppointmentDate).slice(0, 10) : ''), html: (r) => `<div>${dash(r.examType)}</div><div class="sub num">${r.originalAppointmentDate ? fmtDate(r.originalAppointmentDate) : ''}</div>` },
      { key: 'reason', label: 'Reason', p: 3, html: (r) => `<div class="clip-2" title="${esc(r.cancellationReason || '')}">${dash(r.cancellationReason)}</div>` },
      attemptsColumn, lastFollowUpColumn, statusColumn
    ];
    renderList({
      pageKey: 'cancellations', state: SC, rows: recs, rowId: (r) => r._row, rowLabel: (r) => r.patientName, noun: 'patients',
      searchPlaceholder: 'Search patient, reason or referral source…',
      searchText: (r) => [r.patientName, r.cancellationReason, r.referralSource, r.examType, r.followUpNotes].join(' '),
      tabs: [
        { key: 'open', label: 'Follow-up', test: (r) => !CANCEL_DONE.includes(r._state), columns, empty: 'No families are waiting to reschedule', emptyHint: 'Log a cancelation or no-show and it will wait here for follow-up.' },
        { key: 'done', label: 'Closed', test: (r) => CANCEL_DONE.includes(r._state), columns, empty: 'Nothing closed yet' }
      ],
      filters: [{ key: 'status', label: 'All statuses', options: [
        'Awaiting 1st contact', 'Awaiting 2nd contact', 'Awaiting 3rd contact', ...CANCEL_DONE
      ], test: (r, value) => CancellationList.displayStatus(r) === value }],
      // Most overdue follow-ups first; rows without a recorded contact are prioritized.
      defaultSort: (tab) => ({ key: 'last', dir: tab === 'open' ? 'desc' : 'asc' }),
      columns,
      intro: '<p>Families who cancelled or missed an exam and still need a call to reschedule.</p>',
      source: sourceHtml(info.workbookPath),
      onOpen: (r) => openCancellationDrawer(r._row),
      wire: settingsLinks
    });
  }


  /* "Dr. Name @ Office" in Referral source -> doctor and clinic for the phone script. Anything else is left blank. */
  function splitReferral(src) {
    const s = String(src || ''); const i = s.indexOf('@');
    if (i < 0) return null;
    let doctor = s.slice(0, i).trim(); const clinic = s.slice(i + 1).trim();
    if (!doctor || !clinic) return null;
    if (!/^dr\.?\s/i.test(doctor)) doctor = `Dr. ${doctor}`;
    return { doctor, clinic };
  }
  function followUpPanelFor(r) {
    let html = followUpScriptPanel(r.patientName);
    const ref = splitReferral(r.referralSource);
    if (ref) html = html.replace(/Dr\. _{3,} at _{3,}/, `${esc(ref.doctor)} at ${esc(ref.clinic)}`);
    return html;
  }

  /* ---- JSON import for a new cancelation (same idea as Referral: paste, preview, fill, review, save) ---- */
  const CANCEL_JSON_PROMPT = `Read the attached screenshot of an exam cancelation or no-show and return ONLY a JSON object with exactly these keys. Use an empty string "" for anything that is not clearly visible. Do not guess or invent anything.
{
  "patient_name": "",
  "age": "",
  "exam_type": "VDE, VIP, 99203, Parent Conference (PC) or Other",
  "original_appointment_date": "MM/DD/YYYY",
  "referral_source": "Dr Name @ Office Name when both are shown",
  "cancellation_date": "MM/DD/YYYY",
  "event_type": "Cancelled or No-show",
  "cancellation_reason": "",
  "second_occurrence": "YES only if it says this is the second cancelation or no-show in a row, otherwise NO"
}`;
  const CANCEL_EXAM_TYPES = ['VDE', 'VIP', '99203', 'Parent Conference (PC)', 'Other'];
  function mapCancelJson(obj) {
    const pick = (...keys) => { for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return String(obj[k]).trim(); return ''; };
    const out = [];
    const add = (key, label, value, note) => out.push({ key, label, value, note });
    const dateFix = (v) => { if (!v) return ''; const iso = /^\d{4}-\d{2}-\d{2}/.test(v) ? usDateValue(v.slice(0, 10)) : v; try { parseUsDate(iso, 'Date'); return iso; } catch (e) { return null; } };
    add('patientName', 'Patient name', pick('patient_name', 'patientName', 'Patient Name', 'name'));
    add('age', 'Age', pick('age', 'Age').replace(/\D/g, ''));
    const et = pick('exam_type', 'examType', 'Exam Type'); const etn = normalizeExamType(et);
    const etm = CANCEL_EXAM_TYPES.find((x) => x.toLowerCase() === etn.toLowerCase()) || (/99203/.test(etn) ? '99203' : /^pc$|parent conf/i.test(etn) ? 'Parent Conference (PC)' : '');
    add('examType', 'Exam type', etm, et && !etm ? `“${et}” is not one of the exam types, left blank` : '');
    for (const [key, label, ...aliases] of [['originalAppointmentDate', 'Original appointment date', 'original_appointment_date', 'originalAppointmentDate', 'appointment_date'], ['cancellationDate', 'Cancelation / no-show date', 'cancellation_date', 'cancellationDate', 'event_date']]) {
      const raw = pick(...aliases); const fixed = dateFix(raw);
      add(key, label, fixed === null ? '' : fixed, fixed === null ? `“${raw}” is not MM/DD/YYYY, left blank` : '');
    }
    add('referralSource', 'Referral source', pick('referral_source', 'referralSource', 'Referral Source'));
    const ev = pick('event_type', 'eventType', 'Event Type').toLowerCase().replace(/[\s_]/g, '-');
    const evm = /no-?show/.test(ev) ? 'No-show' : /cancel/.test(ev) ? 'Cancelled' : '';
    add('eventType', 'Event type', evm, ev && !evm ? `“${ev}” was not recognised, left blank` : '');
    add('cancellationReason', 'Reason', pick('cancellation_reason', 'cancellationReason', 'reason', 'Cancellation Reason'));
    const sec = pick('second_occurrence', 'secondOccurrence', 'second_cancellation').toLowerCase();
    add('secondOccurrence', 'Second cancelation / no-show', /^(yes|true|1|y|2nd|second)/.test(sec) ? 'YES' : '');
    return out;
  }
  function wireCancelJson(root, form) {
    const panel = $('#cancelJsonPanel', root), preview = $('#cancelJsonPreview', root), apply = $('#applyCancelJson', root);
    let mapped = null;
    $('#toggleCancelJson', root).onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) $('#cancelJsonInput', root).focus(); };
    $('#copyCancelPrompt', root).onclick = () => UX.copyToClipboard(CANCEL_JSON_PROMPT, 'AI prompt');
    $('#previewCancelJson', root).onclick = () => {
      try {
        const obj = JSON.parse($('#cancelJsonInput', root).value);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Paste a single JSON object.');
        mapped = mapCancelJson(obj);
        const filled = mapped.filter((m) => m.value);
        preview.innerHTML = (mapped.filter((m) => m.value || m.note).map((m) => `<div class="${m.note ? 'skip' : ''}"><span>${esc(m.label)}</span><strong>${m.value ? esc(m.value) : '<em>left blank</em>'}${m.note ? `<br><small>${esc(m.note)}</small>` : ''}</strong></div>`).join('')) || '<p class="muted">No recognised fields were found.</p>';
        apply.disabled = !filled.length;
      } catch (e) { mapped = null; apply.disabled = true; preview.innerHTML = `<div class="banner bad">Invalid JSON: ${esc(errorMessage(e))}</div>`; }
    };
    apply.onclick = () => {
      if (!mapped) return;
      for (const m of mapped) {
        if (!m.value) continue;
        const el = form.elements.namedItem(m.key); if (!el) continue;
        if (el.type === 'checkbox') el.checked = m.value === 'YES'; else el.value = m.value;
      }
      panel.hidden = true; UX.markClean(); showToast('Fields filled from JSON. Please review before saving.');
    };
  }

  async function openCancellationDrawer(rowNumber, tab) {
    await ensurePage('cancellations', renderCancellationLanding);
    const isEdit = !!rowNumber;
    let r = { cancellationDate: todayIso() };
    if (isEdit) {
      try { r = await api().getCancellation(rowNumber); } catch (e) { showToast(errorMessage(e), 'error'); return; }
      if (!r) { showToast('Cancelation record was not found.', 'error'); renderCancellationLanding(); return; }
    }

    if (!isEdit) {
      openDrawer({
        title: 'New cancelation', accent: '#e1192d', wide: true, subtitle: 'Record why the exam was cancelled or missed. Follow-up happens later.',
        actions: '<button type="button" class="btn" id="toggleCancelJson">Import JSON</button>',
        html: `<div class="panel-block json-box" id="cancelJsonPanel" hidden><h3>Import from JSON</h3><p class="muted" style="margin:0 0 10px">Paste the JSON an AI tool created from the screenshot, check the preview, then fill the form. Nothing is saved until you click “Add to Excel”.</p><textarea id="cancelJsonInput" rows="7" placeholder='{"patient_name":"...","cancellation_date":"MM/DD/YYYY",...}'></textarea><div class="inline-actions" style="margin-top:10px"><button type="button" class="btn btn-sm" id="copyCancelPrompt">${ico('copy', 'sm')}Copy AI prompt</button><button type="button" class="btn btn-sm" id="previewCancelJson">Preview</button><button type="button" class="btn btn-sm btn-primary" id="applyCancelJson" disabled>Use these values</button></div><div id="cancelJsonPreview" class="json-preview"></div></div><details><summary>Policy script for a second cancelation</summary>${cancellationScriptPanel('')}</details><form id="cancelForm">${cancellationFormFields(r)}</form>`,
        footer: '<button type="button" class="btn" data-close>Cancel</button><span class="spacer"></span><button type="button" class="btn btn-primary" id="saveCancel">Add to Excel</button>',
        onMount: (root) => {
          const form = $('#cancelForm', root);
          wireCancelJson(root, form);
          $('#saveCancel', root).onclick = async () => {
            if (!form.reportValidity()) return;
            const data = Object.fromEntries(new FormData(form).entries()); data.secondOccurrence = data.secondOccurrence || 'NO';
            try { normalizeDates(data, [['originalAppointmentDate', 'Original Appointment Date'], ['cancellationDate', 'Cancellation / No-Show Date']]); } catch (err) { showToast(errorMessage(err), 'error'); return; }
            try { const res = await api().createCancellation(data); showToast(`Cancelation added to Excel (row ${res.rowNumber}).`); closeDrawer(true); renderCancellationLanding(); } catch (err) { showToast(errorMessage(err), 'error'); }
          };
        }
      });
      return;
    }

    const needsFollow = !CANCEL_DONE.includes(r._state);
    const attempt = needsFollow ? ([1,2,3].find(n => !r['attempt'+n+'At']) || null) : null;
    const history = `<ol class="steps">${[1,2,3].map((i)=>{const date=r['attempt'+i+'At'];const comment=r['attempt'+i+'Comment'];return `<li class="step ${date?'is-done':''}"><span class="step-n">${i}</span><div><div class="step-title">${i===1?'1st':i===2?'2nd':'3rd'} contact ${date?`<span class="muted num"> · ${fmtDateTime(date)}</span>`:''}</div><p class="step-note ${comment?'':'muted'}">${esc(comment|| (date?'No comment':'Not attempted yet'))}</p></div></li>`;}).join('')}</ol>`;
    const contactHtml = `<div class="dsection"><h3>Contact history</h3>${history}</div>${attempt?`<div class="panel-block"><h3>Log attempt ${attempt} of 3</h3><form id="cancelContactForm">${window.cancellationAttemptScript(attempt,r)}<label>Date and time<div class="datetime-with-action"><input id="cancelContactDateTime" type="text" autocomplete="off" name="contact_datetime" placeholder="MM/DD/YYYY hh:mm AM/PM" value="${esc(nowUsDateTime())}" required><button type="button" class="btn btn-sm" id="useNowCancelContact">Now</button></div></label><label>Comment<textarea name="comment" rows="3" placeholder="Call result or voicemail left..."></textarea></label><div class="form-row-end"><button class="btn btn-primary" type="submit">Save contact${attempt===3?' & close case':''}</button></div></form></div>`:'<p class="muted">No further attempts are required for this patient.</p>'}`;
    const closureHtml=needsFollow?`<form id="cancelCloseForm"><h3>Close follow-up</h3><label>Outcome<select name="followUpStatus" id="cancelClosureReason" required><option value="">Select outcome…</option><option value="Rescheduled">Rescheduled</option><option value="Will Not Reschedule">Will Not Reschedule</option></select></label><label>New appointment date${dateTextInput('newAppointmentDate',r.newAppointmentDate||'')}</label><label>Notes<textarea name="followUpNotes" rows="4">${esc(r.followUpNotes||'')}</textarea></label><div class="form-row-end"><button type="submit" class="btn btn-primary">Save & close case</button></div></form>`:`<div class="dsection">${facts([['Closure reason',T(r.closureReason||r._state)],['Closed at',fmtDateTime(r.closedAt)],['New appointment',fmtDate(r.newAppointmentDate)],['Notes',T(r.followUpNotes),true]])}</div>`;
    const tabs = [
      { key: 'contact', label: 'Contact history', html: contactHtml },
      { key: 'close', label: 'Close case', html: closureHtml },
      { key: 'details', label: 'Details', html: `<form id="cancelForm">${cancellationFormFields(r)}<div class="form-row-end"><button type="submit" class="btn btn-primary">Save changes</button></div></form>` },
      { key: 'policy', label: 'Policy script', html: cancellationScriptPanel(r.patientName) }
    ];
    openDrawer({
      title: r.patientName, accent: '#e1192d', wide: true,
      subtitle: esc([r.eventType, r.cancellationDate ? fmtDateText(r.cancellationDate) : '', r.examType].filter(Boolean).join(' · ')),
      chip: chip(r._state, cancelKind(r._state)),
      tabs, activeTab: tab === 'result' || tab === 'script' ? 'contact' : (tab || (needsFollow ? 'contact' : 'close')),
      footer: '<button type="button" class="btn btn-danger" id="deleteCancel">Delete patient</button><span class="spacer"></span><button type="button" class="btn" data-close>Close</button>',
      onMount: (root) => {
        const strip = (o) => { const m = { ...r, ...o }; delete m._row; delete m._state; return m; };
        const reopen = async (t) => { markClean(); await renderCancellationLanding(); openCancellationDrawer(rowNumber, t); };
        const contactForm=$('#cancelContactForm',root);
        if(contactForm)contactForm.onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(contactForm).entries());try{payload.contact_datetime=parseUsDateTime(payload.contact_datetime,'Date/Time');await api().addCancellationContact(rowNumber,payload);showToast(attempt===3?'Third attempt saved. Case closed.':'Contact saved.');reopen(attempt===3?'close':'contact')}catch(err){showToast(errorMessage(err),'error')}};
        const nowBtn=$('#useNowCancelContact',root);if(nowBtn)nowBtn.onclick=()=>$('#cancelContactDateTime',root).value=nowUsDateTime();
        wireScriptCopyButtons();
        $('#cancelForm', root).onsubmit = async (e) => {
          e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.secondOccurrence=data.secondOccurrence||'NO';
          try{normalizeDates(data,[['originalAppointmentDate','Original Appointment Date'],['cancellationDate','Cancellation / No-Show Date']]);await api().updateCancellation(rowNumber,data);showToast('Cancelation updated in Excel.');reopen('details')}catch(err){showToast(errorMessage(err),'error')}
        };
        const closeForm=$('#cancelCloseForm',root);if(closeForm)closeForm.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(closeForm).entries());try{
          if(data.followUpStatus==='Rescheduled'&&!data.newAppointmentDate.trim())throw new Error('Enter the new appointment date to close as Rescheduled.');
          normalizeDates(data,[['newAppointmentDate','New Appointment Date']]);
          await api().updateCancellation(rowNumber,{...data,closureReason:data.followUpStatus,rescheduled:data.followUpStatus==='Rescheduled'?'YES':'NO',closedAt:new Date().toISOString()});showToast('Follow-up closed.');closeDrawer(true);renderCancellationLanding();
        }catch(err){showToast(errorMessage(err),'error')}};
        $('#deleteCancel', root).onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r.patientName}?`, message: 'This removes the row from the connected cancelations Excel. A backup is created first.', confirmLabel: 'Delete patient', danger: true })) return;
          try { await api().deleteCancellation(rowNumber); showToast('Patient deleted from the cancelations spreadsheet.'); closeDrawer(true); renderCancellationLanding(); } catch (err) { showToast(errorMessage(err), 'error'); }
        };
      }
    });
  }
  const fmtDateText = (v) => String(fmtDate(v)).replace(/<[^>]*>/g, '');
  const openCancellationNew = () => openCancellationDrawer(null);
  const renderCancellationForm = async (rowNumber = null) => { const row = asRow(rowNumber); if (row) await openCancellationDrawer(row, 'details'); else await openCancellationDrawer(null); };
  const renderCancellationDetail = async (row) => { await renderCancellationLanding(); openCancellationDrawer(asRow(row)); };
  const renderCancellationFollowup = async (row) => { await renderCancellationLanding(); openCancellationDrawer(asRow(row), 'contact'); };

  /* =============================================================== WAITLIST */
  const SW = { section: 'testings', tab: 'all', q: '', filters: {}, sort: null, openId: '', adv: {}, panelOpen: false, recs: [] };
  const WL_PRI = { patientName: 0, date: 0, dateScheduled: 0, pcDate: 0, type: 1, doctor: 1, pcDate: 1, dateScheduled: 1, due: 1, notes: 0, note: 0, offered: 1, request: 1, dayTimePref: 2, testingDate: 2, contacted: 2 };
  const WL_LONG = ['notes', 'note', 'request', 'offered', 'due'];
  const WL_WIDE = ['notes', 'note', 'offered'];
  const wlSortVal = (v) => ClinicDates.sortKey(waitlistVal(v));

  function connectBox(section, priorPath, err) {
    appEl.innerHTML = `<section class="connect-box"><h2>${priorPath ? 'Reconnect the waitlist workbook' : 'Connect the waitlist workbook'}</h2><p>${priorPath ? 'The saved file could not be opened. Choose it again, or try once more if someone else just had it open.' : 'Choose the clinic’s existing “Current Waitlist” Excel file. The app edits Testings, PC’s and Follow-up in that same file and never replaces it.'}</p>${priorPath ? `<p style="font-size:12.5px;word-break:break-all">${esc(priorPath)}</p>` : ''}${err ? `<div class="banner bad" style="text-align:left;margin-bottom:16px">${esc(err)}</div>` : ''}<div class="inline-actions" style="justify-content:center"><button type="button" class="btn btn-primary" id="wlChooseBtn">Choose Excel file</button>${priorPath ? '<button type="button" class="btn" id="wlRetryBtn">Try again</button>' : ''}</div><p style="margin:16px 0 0;font-size:12.5px">You can change this later in Settings.</p></section>`;
    $('#wlChooseBtn').onclick = async () => { try { const x = await api().chooseWaitlistWorkbook(); if (x) { showToast('Waitlist connected.'); renderWaitlistLanding(section); } } catch (e) { showToast(errorMessage(e), 'error'); } };
    const retry = $('#wlRetryBtn'); if (retry) retry.onclick = () => renderWaitlistLanding(section);
  }

  async function renderWaitlistLanding(sectionArg) {
    const section = normalizeWaitlistSectionUI(typeof sectionArg === 'string' ? sectionArg : SW.section);
    if (section !== SW.section) { SW.section = section; SW.filters = {}; SW.adv = {}; SW.sort = null; SW.openId = ''; SW.panelOpen = false; }
    try { waitlistActiveSection = section; } catch (e) { /* ignore */ }
    setHeader('Waitlist', '+ Add Patient', () => openWaitlistDrawer(SW.section, null));
    loading('Loading waitlist…');
    let result = null, openingResult = { records: [] };
    try { result = await api().listWaitlist(section); } catch (e) { if (section !== 'testings' && /worksheet/i.test(errorMessage(e))) { showToast(errorMessage(e), 'error'); return renderWaitlistLanding('testings'); } let info = null; try { info = await api().getWaitlistInfo(); } catch (x) { /* ignore */ } connectBox(section, (info && info.workbookPath) || '', errorMessage(e)); return; }
    if (!result || !result.connected) { let info = null; try { info = await api().getWaitlistInfo(); } catch (x) { /* ignore */ } connectBox(section, (info && info.workbookPath) || (result && result.workbookPath) || '', (info && info.error) || ''); return; }
    try { openingResult = await api().listOpenings(); } catch (e) { console.error('Openings load failed', e); }
    const recs = Array.isArray(result.records) ? result.records : [];
    const openings = Array.isArray(openingResult.records) ? openingResult.records : [];
    SW.recs = recs;
    const cfg = getWaitlistCfg(section);
    const uniq = (key) => [...new Set(recs.map((r) => r[key]).filter(Boolean))].sort();
    const filters = [];
    if (cfg.fields.some((f) => f[0] === 'type')) filters.push({ key: 'type', label: 'All types', options: uniq('type'), test: (r, v) => r.type === v });
    if (cfg.fields.some((f) => f[0] === 'doctor')) filters.push({ key: 'doctor', label: 'All doctors', options: WaitlistRules.DOCTORS, test: (r, v) => WaitlistRules.doctorGroup(r.doctor) === v });
    const skip = ['date', 'patientName', 'type', 'doctor'];
    const advFields = cfg.fields.filter((f) => !skip.includes(f[0]));
    const advCount = () => Object.values(SW.adv).filter(Boolean).length;
    const advMatch = (r) => {
      const a = SW.adv;
      if (a.patientName && !waitlistVal(r.patientName).toLowerCase().includes(a.patientName.toLowerCase())) return false;
      if ((a.from || a.to) && !waitlistDateMatches(r.date, a.from || '', a.to || '')) return false;
      for (const [key] of advFields) { const v = a['f:' + key]; if (v && !waitlistVal(r[key]).toLowerCase().includes(v.toLowerCase())) return false; }
      return true;
    };
    const panel = `<div class="wl-panel ${SW.panelOpen ? 'is-open' : ''}" id="wlPanel"><div class="wl-panel-grid">
        <label>Patient<input data-adv="patientName" placeholder="Patient name" value="${esc(SW.adv.patientName || '')}"></label>
        <label>Date from<input data-adv="from" placeholder="MM/DD/YYYY" value="${esc(SW.adv.from || '')}"></label>
        <label>Date to<input data-adv="to" placeholder="MM/DD/YYYY" value="${esc(SW.adv.to || '')}"></label>
        ${advFields.map(([k, l]) => `<label>${esc(l)}<input data-adv="f:${k}" placeholder="Contains…" value="${esc(SW.adv['f:' + k] || '')}"></label>`).join('')}
      </div><div class="wl-panel-actions"><button type="button" class="btn btn-sm" id="wlClearAdv">Clear these filters</button></div></div>`;
    const headLeft = `<div class="seg" role="tablist" aria-label="Waitlist section">${Object.entries(WAITLIST_UI).map(([k, c]) => `<button type="button" role="tab" class="seg-btn ${k === section ? 'is-active' : ''}" data-section="${k}" aria-selected="${k === section}"><span>${esc(c.title)}</span>${k === section ? `<span class="seg-count" id="wlCount">${recs.length}</span>` : ''}</button>`).join('')}</div>`;
    const toolsRight = `<button type="button" class="btn" id="wlToggleFilters" aria-expanded="${SW.panelOpen}">${ico('filter')}More filters<span class="filter-count" id="wlFilterCount" hidden>0</span></button>`;

    renderList({
      pageKey: 'waitlist', state: SW, rows: recs, rowId: (r) => r._row, rowLabel: (r) => r.patientName, noun: 'patients',
      searchPlaceholder: 'Search every field…', searchText: (r) => Object.values(r).join(' '),
      tabs: [{ key: 'all', label: cfg.title, test: () => true, empty: `No patients in ${cfg.title}`, emptyHint: 'Use “Add Patient” to put someone on this list.' }],
      headLeft, filters, extraMatch: advMatch, isFiltering: () => advCount() > 0, panel, toolsRight,
      clearExtra: () => { SW.adv = {}; $$('[data-adv]').forEach((i) => { i.value = ''; }); syncCount(); },
      columns: [...cfg.fields.filter(([key]) => key === 'patientName'), ...cfg.fields.filter(([key]) => key === 'date'), ...cfg.fields.filter(([key]) => key !== 'patientName' && key !== 'date' && !(section === 'followup' && key === 'type'))].map(([key, label, type]) => ({
        key, label: key === 'date' ? 'Date Added' : label, p: WL_PRI[key] === undefined ? 2 : WL_PRI[key], sort: (r) => wlSortVal(r[key]),
        html: (r) => {
          const shown = waitlistDisplayValue(r[key], type);
          if (key === 'patientName') return `<div class="cell-main">${shown}</div>`;
          if (key === 'doctor') return `<span>${esc(WaitlistRules.doctorGroup(r.doctor))}</span>`;
          if (key === 'date') return `<span class="num wl-date-added">${shown}</span>`;
          if (key === WaitlistRules.scheduledField(section) && WaitlistRules.isPastDate(r[key])) return `<strong class="num wl-date-overdue" title="Scheduled date has passed">${shown}</strong>`;
          if (WL_WIDE.includes(key)) return `<div class="wl-notes" title="${esc(waitlistVal(r[key]))}">${shown}</div>`;
          if (WL_LONG.includes(key)) return `<div class="clip-2" title="${esc(waitlistVal(r[key]))}">${shown}</div>`;
          return `<span class="${/date/i.test(key) ? 'num' : ''}">${shown}</span>`;
        }
      })),
      source: `<span title="${esc(result.workbookPath || '')}">${esc(baseName(result.workbookPath))} · ${esc(result.worksheet || '')}</span><button type="button" class="btn btn-quiet btn-sm" id="wlOpenExcel">${ico('external', 'sm')}Open in Excel</button><button type="button" class="btn btn-quiet btn-sm" data-goto-settings>Change in Settings</button>`,
      onOpen: (r) => openWaitlistDrawer(section, r._row),
      afterPaint: (list) => { const c = $('#wlCount'); if (c) c.textContent = list.length; },
      wire: ({ paint }) => {
        settingsLinks();
        $$('[data-section]').forEach((b) => { b.onclick = () => renderWaitlistLanding(b.dataset.section); });
        $('#wlToggleFilters').onclick = () => { SW.panelOpen = !SW.panelOpen; $('#wlPanel').classList.toggle('is-open', SW.panelOpen); $('#wlToggleFilters').setAttribute('aria-expanded', String(SW.panelOpen)); };
        $$('[data-adv]').forEach((i) => i.addEventListener('input', () => { SW.adv[i.dataset.adv] = i.value.trim(); syncCount(); paint(); }));
        $('#wlClearAdv').onclick = () => { SW.adv = {}; $$('[data-adv]').forEach((i) => { i.value = ''; }); syncCount(); paint(); };
        $('#wlOpenExcel').onclick = () => api().openWaitlistWorkbook().catch((e) => showToast(errorMessage(e), 'error'));
        syncCount();
      }
    });
    function syncCount() { const n = advCount(), el = $('#wlFilterCount'); if (el) { el.hidden = n === 0; el.textContent = n; } }

    /* Openings stay visible beside the list in every section. */
    const listPage = $('.list-page');
    const layout = document.createElement('div'); layout.className = 'wl-layout';
    const main = document.createElement('div'); main.className = 'wl-main';
    listPage.parentNode.insertBefore(layout, listPage); main.appendChild(listPage); layout.appendChild(main);
    layout.insertAdjacentHTML('beforeend', openingsPanel(openings));
    wireOpenings(openings, section);
  }

  function openingsPanel(openings) {
    return `<aside class="openings-panel" aria-label="Openings"><div class="op-head"><div><h2>Openings</h2><div class="sub">Open doctor appointments</div></div><button type="button" class="btn btn-sm btn-primary" id="addOpeningBtn">${ico('plus', 'sm')}Opening</button></div><div id="openingEditor"></div><div class="opening-list">${openings.length ? openings.map((o) => `<div class="opening-card"><div class="op-top"><strong>${esc(o.appointmentType || 'Appointment')}</strong><span class="op-doc">${esc(o.doctor || '—')}</span></div><div class="opening-when">${fmtDate(o.date)} · ${esc(time12Value(o.time) || o.time || '—')}</div><div class="opening-actions"><button type="button" class="link-button" data-opening-edit="${o._row}">Edit</button><button type="button" class="link-button danger-link" data-opening-delete="${o._row}">Delete</button></div></div>`).join('') : '<p class="compact-empty">No openings registered.</p>'}</div><button type="button" class="btn btn-sm btn-block" id="openOpeningsExcel">${ico('external', 'sm')}Open openings in Excel</button></aside>`;
  }

  function wireOpenings(openings, section) {
    const editor = $('#openingEditor'); if (!editor) return;
    const refresh = () => renderWaitlistLanding(section);
    const showEditor = (o = {}) => {
      editor.innerHTML = openingEditorHtml(o);
      $('#cancelOpeningEdit').onclick = () => { editor.innerHTML = ''; };
      $('#openingForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget).entries());
        try {
          data.date = parseUsDate(data.date, 'Date'); data.time = parseTime12(data.time, 'Time');
          if (o._row) await api().updateOpening(o._row, data); else await api().addOpening(data);
          showToast(o._row ? 'Opening updated.' : 'Opening added.'); refresh();
        } catch (err) { showToast(errorMessage(err), 'error'); }
      };
      const first = editor.querySelector('select,input'); if (first) first.focus();
    };
    $('#addOpeningBtn').onclick = () => showEditor();
    $$('[data-opening-edit]').forEach((b) => { b.onclick = () => showEditor(openings.find((o) => o._row === Number(b.dataset.openingEdit)) || {}); });
    $$('[data-opening-delete]').forEach((b) => {
      b.onclick = async () => {
        const o = openings.find((x) => x._row === Number(b.dataset.openingDelete));
        if (!await UX.confirm({ title: 'Delete this opening?', message: `${o ? `${o.appointmentType || 'Appointment'} with ${o.doctor || 'the doctor'} on ${String(fmtDate(o.date))}` : 'This opening'} will be removed from the openings list.`, confirmLabel: 'Delete opening', danger: true })) return;
        try { await api().deleteOpening(Number(b.dataset.openingDelete)); showToast('Opening deleted.'); refresh(); } catch (e) { showToast(errorMessage(e), 'error'); }
      };
    });
    $('#openOpeningsExcel').onclick = () => api().openOpeningsWorkbook().catch((e) => showToast(errorMessage(e), 'error'));
  }

  async function openWaitlistDrawer(sectionArg, rowNumber) {
    const section = normalizeWaitlistSectionUI(sectionArg);
    if (UX.page !== 'waitlist' || SW.section !== section) await renderWaitlistLanding(section);
    const cfg = getWaitlistCfg(section);
    const row = asRow(rowNumber), isEdit = !!row;
    const r = isEdit ? (SW.recs.find((x) => x._row === row) || {}) : (section === 'annuals' ? { date: todayIso() } : {});
    openDrawer({
      title: isEdit ? (r.patientName || 'Patient') : `Add to ${cfg.title}`, accent: '#6517a8',
      subtitle: isEdit ? `Editing in ${esc(cfg.title)}` : `Adds a row to the ${esc(cfg.title)} worksheet.`,
      html: `<form id="wlForm"><div class="dgrid">${cfg.fields.map(([k, l, t]) => waitlistFieldInput(k, l, t, r)).join('')}</div></form>`,
      footer: `${isEdit ? '<button type="button" class="btn btn-danger" id="deleteWl">Delete patient</button>' : '<button type="button" class="btn" data-close>Cancel</button>'}<span class="spacer"></span><button type="button" class="btn btn-primary" id="saveWl">${isEdit ? 'Save changes' : 'Add patient'}</button>`,
      onMount: (root) => {
        const form = $('#wlForm', root);
        const doctorInput = form.querySelector('[data-wl-doctor]');
        if (doctorInput) doctorInput.addEventListener('change', () => { doctorInput.dataset.changed = 'yes'; });
        const save = async () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          // Filtering and displaying legacy doctor names must never normalize the Excel source implicitly.
          // Only a deliberate change to the doctor selector writes one of the three new standard values.
          if (isEdit && doctorInput && doctorInput.dataset.changed !== 'yes') data.doctor = r.doctor || '';
          try {
            const dateField = cfg.fields.find((f) => f[0] === 'date');
            if (data.date && dateField && dateField[2] === 'date') data.date = parseUsDate(data.date, 'Date');
            /* A typed MM/DD/YYYY becomes a real Excel date; free text such as "NONE" or "09/08 & 09/10" stays exactly as typed. */
            for (const [k, , t] of cfg.fields) if (t === 'dateText' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(data[k] || '').trim())) data[k] = parseUsDate(String(data[k]).trim(), k);
            if (data.type) data.type = normalizeExamType(data.type);
            if (isEdit) await api().updateWaitlist(row, data, section); else await api().addWaitlist(data, section);
            showToast(isEdit ? 'Waitlist updated.' : 'Patient added to the waitlist.'); closeDrawer(true); renderWaitlistLanding(section);
          } catch (err) { showToast(errorMessage(err), 'error'); }
        };
        $('#saveWl', root).onclick = save;
        form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
        const del = $('#deleteWl', root);
        if (del) del.onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r.patientName || 'this patient'}?`, message: `This removes the row from ${cfg.title} in the shared waitlist workbook. A backup is created first.`, confirmLabel: 'Delete patient', danger: true })) return;
          try { await api().deleteWaitlist(row, section); showToast('Patient deleted.'); closeDrawer(true); renderWaitlistLanding(section); } catch (err) { showToast(errorMessage(err), 'error'); }
        };
      }
    });
  }
  const renderWaitlistRecordForm = (section, rowNumber = null) => openWaitlistDrawer(section, rowNumber);
  const waitlistErrorScreen = (section, error, workbookPath = '') => connectBox(normalizeWaitlistSectionUI(section), workbookPath, errorMessage(error));

  /* =============================================================== START-UP */
  Object.assign(window, {
    renderInitialLanding, renderInitialQuickAdd, renderInitialTrackingDetail,
    renderInitialTrackingEdit: (row) => renderInitialTrackingDetail(row),
    renderCancellationLanding, renderCancellationForm, renderCancellationDetail, renderCancellationFollowup, openCancellationNew,
    renderWaitlistLanding, renderWaitlistRecordForm, waitlistErrorScreen
  });

  function wireNavigation() {
    const go = {
      home: () => window.renderDashboard(), referral: () => window.renderReferralHome(), setup: () => window.renderSetupLanding(),
      incomplete: () => window.renderScheduleIncompleteLanding(), payment: () => window.renderInitialLanding(),
      cancellations: () => window.renderCancellationLanding(), waitlist: () => window.renderWaitlistLanding(),
      reports: () => window.renderWeeklyReport(), weekly: () => window.renderWeeklyReport(),
      'weekly-dashboard': () => window.renderWeeklyReport(), 'weekly-weeks': () => window.renderWeeklyReportWeeks(),
      monthly: () => window.renderMonthlyReport(), settings: () => window.renderSettings()
    };
    $$('[data-nav]').forEach((b) => { b.onclick = () => go[b.dataset.nav]?.(); });
    $$('[data-report-nav]').forEach((b) => { b.onclick = () => go[b.dataset.reportNav]?.(); });
    $('#menuToggle').onclick = () => {
      const shell = $('#appShell');
      if (shell.classList.contains('reports-open')) {
        const sub = $('#reportsSubNav');
        if (sub) {
          sub.hidden = !sub.hidden;
          shell.classList.toggle('reports-subnav-collapsed', sub.hidden);
        }
        return;
      }
      UX.setCollapsed(!shell.classList.contains('collapsed'));
    };
    $('#quickNewIC').onclick = () => window.renderInitialForm();
    const brand = $('#brandHome');
    brand.onclick = () => window.renderDashboard();
    brand.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.renderDashboard(); } };
  }
  window.wireGlobalNavigation = wireNavigation;

  window.addEventListener('error', (e) => console.error(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
  UX.initShell();
  UX.enhanceLegacyButtons();
  wireNavigation();
  if (window.clinicAPI) window.renderDashboard();
  else fatal(new Error('The local application bridge did not initialize. Please use the updated build.'));
})();
