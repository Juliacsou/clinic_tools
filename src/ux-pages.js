/* Visual Health Clinic Tools — screens, part 1 (v2.15.0)
   Home, Settings, Referral Follow-Up, Setup, Schedule Incomplete.
   Same clinicAPI calls and validation helpers as before; new layout only. */
(function () {
  'use strict';
  const UX = window.UX;
  const { $, $$, ico, chip, baseName, openDrawer, closeDrawer, switchTab, markClean, renderList, loading, fatal, showToast, copyToClipboard, setHeader } = UX;
  const api = () => window.clinicAPI;
  const T = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : esc(v));
  const dash = (v) => (v ? esc(v) : '<span class="muted">—</span>');
  const facts = (pairs) => `<dl class="facts2">${pairs.map(([k, v, full]) => `<div class="${full ? 'full' : ''}"><dt>${esc(k)}</dt><dd class="${full ? 'pre' : ''}">${v}</dd></div>`).join('')}</dl>`;
  const asRow = (v) => (v !== null && v !== undefined && typeof v !== 'object' && Number.isFinite(Number(v)) ? Number(v) : null);
  const settingsLinks = () => $$('[data-goto-settings]').forEach((b) => { b.onclick = () => window.renderSettings(); });
  const sourceHtml = (path) => `<span>Excel file</span><span class="src-name" title="${esc(path)}">${esc(baseName(path))}</span><button type="button" class="btn btn-quiet btn-sm" data-goto-settings>Change in Settings</button>`;
  const simBanner = (what) => `<div class="banner warn" role="status"><span><strong>Using the built-in practice workbook.</strong> Nothing saved in ${esc(what)} reaches the clinic’s real monthly spreadsheet until you connect it.</span><button type="button" class="btn btn-sm" data-goto-settings>Connect your Excel</button></div>`;
  /* Referral hand-off: after 3 attempts AND the call to the referring doctor, someone else sends the thank-you letters. */
  const REF_CLOSED = ['Scheduled', 'Not booked'];
  const REF_THANKS = ['Referring doctor contacted', 'Letter sent'];
  const isThanks = (r) => REF_THANKS.includes(r._status);
  const isMyFollowUp = (r) => !REF_CLOSED.includes(r._status) && !isThanks(r);
  const daysSince = (iso) => {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  };

  /* =============================================================== HOME */
  async function renderDashboard() {
    setHeader('Clinic Tools');
    UX.page = 'home';
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const mods = [
      { key: 'referral', nav: 'referral', name: 'Referral Follow-Up', desc: 'Families who still need a call or a next step.', mc: '#15a9e8', icon: 'referral',
        load: async () => { const r = await api().listReferrals(); return { n: r.filter(isMyFollowUp).length, label: 'need follow-up' }; } },
      { key: 'setup', nav: 'setup', name: 'Initial Contact & Setup', desc: 'Scheduled patients still waiting on Crystal or the first email.', mc: '#15bf35', icon: 'setup',
        load: async () => { const r = (await api().listSetup()).records || []; return { n: r.filter((x) => x._state !== 'Completed').length, label: 'need setup' }; } },
      { key: 'incomplete', nav: 'incomplete', name: 'Schedule Incomplete', desc: 'Calls that ended before an appointment was booked.', mc: '#f08a24', icon: 'incomplete',
        load: async () => { const r = (await api().listIncomplete()).records || []; return { n: r.filter((x) => ['incomplete','follow-up'].includes(String(x.status || '').trim().toLowerCase())).length, label: 'need follow-up' }; } },
      { key: 'payment', nav: 'payment', name: 'Payment Tracking', desc: 'Deposits that have not been collected yet.', mc: '#e0b400', icon: 'payment',
        load: async () => { const r = (await api().listInitialTracking()).records || []; return { n: r.filter((x) => ['Pending', 'Needs review'].includes(x._depositState)).length, label: 'need a deposit' }; } },
      { key: 'cancellations', nav: 'cancellations', name: 'Exam Cancelations', desc: 'Cancelled or missed exams that still need rescheduling.', mc: '#e1192d', icon: 'cancel',
        load: async () => { const r = (await api().listCancellations()).records || []; return { n: r.filter((x) => x._state === 'Follow-up').length, label: 'need follow-up' }; } },
      { key: 'weekly', nav: 'weekly', name: 'Weekly Report', desc: 'Import Crystal PM CSVs and calculate the weekly clinic report.', mc: '#138a91', icon: 'weekly', load: async () => ({ n: 'CSV', label: 'weekly and ahead' }) },
      { key: 'monthly', nav: 'monthly', name: 'Monthly Report', desc: 'Review and save reports for a complete calendar month.', mc: '#5372bb', icon: 'weekly', load: async () => ({ n: 'MONTH', label: 'calendar month' }) },
      { key: 'waitlist', nav: 'waitlist', name: 'Waitlist', desc: 'Testings, parent consultations and follow-ups waiting for a slot.', mc: '#6517a8', icon: 'waitlist',
        load: async () => { const x = await api().listWaitlist('testings'); if (!x || !x.connected) return { n: null, label: 'Excel not connected', warn: true }; return { n: (x.records || []).length, label: 'waiting for testing' }; } }
    ];
    appEl.innerHTML = `<section class="home-top"><div><h1>Today’s work</h1><p>${esc(today)}</p></div><div class="intro-actions"><button type="button" class="btn" id="homeNewRef">New referral</button><button type="button" class="btn" id="homeNewCancel">Log a cancelation</button></div></section>
      <div class="queue">${mods.map((m) => `<button type="button" class="queue-row" data-go="${m.nav}" style="--mc:${m.mc}"><span class="queue-ico">${ico(m.icon)}</span><span><div class="queue-name">${esc(m.name)}</div><div class="queue-desc">${esc(m.desc)}</div></span><span class="queue-metric" id="q-${m.key}"><div class="queue-n">…</div><div class="queue-l">&nbsp;</div></span><span class="queue-go">${ico('chev')}</span></button>`).join('')}</div>`;
    $$('[data-go]').forEach((b) => { b.onclick = () => ({ referral: window.renderReferralHome, setup: window.renderSetupLanding, incomplete: window.renderScheduleIncompleteLanding, payment: window.renderInitialLanding, cancellations: window.renderCancellationLanding, waitlist: window.renderWaitlistLanding, weekly: window.renderWeeklyReport, monthly: window.renderMonthlyReport })[b.dataset.go](); });
    $('#homeNewRef').onclick = () => window.renderReferralForm();
    $('#homeNewCancel').onclick = () => window.openCancellationNew();
    mods.forEach((m) => {
      m.load().then((res) => {
        const el = document.getElementById(`q-${m.key}`); if (!el) return;
        el.classList.toggle('is-warn', !!res.warn);
        el.innerHTML = `<div class="queue-n">${res.n === null ? '—' : res.n}</div><div class="queue-l">${esc(res.label)}</div>`;
      }).catch((e) => {
        const el = document.getElementById(`q-${m.key}`); if (!el) return;
        el.classList.add('is-warn');
        el.innerHTML = `<div class="queue-n">—</div><div class="queue-l" title="${esc(errorMessage(e))}">Could not load</div>`;
      });
    });
  }

  /* =============================================================== SETTINGS */
  async function renderSettings() {
    setHeader('Settings');
    UX.page = 'settings';
    appEl.innerHTML = `<div class="settings">
      <section><h2>Excel connections</h2><p class="lead">Choose the spreadsheet each tool reads and writes. Existing records are preserved; The app retains the v2.24 migration for follow-up columns to the selected cancellation workbook after backup. Close Excel before upgrading.</p>
        <div id="setPayment" class="set-card"><span class="muted">Loading Payment Tracking…</span></div>
        <div id="setCancel" class="set-card"><span class="muted">Loading Exam Cancelations…</span></div>
        <div id="setWaitlist" class="set-card"><span class="muted">Loading Waitlist…</span></div>
        <div id="setWeekly" class="set-card"><span class="muted">Loading Weekly Reports…</span></div>
      </section>
      <section><h2>Workbooks managed by the app</h2><p class="lead">These live in the app’s data folder. Open them in Excel if you need to look at the raw rows.</p>
        <div class="set-rows">
          <div class="set-row"><div><div class="set-name">New Patient Setup</div><div class="set-sub">Setup checklist and Initial Contact data</div></div><button type="button" class="btn btn-sm" data-open="setup">${ico('external', 'sm')}Open in Excel</button></div>
          <div class="set-row"><div><div class="set-name">Schedule Incomplete</div><div class="set-sub">Calls that did not finish scheduling</div></div><button type="button" class="btn btn-sm" data-open="incomplete">${ico('external', 'sm')}Open in Excel</button></div>
          <div class="set-row"><div><div class="set-name">Waitlist openings</div><div class="set-sub">Doctor openings shown beside the waitlist</div></div><button type="button" class="btn btn-sm" data-open="openings">${ico('external', 'sm')}Open in Excel</button></div>
        </div></section>
      <section><h2>Data folder</h2><p class="lead">Choose where Clinic Tools stores its records. Existing data will not be deleted.</p>
        <div class="set-card"><div class="set-meta" style="grid-template-columns:1fr"><div><span>Location</span><strong id="setDataPath">…</strong></div></div><div class="set-actions"><button type="button" class="btn btn-sm" id="copyDataPath">${ico('copy', 'sm')}Copy path</button><button type="button" class="btn btn-primary btn-sm" id="chooseDataPath">Change data folder</button></div></div></section>
    </div>`;

    const meta = (path, a, b) => `<div class="set-meta"><div><span>File</span><strong title="${esc(path)}">${esc(path || 'Not selected')}</strong></div>${a ? `<div><span>${esc(a[0])}</span><strong>${esc(a[1])}</strong></div>` : ''}${b ? `<div><span>${esc(b[0])}</span><strong>${esc(b[1])}</strong></div>` : ''}</div>`;

    const monthly = async (hostId, title, sub, getInfo, choose, connect, simulate, need, builtinOk = false) => {
      const host = document.getElementById(hostId);
      let info;
      try { info = await getInfo(); } catch (e) { host.innerHTML = `<div class="set-head"><div><div class="set-name">${esc(title)}</div><div class="set-sub">${esc(sub)}</div></div>${chip('Needs attention', 'bad')}</div><div class="banner bad">${esc(errorMessage(e))}</div><div class="set-actions"><button type="button" class="btn btn-primary btn-sm" data-act="change">Choose Excel file</button></div>`; wire(); return; }
      host.innerHTML = `<div class="set-head"><div><div class="set-name">${esc(title)}</div><div class="set-sub">${esc(sub)}</div></div>${info.usingSimulation ? (builtinOk ? chip('Built-in workbook', 'mute') : chip('Practice workbook', 'warn')) : chip('Connected', 'ok')}</div>
        ${meta(info.workbookPath, ['Worksheet', info.analysis.worksheet], ['Fields matched', `${Object.keys(info.analysis.mapping || {}).length} of ${need}`])}
        <div class="set-actions"><button type="button" class="btn btn-primary btn-sm" data-act="change">Choose Excel file</button>${info.usingSimulation ? '' : `<button type="button" class="btn btn-sm" data-act="sim">Use ${builtinOk ? 'built-in' : 'practice'} workbook</button>`}</div>`;
      wire();
      function wire() {
        const change = host.querySelector('[data-act="change"]');
        if (change) change.onclick = async () => {
          try {
            const chosen = await choose(); if (!chosen) return;
            if (chosen.analysis.score < need) { showToast(`That file was read, but only ${chosen.analysis.score} of ${need} expected columns matched. Pick the monthly sheet for this tool.`, 'error'); return; }
            await connect(chosen.filePath); showToast(`${title} connected.`); renderSettings();
          } catch (e) { showToast(errorMessage(e), 'error'); }
        };
        const sim = host.querySelector('[data-act="sim"]');
        if (sim) sim.onclick = async () => { try { await simulate(); showToast('Switched to the practice workbook.'); renderSettings(); } catch (e) { showToast(errorMessage(e), 'error'); } };
      }
    };
    monthly('setPayment', 'Payment Tracking', 'Monthly deposit workbook', () => api().getInitialInfo(), () => api().chooseInitialWorkbook(), (p) => api().connectInitialWorkbook(p), () => api().useSimulationWorkbook(), 9);
    monthly('setCancel', 'Exam Cancelations', 'Monthly cancelation workbook', () => api().getCancellationInfo(), () => api().chooseCancellationWorkbook(), (p) => api().connectCancellationWorkbook(p), () => api().useCancellationSimulation(), 14, true);

    (async () => {
      const host = document.getElementById('setWaitlist');
      let info = null, err = '';
      try { info = await api().getWaitlistInfo(); } catch (e) { err = errorMessage(e); }
      const connected = !!(info && info.connected);
      host.innerHTML = `<div class="set-head"><div><div class="set-name">Waitlist</div><div class="set-sub">Shared “Current Waitlist” workbook (Testings, PC’s, Follow-up)</div></div>${connected ? chip('Connected', 'ok') : (info && info.workbookPath ? chip('Needs reconnecting', 'bad') : chip('Not connected', 'warn'))}</div>
        ${meta(info && info.workbookPath, connected ? ['Worksheets', `${(info.worksheets || []).length}`] : null)}
        ${(err || (info && info.error)) ? `<div class="banner bad">${esc(err || info.error)}</div>` : ''}
        <div class="set-actions"><button type="button" class="btn btn-primary btn-sm" id="wlChoose">${connected ? 'Choose a different file' : 'Choose Excel file'}</button>${connected ? `<button type="button" class="btn btn-sm" id="wlOpen">${ico('external', 'sm')}Open in Excel</button>` : ''}</div>`;
      $('#wlChoose').onclick = async () => { try { const x = await api().chooseWaitlistWorkbook(); if (x) { showToast('Waitlist connected.'); renderSettings(); } } catch (e) { showToast(errorMessage(e), 'error'); } };
      const o = $('#wlOpen'); if (o) o.onclick = () => api().openWaitlistWorkbook().catch((e) => showToast(errorMessage(e), 'error'));
    })();

    (async () => {
      const el = $('#setWeekly');
      try {
        const x = await api().getWeeklyInfo();
        el.innerHTML = `<div class="set-head"><div><div class="set-name">Weekly Reports</div><div class="set-sub">Weekly clinic activity report (.xls or .xlsx)</div></div>${x.connected ? chip('Connected', 'ok') : chip('Not connected', 'warn')}</div>
          ${meta(x.workbookPath || '', x.connected ? ['Last week', x.lastWeek || '—'] : null)}
          ${x.invalidWorkbook ? `<div class="banner bad">${esc(x.error || 'Could not open the Excel file.')}</div>` : ''}
          ${x.missingWorkbook ? '<div class="banner warn">The previously selected workbook could not be found.</div>' : ''}
          <div class="set-actions"><button type="button" class="btn btn-primary btn-sm" id="setWeeklyChoose">${x.connected ? 'Change Excel file' : 'Choose Excel file'}</button></div>`;
        $('#setWeeklyChoose').onclick = async () => {try{const v=await api().connectWeeklyWorkbook();if(v){showToast('Weekly Reports workbook connected.');renderSettings();}}catch(e){showToast(errorMessage(e),'error');}};
      } catch(e) {el.innerHTML = `<div class="set-name">Weekly Reports</div><div class="banner bad">${esc(errorMessage(e))}</div><button class="btn btn-sm" id="setWeeklyRetry">Retry</button>`;$('#setWeeklyRetry').onclick = renderSettings;}
    })();

    const openers = { setup: () => api().openSetupWorkbook(), incomplete: () => api().openIncompleteWorkbook(), openings: () => api().openOpeningsWorkbook() };
    $$('[data-open]').forEach((b) => { b.onclick = () => openers[b.dataset.open]().catch((e) => showToast(errorMessage(e), 'error')); });
    api().getDataLocation().then((p) => { const el = $('#setDataPath'); if (el) el.textContent = p; $('#copyDataPath').onclick = () => copyToClipboard(p, 'Folder path'); const choose=$('#chooseDataPath'); if(choose)choose.onclick=async()=>{ try { const result=await api().chooseDataLocation(); if(result){showToast('Data folder updated. Original files were preserved.');renderSettings();} } catch(e){showToast(errorMessage(e),'error');} }; }).catch(() => { const el = $('#setDataPath'); if (el) el.textContent = 'Unavailable'; });
  }

  /* =============================================================== REFERRAL */
  const SR = { tab: 'active', q: '', filters: {}, sort: null, openId: '' };
  const refKind = (s) => (s === 'Scheduled' || s === 'Letter sent' ? 'ok' : s === 'Not booked' ? 'mute' : s === 'Call referring doctor' ? 'warn' : 'info');
  const refAttempts = (r) => ['1st', '2nd', '3rd'].filter((p) => r[`${p} Contact - Date/Time`]).length;
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');

  async function renderReferralHome() {
    setHeader('Referral Follow-Up', '+ New Referral', () => window.renderReferralForm());
    loading('Loading referrals…');
    let recs;
    try { recs = await api().listReferrals(); } catch (e) { fatal(e, renderReferralHome); return; }
    const cPatient = { key: 'patient', label: 'Patient', sort: (r) => String(r['Patient Name'] || '').toLowerCase(), html: (r) => `<div class="cell-main">${esc(r['Patient Name'])}</div><div class="sub">${esc([r['Age'] ? `${r['Age']} yrs` : '', r['Grade'] ? `Grade ${r['Grade']}` : ''].filter(Boolean).join(' · '))}</div>` };
    const cBy = (pri) => ({ key: 'by', label: 'Referred by', p: pri, sort: (r) => String(r['Referring Doctor'] || '').toLowerCase(), html: (r) => `<div>${dash(r['Referring Doctor'])}</div><div class="sub clip" title="${esc(r['Office Name'] || '')}">${esc(r['Office Name'] || '')}</div>` });
    const cEval = { key: 'eval', label: 'Evaluation', p: 3, html: (r) => `<div class="clip" title="${esc(r['Recommended Evaluation'] || '')}">${dash(r['Recommended Evaluation'])}</div>` };
    const cAttempts = { key: 'attempts', label: 'Attempts', sort: refAttempts, html: (r) => { const n = refAttempts(r); return `<span class="dots" title="${n} of 3 contact attempts logged">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; } };
    const cLast = (pri) => ({ key: 'last', label: 'Last contact', p: pri, sort: (r) => referralLastContact(r).date || '', html: (r) => { const l = referralLastContact(r); return l.date ? `<div class="num">${fmtDateTime(l.date)}</div>${l.comment ? `<div class="sub clip" title="${esc(l.comment)}">${esc(l.comment)}</div>` : ''}` : '<span class="muted">No contact yet</span>'; } });
    const cWaiting = { key: 'waiting', label: 'Waiting', p: 2, sort: (r) => (isMyFollowUp(r) ? daysSince(r['Date']) : ''), html: (r) => { const d = isMyFollowUp(r) ? daysSince(r['Date']) : ''; return d === '' ? '<span class="muted">—</span>' : `<span class="num" title="Days since the referral date">${d} d</span>`; } };
    const cStatus = { key: 'status', label: 'Status', sort: (r) => r._status, html: (r) => chip(r._status, refKind(r._status)) };
    const cReason = { key: 'reason', label: 'Reason for not booking', sort: (r) => (r._status === 'Not booked' ? String(r['Reason for Not Booking'] || '').toLowerCase() : ''), html: (r) => (r._status === 'Not booked' ? `<div class="reason-cell" title="${esc(r['Reason for Not Booking'] || '')}">${dash(r['Reason for Not Booking'])}</div>` : '<span class="muted">—</span>') };
    const dateCol = (key, label, field, pri) => ({ key, label, p: pri, sort: (r) => dateOnly(r[field]), html: (r) => `<span class="num">${r[field] ? fmtDate(r[field]) : '<span class="muted">—</span>'}</span>` });

    renderList({
      pageKey: 'referral', state: SR, rows: recs, rowId: (r) => r._row, rowLabel: (r) => r['Patient Name'], noun: 'referrals',
      searchPlaceholder: 'Search patient, doctor or concern…',
      searchText: (r) => [r['Patient Name'], r['DOB'], r['Parent Name'], r['Phone'], r['Email'], r['Referring Doctor'], r['Referring Doctor Phone'], r['Office Name'], r['Recommended Evaluation'], r['Patient/Parent Concerns or Symptoms'], r['Reason for Not Booking']].join(' '),
      tabs: [
        { key: 'active', label: 'Needs follow-up', test: isMyFollowUp, columns: [cPatient, cBy(2), cEval, cAttempts, cLast(0), cWaiting, cStatus], empty: 'No referrals need follow-up', emptyHint: 'Referrals stay here until the family schedules, declines, or you have made 3 attempts and contacted the referring doctor.' },
        { key: 'thanks', label: 'Thank yous', test: isThanks, columns: [cPatient, cBy(2), dateCol('drcall', 'Doctor contacted', 'Call Referring Dr.', 0), dateCol('letter', 'Letter to patient', 'Letter to Patient', 0), dateCol('thank', 'Thank-you letter', 'Thank You Letter', 2), cStatus], empty: 'No one is waiting on thank-you letters', emptyHint: 'After 3 attempts and the call to the referring doctor, the patient moves here for the thank-you letters.' },
        { key: 'closed', label: 'Scheduled or not booking', test: (r) => REF_CLOSED.includes(r._status), columns: [cPatient, cBy(3), cReason, cLast(2), cStatus], empty: 'Nothing closed yet' }
      ],
      filters: [{ key: 'status', label: 'All statuses', options: STATUSES, test: (r, v) => r._status === v }],
      defaultSort: (tab) => (tab === 'active' ? { key: 'waiting', dir: 'desc' } : tab === 'thanks' ? { key: 'drcall', dir: 'desc' } : { key: 'last', dir: 'desc' }),
      columns: [cPatient, cBy(2), cEval, cAttempts, cLast(0), cWaiting, cStatus],
      intro: '<p>Click a patient to log a contact attempt, update next steps or start the Initial Contact. After 3 attempts and the call to the referring doctor, the case moves to Thank yous.</p><div class="intro-actions"><button type="button" class="btn" id="exportRefDrReport">Export referring doctor report</button></div>',
      onOpen: (r) => openReferralDrawer(r._row),
      wire: () => {
        $('#exportRefDrReport').onclick = async () => { try { const p = await api().exportReferringDoctorReport(); if (p) showToast('Report saved: ' + p); } catch (e) { showToast(errorMessage(e), 'error'); } };
      }
    });
  }

  async function openReferralDrawer(rowNumber, tab) {
    let r;
    try { r = await api().getReferral(rowNumber); } catch (e) { showToast(errorMessage(e), 'error'); return; }
    if (!r) { showToast('Referral not found.', 'error'); return; }
    const closed = REF_CLOSED.includes(r._status);
    const source = [r['Referring Doctor'], r['Office Name']].filter(Boolean).join(' / ');
    const contactDone = refAttempts(r);
    const callDrDefault = r['Call Referring Dr.'] || ((contactDone >= 3 && !closed) ? todayIso() : '');
    const letterDefault = r['Letter to Patient'] || ((r['Call Referring Dr.'] && !r['Letter to Patient']) ? todayIso() : '');
    const thankDefault = r['Thank You Letter'] || ((r['Letter to Patient'] && !r['Thank You Letter']) ? todayIso() : '');
    const doctorScriptName = String(r['Referring Doctor'] || '').replace(/^Dr\.?\s*/i, '').trim() || '[Name]';
    const contactDrScript = `Hi, this is Julia calling from Visual Health & Learning Center. I'm calling regarding a patient referred to us by Dr. ${doctorScriptName}. I just wanted to let your office know that we reached out to the family, but they never scheduled an evaluation with us. We wanted to make sure your office was aware, so you may want to make a note in the patient's chart that they did not follow through with the referral. Thank you!`;

    const steps = ['1st', '2nd', '3rd'].map((p, i) => {
      const dt = r[`${p} Contact - Date/Time`], cm = r[`${p} Contact - Comment`];
      return `<li class="step ${dt ? 'is-done' : ''}"><span class="step-n">${i + 1}</span><div><div class="step-title">${p} contact${dt ? `<span class="muted num"> · ${fmtDateTime(dt)}</span>` : ''}</div><p class="step-note ${cm ? '' : 'muted'}">${cm ? esc(cm) : (dt ? 'No comment' : 'Not attempted yet')}</p></div></li>`;
    }).join('');
    const addContact = (r._next_attempt && !closed)
      ? `<div class="panel-block"><h3>Log attempt ${r._next_attempt}</h3><form id="contactForm"><input type="hidden" name="attempt" value="${r._next_attempt}">${referralContactScript(r._next_attempt, r)}<label>Date and time<div class="datetime-with-action"><input id="contactDateTime" type="text" autocomplete="off" placeholder="MM/DD/YYYY hh:mm AM/PM" name="contact_datetime" value="${esc(nowUsDateTime())}" required><button type="button" class="btn btn-sm" id="useNowContact">Now</button></div></label><label>Comment<textarea name="comment" rows="3" placeholder="What happened on this call?"></textarea></label><div class="form-row-end" style="margin-top:0"><button class="btn btn-primary" type="submit">Save contact</button></div></form></div>`
      : (closed ? '' : '<div class="banner warn" style="margin-bottom:12px"><span>All three attempts are logged. Continue in the <strong>Next steps</strong> tab.</span></div>');

    const existingPdfCount = r._pdf_files?.length || 0;
    const pdfs = `<div class="dsection"><h3>Referral files</h3><div class="inline-actions">${existingPdfCount ? r._pdf_files.map((f, i) => (f.exists ? `<button type="button" class="btn btn-sm referral-pdf-btn" data-pdf-index="${i}">View PDF ${i + 1}</button>` : `<span class="missing-file">PDF ${i + 1} missing</span>`)).join('') : '<span class="muted small">No PDF attached yet.</span>'}${existingPdfCount < 3 ? `<button type="button" class="btn btn-sm" id="attachReferralPdfBtn">+ Attach PDF</button>` : ''}</div></div>`;

    const tabs = [
      { key: 'contact', label: 'Contact', html: `<ol class="steps">${steps}</ol>${addContact}` },
      { key: 'info', label: 'Patient and referral', html: `<div class="dsection">${facts([
        ['Patient', T(r['Patient Name'])], ['Referral date', fmtDate(r['Date'])], ['Date of birth', fmtDate(r['DOB'])], ['Age', T(r['Age'])],
        ['Parent', T(r['Parent Name'])], ['Phone', T(r['Phone'])], ['Email', T(r['Email'])], ['Grade', T(r['Grade'])],
        ['Referring doctor', T(r['Referring Doctor'])], ['Doctor phone', T(r['Referring Doctor Phone'])], ['Office', T(r['Office Name'])], ['Recommended evaluation', T(r['Recommended Evaluation'])],
        ['Concerns or symptoms', T(r['Patient/Parent Concerns or Symptoms']), true]])}</div>${pdfs}` },
      { key: 'next', label: 'Next steps', html: `<form id="nextStepsForm"><div class="dsection"><div class="dgrid"><label>Call referring doctor${dateTextInput('Call Referring Dr.', callDrDefault)}</label><span></span><div class="span-2 next-step-script"><strong>Script for the referring doctor’s office</strong><p>${esc(contactDrScript)}</p><button type="button" class="btn btn-sm copy-contact-dr-script" data-copy-text="${encodeURIComponent(contactDrScript)}">${ico('copy', 'sm')}Copy script</button></div><label>Letter to patient${dateTextInput('Letter to Patient', letterDefault)}</label><label>Thank-you letter${dateTextInput('Thank You Letter', thankDefault)}</label><label class="span-2">Reason for not booking<textarea name="Reason for Not Booking" rows="3">${formValue(r, 'Reason for Not Booking')}</textarea></label></div></div><div class="form-row-end" style="margin-top:0"><button class="btn btn-primary" type="submit">Save next steps</button></div></form>` }
    ];

    const notBooked = r._status === 'Not booked';
    const notice = notBooked
      ? `<strong>Not booking: case closed</strong>This family chose not to schedule and will not be followed up any more.<span class="why">Reason: ${esc(r['Reason for Not Booking'] || 'No reason was recorded')}</span>`
      : (isThanks(r) ? 'Handed off for thank-you letters. Nothing more to do on your side.' : '');
    openDrawer({
      notice, noticeKind: notBooked ? 'closed' : '',
      title: r['Patient Name'] || 'Referral', accent: '#15a9e8', wide: true,
      subtitle: esc(source ? `Referred by ${source}` : 'Referral'), chip: chip(r._status, refKind(r._status)),
      actions: `<button type="button" class="btn btn-primary" id="startInitialBtn">Start Initial Contact</button>${r._status !== 'Scheduled' ? '<button type="button" class="btn" id="scheduleBtn">Mark as scheduled</button>' : '<button type="button" class="btn" id="followBtn">Return to follow-up</button>'}<button type="button" class="btn" id="editBtn">Edit referral</button>`,
      tabs, activeTab: tab || (isThanks(r) ? 'next' : closed ? 'info' : 'contact'),
      footer: '<button type="button" class="btn btn-danger" id="deleteReferralBtn">Delete referral</button><span class="spacer"></span><button type="button" class="btn" data-close>Close</button>',
      onMount: (root) => {
        const reopen = async (t) => { markClean(); await renderReferralHome(); openReferralDrawer(rowNumber, t); };
        $('#startInitialBtn', root).onclick = () => { closeDrawer(true); window.renderInitialForm({ patientName: r['Patient Name'] || '', age: r['Age'] || '', dob: r['DOB'] || '', parentName: r['Parent Name'] || '', phone: r['Phone'] || '', email: r['Email'] || '', grade: r['Grade'] || '', referralSource: source || r['Referring Doctor'] || r['Office Name'] || '', nonDoctorNotes: r['Patient/Parent Concerns or Symptoms'] || '', _referralRow: rowNumber }, { referralRow: rowNumber }); };
        $('#editBtn', root).onclick = () => { closeDrawer(true); window.renderReferralForm(rowNumber); };
        const sch = $('#scheduleBtn', root);
        if (sch) sch.onclick = async () => { if (!await UX.confirm({ title: 'Mark as scheduled?', message: `${r['Patient Name']} will move to “Scheduled or not booking”.`, confirmLabel: 'Mark as scheduled' })) return; try { await api().setBookingStatus(rowNumber, 'Scheduled'); showToast('Marked as scheduled.'); reopen('info'); } catch (e) { showToast(errorMessage(e), 'error'); } };
        const fol = $('#followBtn', root);
        if (fol) fol.onclick = async () => { try { await api().setBookingStatus(rowNumber, ''); showToast('Returned to follow-up.'); reopen('contact'); } catch (e) { showToast(errorMessage(e), 'error'); } };
        $('#deleteReferralBtn', root).onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r['Patient Name']}?`, message: 'This removes the referral from the Excel file. A backup is created first.', confirmLabel: 'Delete referral', danger: true })) return;
          try { await api().deleteReferral(rowNumber); showToast('Referral deleted.'); closeDrawer(true); renderReferralHome(); } catch (e) { showToast(errorMessage(e), 'error'); }
        };
        $$('.referral-pdf-btn', root).forEach((b) => { b.onclick = () => api().openReferralPdf(rowNumber, Number(b.dataset.pdfIndex)).catch((e) => showToast(errorMessage(e), 'error')); });
        const attachBtn = $('#attachReferralPdfBtn', root);
        if (attachBtn) attachBtn.onclick = async () => {
          try {
            const picked = await api().chooseReferralPdfs();
            if (!picked?.length) return;
            if (existingPdfCount + picked.length > 3) { showToast(`This patient can have at most 3 referral PDFs. ${3 - existingPdfCount} slot(s) remain.`, 'error'); return; }
            const res = await api().attachReferralPdfs(rowNumber, picked);
            if (res?.moveWarnings?.length) showToast(`PDF attached, but ${res.moveWarnings.join(' ')}`, 'error');
            else showToast('Referral PDF saved to clinic data and original removed.');
            reopen('info');
          } catch (e) { showToast(errorMessage(e), 'error'); }
        };
        wireScriptCopyButtons();
        $$('.copy-contact-dr-script', root).forEach((b) => { b.onclick = () => copyToClipboard(decodeURIComponent(b.dataset.copyText || ''), 'Script'); });
        const now = $('#useNowContact', root); if (now) now.onclick = () => { $('#contactDateTime', root).value = nowUsDateTime(); };
        const cf = $('#contactForm', root);
        if (cf) cf.onsubmit = async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(new FormData(cf).entries());
          try { payload.contact_datetime = parseUsDateTime(payload.contact_datetime, 'Date/Time'); } catch (err) { showToast(errorMessage(err), 'error'); return; }
          try { await api().addContact(rowNumber, payload); showToast('Contact saved.'); reopen('contact'); } catch (err) { showToast(errorMessage(err), 'error'); }
        };
        $('#nextStepsForm', root).onsubmit = async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
          try { normalizeDates(payload, [['Call Referring Dr.'], ['Letter to Patient'], ['Thank You Letter']]); } catch (err) { showToast(errorMessage(err), 'error'); return; }
          try { await api().updateNextSteps(rowNumber, payload); showToast('Next steps saved.'); reopen('next'); } catch (err) { showToast(errorMessage(err), 'error'); }
        };
      }
    });
  }
  async function renderReferralDetail(rowNumber) { await renderReferralHome(); openReferralDrawer(asRow(rowNumber)); }

  /* =============================================================== SETUP */
  const SS = { tab: 'pending', q: '', filters: {}, sort: null, openId: '' };
  const taskPill = (label, value) => { const done = String(value || '').trim().toLowerCase() === 'yes'; return `<span class="task ${done ? 'is-done' : ''}" title="${esc(label)}: ${done ? 'done' : 'not done'}">${done ? ico('check') : '<i></i>'}${esc(label)}</span>`; };
  const setupDone = (r) => [r.addPatientCrystal, r.schedulePatientCrystal, r.sendInitialEmail].filter((v) => String(v || '').trim().toLowerCase() === 'yes').length;

  async function renderSetupLanding(openRow = null) {
    setHeader('Initial Contact & New Patient Setup');
    loading('Loading patients…');
    let result;
    try { result = await api().listSetup(); } catch (e) { fatal(e, renderSetupLanding); return; }
    const recs = result.records || [];
    renderList({
      pageKey: 'setup', state: SS, rows: recs, rowId: (r) => r._row, rowLabel: (r) => r.patientName, noun: 'patients',
      searchPlaceholder: 'Search patient, parent, phone or exam…',
      searchText: (r) => [r.patientName, r.parentName, r.phone, r.email, r.examType, r.referralSource].join(' '),
      tabs: [
        { key: 'pending', label: 'Needs setup', test: (r) => r._state !== 'Completed', empty: 'Every scheduled patient is set up', emptyHint: 'Patients appear here after their Initial Contact is saved.' },
        { key: 'done', label: 'Completed', test: (r) => r._state === 'Completed', empty: 'No completed setups yet' }
      ],
      defaultSort: () => ({ key: 'scheduled', dir: 'desc' }),
      columns: [
        { key: 'scheduled', label: 'Scheduled On', sort: (r) => `${r.scheduledOn ? String(r.scheduledOn).slice(0, 10) : ''}|${String(r._row).padStart(6, '0')}`, html: (r) => `<span class="num" title="Date the family confirmed scheduling">${r.scheduledOn ? fmtDate(r.scheduledOn) : '<span class="muted">Not recorded</span>'}</span><div class="sub">Called ${fmtDate(r.initialContactDate)}</div>` },
        { key: 'patient', label: 'Patient', sort: (r) => String(r.patientName || '').toLowerCase(), html: (r) => `<div class="cell-main">${esc(r.patientName)}</div><div class="sub">${r.dob ? `Born ${fmtDate(r.dob)}` : ''}</div>` },
        { key: 'exam', label: 'Exam', sort: (r) => (r.examDate ? String(r.examDate).slice(0, 10) : ''), html: (r) => `<div>${dash(r.examType)}</div><div class="sub num">${r.examDate ? fmtDate(r.examDate) : ''}${r.examTime ? ` · ${esc(time12Value(r.examTime))}` : ''}</div>` },
        { key: 'parent', label: 'Parent', p: 2, sort: (r) => String(r.parentName || '').toLowerCase(), html: (r) => `<div>${dash(r.parentName)}</div><div class="sub">${esc(r.phone || r.email || '')}</div>` },
        { key: 'source', label: 'Referral source', p: 3, html: (r) => `<div class="clip" title="${esc(r.referralSource || '')}">${dash(r.referralSource)}</div>` },
        { key: 'tasks', label: 'Setup tasks', sort: setupDone, html: (r) => `<div class="tasks">${taskPill('Crystal', r.addPatientCrystal)}${taskPill('Scheduled', r.schedulePatientCrystal)}${taskPill('Email', r.sendInitialEmail)}</div>` },
        { key: 'status', label: 'Status', p: 2, sort: (r) => r._state, html: (r) => chip(r._state, r._state === 'Completed' ? 'ok' : 'warn') }
      ],
      intro: '<p>Finish the Crystal and email steps for each scheduled patient. Click a patient for copy-ready details.</p><div class="intro-actions"><button type="button" class="btn" id="manualSetupAdd">Add patient manually</button><button type="button" class="btn" id="openSetupExcel">Open in Excel</button></div>',
      source: `<span title="${esc(result.workbookPath || '')}">Local file: <span class="src-name">${esc(baseName(result.workbookPath))}</span></span>`,
      onOpen: (r) => openSetupDrawer(r._row),
      wire: () => {
        $('#manualSetupAdd').onclick = () => window.renderSetupForm();
        $('#openSetupExcel').onclick = () => api().openSetupWorkbook().catch((e) => showToast(errorMessage(e), 'error'));
      }
    });
    const row = asRow(openRow);
    if (row) openSetupDrawer(row);
  }

  async function openSetupDrawer(rowNumber, tab) {
    let r, extra = null;
    try { [r, extra] = await Promise.all([api().getSetup(rowNumber), api().getSetupFormData(rowNumber)]); } catch (e) { showToast(errorMessage(e), 'error'); return; }
    if (!r) { showToast('Patient not found.', 'error'); return; }
    const values = { scheduledOn: fmtDate(r.scheduledOn),initialContactDate: fmtDate(r.initialContactDate),patientName: r.patientName, dob: fmtDate(r.dob), age: r.age, parentName: r.parentName, phone: r.phone, email: r.email, grade: r.grade, referralSource: r.referralSource, examType: r.examType, examDate: fmtDate(r.examDate), examTime: time12Value(r.examTime), parentMeetingDate: fmtDate(r.parentMeetingDate), parentMeetingTime: time12Value(r.parentMeetingTime) };
    const labels = [['scheduledOn', 'Scheduled On'], ['initialContactDate', 'Called'], ['patientName', 'Patient name'], ['dob', 'Date of birth'], ['age', 'Age'], ['parentName', 'Parent name'], ['phone', 'Phone'], ['email', 'Email'], ['grade', 'Grade'], ['referralSource', 'Referral source'], ['examType', 'Exam type'], ['examDate', 'Exam date'], ['examTime', 'Exam time'], ['parentMeetingDate', 'Parent meeting date'], ['parentMeetingTime', 'Parent meeting time']];
    const copyRows = labels.map(([k, l]) => { const v = values[k] === '—' ? '' : values[k]; return `<div class="copy-row"><span class="k">${esc(l)}</span><span class="v ${v ? '' : 'is-empty'}">${v ? esc(v) : '—'}</span>${v ? `<button type="button" class="btn btn-sm" data-copy="${k}" aria-label="Copy ${esc(l)}">${ico('copy', 'sm')}Copy</button>` : '<span></span>'}</div>`; }).join('');
    const exam = setupAppointmentPhrase(r.examDate, r.examTime), parent = setupAppointmentPhrase(r.parentMeetingDate, r.parentMeetingTime);
    const yes = (v) => String(v).toLowerCase() === 'yes';
    const tabs = [
      { key: 'checklist', label: 'Checklist', html: `<div class="toggle-list">
          <label class="toggle"><input type="checkbox" id="setupAddCrystal" ${yes(r.addPatientCrystal) ? 'checked' : ''}><span>Add patient to Crystal<small>Create the patient’s Crystal profile.</small></span></label>
          <label class="toggle"><input type="checkbox" id="setupScheduleCrystal" ${yes(r.schedulePatientCrystal) ? 'checked' : ''}><span>Schedule patient on Crystal<small>Add the scheduled appointment(s).</small></span></label>
          <label class="toggle"><input type="checkbox" id="setupEmail" ${yes(r.sendInitialEmail) ? 'checked' : ''}><span>Send initial email<small>Send the initial patient email.</small></span></label></div>
          <label>Notes<textarea id="setupNotes" rows="4">${esc(r.notes || '')}</textarea></label>` },
      { key: 'info', label: 'Copy details', html: `<div class="copy-list">${copyRows}</div>` },
      { key: 'dates', label: 'Date phrases', html: `<p class="muted" style="margin-top:0">Ready-made wording for the patient’s email.</p>
          <div class="phrase-card"><div><div class="k">Exam</div><div class="v">${esc(exam || 'Date or time not available')}</div></div>${exam ? `<button type="button" class="btn btn-sm" id="copyExamPhrase">${ico('copy', 'sm')}Copy</button>` : ''}</div>
          <div class="phrase-card"><div><div class="k">Parent meeting</div><div class="v">${esc(parent || 'Date or time not available')}</div></div>${parent ? `<button type="button" class="btn btn-sm" id="copyParentPhrase">${ico('copy', 'sm')}Copy</button>` : ''}</div>
          ${exam && parent ? '<button type="button" class="btn" id="copyBothPhrases">Copy both</button>' : ''}` }
    ];
    openDrawer({
      title: r.patientName || 'Patient', accent: '#15bf35',
      subtitle: esc([r.examType, r.examDate ? `${fmtDate(r.examDate)}${r.examTime ? ' ' + time12Value(r.examTime) : ''}` : ''].filter(Boolean).join(' · ') || 'New patient setup'),
      chip: chip(r._state, r._state === 'Completed' ? 'ok' : 'warn'),
      actions: '<button type="button" class="btn" id="editInitialFromSetup">Edit Initial Contact / Regenerate PDF</button><button type="button" class="btn" id="addSetupToPayment">Add to Payment Tracking</button>',
      tabs, activeTab: tab || 'checklist',
      footer: '<button type="button" class="btn btn-danger" id="deleteSetupPatient">Delete patient</button><span class="spacer"></span><button type="button" class="btn btn-primary" id="saveSetupTasks">Save checklist</button>',
      onMount: (root) => {
        $$('[data-copy]', root).forEach((b) => { b.onclick = () => copyToClipboard(values[b.dataset.copy], b.getAttribute('aria-label').replace(/^Copy /, '')); });
        $('#editInitialFromSetup', root).onclick = () => { closeDrawer(true); window.renderInitialForm(setupRecordToForm(r, extra || {}), { setupRow: rowNumber }); };
        $('#addSetupToPayment', root).onclick = () => openSetupPaymentDrawer(rowNumber, r);
        const ce = $('#copyExamPhrase', root); if (ce) ce.onclick = () => copyToClipboard(exam, 'Exam date');
        const cp = $('#copyParentPhrase', root); if (cp) cp.onclick = () => copyToClipboard(parent, 'Parent meeting date');
        const cb = $('#copyBothPhrases', root); if (cb) cb.onclick = () => copyToClipboard(`${exam}\n${parent}`, 'Both date phrases');
        $('#saveSetupTasks', root).onclick = async () => {
          try {
            await api().updateSetup(rowNumber, { addPatientCrystal: $('#setupAddCrystal', root).checked ? 'YES' : '', schedulePatientCrystal: $('#setupScheduleCrystal', root).checked ? 'YES' : '', sendInitialEmail: $('#setupEmail', root).checked ? 'YES' : '', notes: $('#setupNotes', root).value });
            showToast('Checklist saved.'); markClean(); await renderSetupLanding(); openSetupDrawer(rowNumber, 'checklist');
          } catch (e) { showToast(errorMessage(e), 'error'); }
        };
        $('#deleteSetupPatient', root).onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r.patientName}?`, message: 'This removes the patient from New Patient Setup. A backup is created first.', confirmLabel: 'Delete patient', danger: true })) return;
          try { await api().deleteSetup(rowNumber); showToast('Patient deleted from New Patient Setup.'); closeDrawer(true); renderSetupLanding(); } catch (e) { showToast(errorMessage(e), 'error'); }
        };
      }
    });
  }

  function openSetupPaymentDrawer(rowNumber, r) {
    openDrawer({
      title: 'Add to Payment Tracking', accent: '#e0b400', subtitle: esc(r.patientName),
      actions: '<button type="button" class="btn btn-quiet" id="backToSetup">' + ico('back', 'sm') + 'Back to patient</button>',
      html: `<form id="setupPaymentForm"><div class="dsection"><h3>Appointment</h3><div class="dgrid"><label>Initial contact${dateTextInput('initialContactDate', r.initialContactDate)}</label><label>Exam scheduled${dateTextInput('examScheduled', r.examDate)}</label><label>Exam type<input name="examType" value="${esc(r.examType || '')}"></label><label>Parent meeting${dateTextInput('parentMeeting', r.parentMeetingDate)}</label><label class="span-2">Referral source<input name="referralSource" value="${esc(r.referralSource || '')}"></label></div></div>
        <div class="dsection"><h3>Deposit</h3><div class="dgrid"><label>Deposit needed?<select name="depositNeeded"><option value="YES" selected>YES</option><option value="NO">NO</option></select></label><label>Deposit taken?<input name="depositTaken" placeholder="Leave blank if not yet paid"></label></div>
        <div class="quick-values"><span>Quick values</span>${['YES via link', 'YES via cc', 'NO/FES'].map((v) => `<button type="button" class="chip" data-quick="${v}">${v}</button>`).join('')}</div></div>
        <div class="form-row-end"><button type="submit" class="btn btn-primary">Add to Payment Tracking</button></div></form>`,
      onMount: (root) => {
        $('#backToSetup', root).onclick = () => openSetupDrawer(rowNumber, 'checklist');
        $$('[data-quick]', root).forEach((b) => { b.onclick = () => { root.querySelector('[name=depositTaken]').value = b.dataset.quick; }; });
        $('#setupPaymentForm', root).onsubmit = async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          const payload = { patientName: r.patientName, age: r.age, initialContactDate: f.initialContactDate, depositNeeded: f.depositNeeded, depositTaken: f.depositTaken, referralSource: f.referralSource, examScheduled: f.examScheduled, examType: f.examType, parentMeeting: f.parentMeeting };
          try {
            normalizeDates(payload, [['initialContactDate', 'Initial Contact Date'], ['examScheduled', 'Exam Scheduled'], ['parentMeeting', 'Parent Meeting']]);
            const list = await api().listInitialTracking();
            const existing = list.records.find((x) => normalizeHeaderUI(x.patientName) === normalizeHeaderUI(payload.patientName) && (!payload.initialContactDate || x.initialContactDate === payload.initialContactDate));
            if (existing) { showToast('This patient is already in Payment Tracking.'); openSetupDrawer(rowNumber, 'checklist'); return; }
            await api().saveInitialTracking(payload);
            showToast('Patient added to Payment Tracking.'); markClean(); openSetupDrawer(rowNumber, 'checklist');
          } catch (err) { showToast(errorMessage(err), 'error'); }
        };
      }
    });
  }

  /* =============================================================== SCHEDULE INCOMPLETE */
  const SI = { tab: 'follow', q: '', filters: {}, sort: null, openId: '' };
  const incKind = (s) => { const n = normalizeHeaderUI(s); return n === 'scheduled' ? 'ok' : n.includes('will not') ? 'mute' : 'warn'; };
  const isWillNot = (r) => normalizeHeaderUI(r.status).includes('will not');

  async function renderScheduleIncompleteLanding() {
    setHeader('Schedule Incomplete');
    loading('Loading patients…');
    let result;
    try { result = await api().listIncomplete(); } catch (e) { fatal(e, renderScheduleIncompleteLanding); return; }
    const recs = result.records || [];
    const cPatient = { key: 'patient', label: 'Patient', sort: (r) => String(r.patientName || '').toLowerCase(), html: (r) => `<div class="cell-main">${esc(r.patientName)}</div><div class="sub">${esc(r.parentName || '')}</div>` };
    const cPhone = { key: 'phone', label: 'Phone', p: 2, html: (r) => `<div class="num">${dash(r.phone)}</div><div class="sub clip" title="${esc(r.email || '')}">${esc(r.email || '')}</div>` };
    const cDate = { key: 'date', label: 'Call date', sort: (r) => (r.date ? String(r.date).slice(0, 10) : ''), html: (r) => `<span class="num">${fmtDate(r.date)}</span>` };
    const cSource = { key: 'source', label: 'Referral source', p: 3, html: (r) => `<div class="clip" title="${esc(r.referralSource || '')}">${dash(r.referralSource)}</div>` };
    const cWhy = { key: 'comments', label: 'Why it did not finish', p: 1, html: (r) => `<div class="clip-2" title="${esc(r.comments || '')}">${dash(r.comments)}</div>` };
    const cFollow = { key: 'follow', label: 'Follow-up', p: 2, html: (r) => `<div class="clip-2" title="${esc(r.followUpNotes || '')}">${dash(r.followUpNotes)}</div>` };
    const cReason = { key: 'reason', label: 'Reason', sort: (r) => (isWillNot(r) ? String(r.comments || '').toLowerCase() : ''), html: (r) => (isWillNot(r) ? `<div class="reason-cell" title="${esc(r.comments || '')}">${dash(r.comments)}</div>` : '<span class="muted">—</span>') };
    const cStatus = { key: 'status', label: 'Status', sort: (r) => r.status, html: (r) => chip(r.status || 'Incomplete', incKind(r.status)) };
    renderList({
      pageKey: 'incomplete', state: SI, rows: recs, rowId: (r) => r._row, rowLabel: (r) => r.patientName, noun: 'patients',
      searchPlaceholder: 'Search patient, parent, phone or notes…',
      searchText: (r) => [r.patientName, r.parentName, r.phone, r.email, r.referralSource, r.comments, r.followUpNotes].join(' '),
      tabs: [
        { key: 'follow', label: 'Follow-up', test: (r) => ['incomplete','follow-up'].includes(normalizeHeaderUI(r.status)), columns: [cPatient, cPhone, cDate, cWhy, cFollow, cSource, cStatus], empty: 'No pending follow-up', emptyHint: 'New incomplete calls enter this tab.' },
        { key: 'noanswer', label: 'No Answer', test: (r) => normalizeHeaderUI(r.status) === 'no answer', columns: [cPatient, cPhone, cDate, cWhy, cFollow, cSource, cStatus], empty: 'No unanswered calls' },
        { key: 'closed', label: 'Completed', test: (r) => ['scheduled','will not schedule'].includes(normalizeHeaderUI(r.status)), columns: [cPatient, cPhone, cDate, cReason, cFollow, cStatus], empty: 'Nothing closed yet' }
      ],
      columns: [cPatient, cPhone, cDate, cWhy, cFollow, cSource, cStatus],
      defaultSort: (tab) => ({ key: 'date', dir: tab === 'follow' ? 'asc' : 'desc' }),
      intro: '<p>Keep what was collected when a call ends early, then resume the same Initial Contact later. “Will not schedule” closes the case.</p><div class="intro-actions"><button type="button" class="btn" id="openIncompleteExcel">Open in Excel</button></div>',
      source: `<span title="${esc(result.workbookPath || '')}">Local file: <span class="src-name">${esc(baseName(result.workbookPath))}</span></span>`,
      onOpen: (r) => openIncompleteDrawer(r._row),
      wire: () => { $('#openIncompleteExcel').onclick = () => api().openIncompleteWorkbook().catch((e) => showToast(errorMessage(e), 'error')); }
    });
  }

  async function openIncompleteDrawer(rowNumber) {
    let r;
    try { r = await api().getIncomplete(rowNumber); } catch (e) { showToast(errorMessage(e), 'error'); return; }
    if (!r) { renderScheduleIncompleteLanding(); return; }
    const willNot = isWillNot(r);const isNoAnswer=normalizeHeaderUI(r.status)==='no answer';const closed=['scheduled','will not schedule'].includes(normalizeHeaderUI(r.status));
    const notice = willNot
      ? `<strong>Will not schedule: case closed</strong>This family decided not to schedule and will not be followed up any more.<span class="why">Reason: ${esc(r.comments || 'No reason was recorded')}</span>`
      : '';
    openDrawer({
      notice, noticeKind: willNot ? 'closed' : '',
      title: r.patientName || 'Patient', accent: '#f08a24', subtitle: esc(r.parentName ? `Parent: ${r.parentName}` : 'Schedule incomplete'), chip: chip(r.status || 'Incomplete', incKind(r.status)),
      actions: `<button type="button" class="btn btn-primary" id="continueIncomplete">Continue Initial Contact</button><button type="button" class="btn" id="editIncomplete">Edit Patient</button>${!closed?`<button type="button" class="btn" id="markIncompleteFollow">${isNoAnswer?'Return to Follow-up':'Mark No Answer'}</button>`:''}<button type="button" class="btn" id="markIncompleteScheduled">Mark as scheduled</button><button type="button" class="btn" id="markIncompleteNo">Will not schedule</button>`,
      html: `<div class="dsection"><h3>Patient</h3>${facts([['Date of birth', fmtDate(r.dob)], ['Age', T(r.age)], ['Parent', T(r.parentName)], ['Phone', T(r.phone)], ['Email', T(r.email)], ['Grade', T(r.grade)], ['Referral source', T(r.referralSource), true]])}</div>
        <div class="dsection"><h3>${willNot ? 'Reason for not scheduling' : 'Why it did not finish'}</h3><label class="sr-only" for="incompleteComments">Reason</label><textarea id="incompleteComments" rows="4" placeholder="What did the family say? When should we try again?">${esc(r.comments || '')}</textarea></div>
        <div class="dsection">${window.incompleteFollowupScript(r)}<h3>Follow-up notes</h3><label class="sr-only" for="incompleteFollow">Follow-up notes</label><textarea id="incompleteFollow" rows="4" ${r.followUpAvailable ? '' : 'disabled'} placeholder="${r.followUpAvailable ? 'Calls and texts after the first contact: what happened, what is next.' : 'The Follow-Up Notes column could not be created. Close the Excel file if it is open, then reopen this screen.'}">${esc(r.followUpNotes || '')}</textarea></div>
        <div class="form-row-end" style="margin-top:0"><button type="button" class="btn btn-primary" id="saveIncompleteNotes">Save notes</button></div>`,
      footer: '<button type="button" class="btn btn-danger" id="deleteIncomplete">Delete</button><span class="spacer"></span><button type="button" class="btn" data-close>Close</button>',
      onMount: (root) => {
        const comments = () => $('#incompleteComments', root).value;
        const follow = () => $('#incompleteFollow', root).value;
        const done = async (patch, msg) => { try { await api().updateIncomplete(rowNumber, patch); showToast(msg); closeDrawer(true); renderScheduleIncompleteLanding(); } catch (e) { showToast(errorMessage(e), 'error'); } };
        $('#editIncomplete', root).onclick = () => { closeDrawer(true); window.editIncompletePatient(rowNumber,r); };
        const moveBtn=$('#markIncompleteFollow',root);if(moveBtn)moveBtn.onclick=()=>done({status:isNoAnswer?'Follow-up':'No Answer',comments:comments(),...(r.followUpAvailable?{followUpNotes:follow()}:{})},isNoAnswer?'Returned to Follow-up.':'Moved to No Answer.');
        $('#continueIncomplete', root).onclick = () => { closeDrawer(true); window.renderInitialForm(r.formData || { patientName: r.patientName, age: r.age, dob: r.dob, parentName: r.parentName, phone: r.phone, email: r.email, grade: r.grade, referralSource: r.referralSource }, { incompleteRow: rowNumber }); };
        $('#markIncompleteScheduled', root).onclick = () => done({ status: 'Scheduled', comments: comments(), ...(r.followUpAvailable?{followUpNotes:follow()}:{}) }, 'Marked as scheduled.');
        $('#markIncompleteNo', root).onclick = async () => {
          const reason = await UX.askReason({ title: 'Why will this patient not schedule?', message: 'The case will be closed and not followed up any more. The reason stays visible in the list and on the patient.', label: 'Reason', placeholder: 'For example: decided to wait, moved away, going to another provider.', value: comments(), confirmLabel: 'Close the case' });
          if (reason === null) return;
          done({ status: 'Will Not Schedule', comments: reason, ...(r.followUpAvailable?{followUpNotes:follow()}:{}) }, 'Marked as will not schedule.');
        };
        $('#saveIncompleteNotes', root).onclick = async () => {
          const patch = { comments: comments() };
          if (r.followUpAvailable) patch.followUpNotes = follow();
          try { await api().updateIncomplete(rowNumber, patch); showToast('Notes saved.'); markClean(); renderScheduleIncompleteLanding(); openIncompleteDrawer(rowNumber); } catch (e) { showToast(errorMessage(e), 'error'); }
        };
        $('#deleteIncomplete', root).onclick = async () => {
          if (!await UX.confirm({ title: `Delete ${r.patientName}?`, message: 'This removes the patient from Schedule Incomplete. A backup is created first.', confirmLabel: 'Delete', danger: true })) return;
          try { await api().deleteIncomplete(rowNumber); showToast('Patient deleted.'); closeDrawer(true); renderScheduleIncompleteLanding(); } catch (e) { showToast(errorMessage(e), 'error'); }
        };
      }
    });
  }
  async function renderIncompleteDetail(rowNumber) { await renderScheduleIncompleteLanding(); openIncompleteDrawer(asRow(rowNumber)); }

  /* expose for part 2 and for the legacy flows that call these by name */
  Object.assign(window, {
    renderDashboard, renderSettings,
    renderReferralHome, renderReferralDetail,
    renderSetupLanding, renderSetupSidePanel: (row) => openSetupDrawer(asRow(row)), renderSetupPaymentForm: openSetupPaymentDrawer,
    renderScheduleIncompleteLanding, renderIncompleteDetail
  });
  UX.shared = { T, dash, facts, asRow, settingsLinks, sourceHtml, simBanner, daysSince };
})();
