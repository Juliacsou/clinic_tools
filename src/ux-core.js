/* Visual Health Clinic Tools — UX core (v2.15.0)
   Loaded after renderer.js. Presentation only: every read/write still goes
   through window.clinicAPI exactly as before. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------ icons */
  const ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    referral: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    setup: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 14l2 2 4-4"/>',
    incomplete: '<path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.7 2 2 0 0 1 4.1 2.5h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.8 10.4a16 16 0 0 0 5.8 5.8l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/><path d="M15 3v5M19 3v5"/>',
    payment: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2A2.8 2.2 0 0 0 12 8c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.8 2.2 0 0 1-2.5-1.2"/><path d="M12 6v2M12 16v2"/>',
    cancel: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M10 14l4 4M14 14l-4 4"/>',
    weekly: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3M14 14h3M8 18h3"/>',
    chart: '<path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/><circle cx="7" cy="15" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="14" cy="14" r="1.5"/><circle cx="19" cy="8" r="1.5"/>',
    monthly: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7 13h4v4H7zM13 13h4M13 17h4"/>',
    waitlist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    back: '<path d="M15 6l-6 6 6 6"/>'
  };
  const ico = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;
  const chip = (text, kind = 'info', title = '') => `<span class="chip chip-${kind}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  const baseName = (p) => String(p || '').split(/[\\/]/).pop();

  /* ------------------------------------------------------------------ shell */
  const shell = $('#appShell');
  const NAV_BY_LABEL = {
    'Clinic Tools': 'home', 'Home': 'home',
    'Referral Follow-Up': 'referral',
    'Initial Contact & New Patient Setup': 'setup', 'New Patient Setup': 'setup', 'Initial Contact': 'setup',
    'Schedule Incomplete': 'incomplete',
    'Payment Tracking': 'payment',
    'Exam Cancelations': 'cancellations',
    'Waitlist': 'waitlist', 'Monthly Reports': 'monthly', 'Monthly Report': 'monthly', 'Weekly Report':'weekly-dashboard', 'Weekly Report Dashboard':'weekly-dashboard', 'Reports Dashboard':'weekly-dashboard', 'Reports':'weekly-dashboard', 'Weekly Report Weeks':'weekly-weeks',
    'Settings': 'settings'
  };
  const REPORT_KEYS = new Set(['weekly-dashboard', 'weekly-weeks', 'monthly']);

  function restoreSavedCollapse() {
    let stored = null;
    try { stored = localStorage.getItem('vh.nav.collapsed'); } catch (e) { /* ignore */ }
    const value = stored === null ? window.innerWidth < 1280 : stored === '1';
    shell.classList.toggle('collapsed', value);
    const t = $('#menuToggle');
    if (t) t.setAttribute('aria-expanded', String(!value));
  }

  function setActiveNav(label) {
    let key = NAV_BY_LABEL[label];
    if (!key && /initial|setup/i.test(label || '')) key = 'setup';
    const isReport = REPORT_KEYS.has(key);
    const mainKey = isReport ? 'reports' : key;
    $$('[data-nav]').forEach((b) => {
      const on = b.dataset.nav === mainKey || b.dataset.nav === key;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $$('[data-report-nav]').forEach((b) => {
      const on = b.dataset.reportNav === key;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const subNav = $('#reportsSubNav');
    if (isReport) {
      shell.classList.add('collapsed', 'reports-open');
      shell.classList.remove('reports-subnav-collapsed');
      if (subNav) subNav.hidden = false;
      const t = $('#menuToggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    } else {
      const wasReport = shell.classList.contains('reports-open');
      shell.classList.remove('reports-open', 'reports-subnav-collapsed');
      if (subNav) subNav.hidden = true;
      if (wasReport) restoreSavedCollapse();
    }
  }

  function setCollapsed(value, remember = true) {
    if (shell.classList.contains('reports-open')) {
      shell.classList.add('collapsed');
      return;
    }
    shell.classList.toggle('collapsed', value);
    const t = $('#menuToggle');
    if (t) t.setAttribute('aria-expanded', String(!value));
    if (remember) { try { localStorage.setItem('vh.nav.collapsed', value ? '1' : '0'); } catch (e) { /* ignore */ } }
  }

  function initShell() {
    $$('[data-ico]').forEach((el) => { el.innerHTML = ico(el.dataset.ico); });
    const t = $('#menuToggle');
    if (t) t.innerHTML = ico('menu');
    let stored = null;
    try { stored = localStorage.getItem('vh.nav.collapsed'); } catch (e) { /* ignore */ }
    setCollapsed(stored === null ? window.innerWidth < 1280 : stored === '1', false);
    window.addEventListener('resize', () => {
      let pref = null;
      try { pref = localStorage.getItem('vh.nav.collapsed'); } catch (e) { /* ignore */ }
      if (pref === null) setCollapsed(window.innerWidth < 1280, false);
    });
    $$('[data-nav]').forEach((b) => {
      const label = $('.nav-label', b);
      if (label) b.title = label.textContent.trim();
    });
  }

  /* Page header: title + one primary action. Called by every screen. */
  function setHeader(label, actionText = '', actionFn = null) {
    const title = label === 'Clinic Tools' ? 'Home' : label;
    $('#subbrand').textContent = title;
    document.title = `${title} · Visual Health Clinic Tools`;
    const home = $('#homeBtn'); if (home) home.hidden = true;
    const btn = $('#primaryActionBtn');
    btn.hidden = !actionText;
    if (actionText) {
      btn.innerHTML = `${ico('plus')}<span>${esc(String(actionText).replace(/^\+\s*/, ''))}</span>`;
      btn.onclick = actionFn || null;
    } else {
      btn.onclick = null;
    }
    setActiveNav(label);
    closeDrawer(true);
    UX.page = null;
  }

  /* ------------------------------------------------------------------ dialog */
  function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      const root = $('#dialogRoot');
      root.innerHTML = `<div class="dialog-backdrop"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlgTitle" aria-describedby="dlgMsg"><h2 id="dlgTitle">${esc(title)}</h2><p id="dlgMsg">${esc(message || '')}</p><div class="dialog-actions"><button type="button" class="btn" data-no>${esc(cancelLabel)}</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button></div></div></div>`;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); root.innerHTML = ''; resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); }
        if (e.key === 'Tab') {
          const f = $$('button', root); if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      $('[data-no]', root).onclick = () => done(false);
      $('[data-yes]', root).onclick = () => done(true);
      $('.dialog-backdrop', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('dialog-backdrop')) done(false); });
      (danger ? $('[data-no]', root) : $('[data-yes]', root)).focus();
    });
  }

  function askReason({ title, message = '', label = 'Reason', placeholder = '', value = '', confirmLabel = 'Save', cancelLabel = 'Cancel', required = true }) {
    return new Promise((resolve) => {
      const root = $('#dialogRoot');
      root.innerHTML = `<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rsnTitle"><h2 id="rsnTitle">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}<label for="rsnText">${esc(label)}${required ? ' *' : ''}</label><textarea id="rsnText" rows="4" placeholder="${esc(placeholder)}" style="margin-top:6px">${esc(value)}</textarea><div class="field-error" id="rsnErr" hidden>Please enter a reason before saving.</div><div class="dialog-actions" style="margin-top:16px"><button type="button" class="btn" data-no>${esc(cancelLabel)}</button><button type="button" class="btn btn-primary" data-yes>${esc(confirmLabel)}</button></div></div></div>`;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); root.innerHTML = ''; resolve(v); };
      const ta = $('#rsnText', root);
      const submit = () => { const v = ta.value.trim(); if (required && !v) { $('#rsnErr', root).hidden = false; ta.focus(); return; } done(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(null); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Tab') {
          const f = $$('textarea,button', root), first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      $('[data-no]', root).onclick = () => done(null);
      $('[data-yes]', root).onclick = submit;
      $('.dialog-backdrop', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('dialog-backdrop')) done(null); });
      ta.addEventListener('input', () => { $('#rsnErr', root).hidden = true; });
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  /* ------------------------------------------------------------------ drawer */
  const drawerState = { open: false, dirty: false, lastFocus: null, onClose: null };

  function markListRows() {
    const cfg = UX.activeList;
    $$('tr.row').forEach((tr) => tr.classList.toggle('is-open', !!cfg && !!cfg.state.openId && tr.dataset.id === String(cfg.state.openId)));
  }

  function closeDrawer(force = false) {
    const root = $('#drawerRoot');
    if (!root || !drawerState.open) { if (root) root.innerHTML = ''; return Promise.resolve(true); }
    const finish = () => {
      root.innerHTML = '';
      drawerState.open = false; drawerState.dirty = false;
      document.removeEventListener('keydown', onDrawerKey, true);
      if (UX.activeList) { UX.activeList.state.openId = ''; markListRows(); }
      const cb = drawerState.onClose; drawerState.onClose = null; if (cb) cb();
      const f = drawerState.lastFocus; drawerState.lastFocus = null;
      if (f && document.contains(f)) f.focus();
      return true;
    };
    if (force || !drawerState.dirty) return Promise.resolve(finish());
    return confirmDialog({ title: 'Discard your changes?', message: 'You have unsaved changes in this panel.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true })
      .then((ok) => (ok ? finish() : false));
  }

  function onDrawerKey(e) {
    if (e.key === 'Escape' && !$('#dialogRoot').firstChild) { e.preventDefault(); closeDrawer(false); }
    if (e.key === 'Tab') {
      const d = $('.drawer'); if (!d) return;
      const f = $$('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])', d).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === d)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* cfg: {title, subtitle, chip, accent, wide, actions, tabs:[{key,label,html}] | html, footer, activeTab, onMount(root)} */
  function openDrawer(cfg) {
    const root = $('#drawerRoot');
    const wasOpen = drawerState.open;
    if (!wasOpen) drawerState.lastFocus = document.activeElement;
    root.innerHTML = '';
    drawerState.open = true; drawerState.dirty = false;
    const tabs = cfg.tabs || null;
    const active = tabs ? (tabs.find((t) => t.key === cfg.activeTab) || tabs[0]).key : '';
    root.innerHTML = `<div class="drawer-backdrop" data-close></div>
      <aside class="drawer ${cfg.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(cfg.title)}" tabindex="-1" style="${cfg.accent ? `--drawer-accent:${cfg.accent}` : ''}">
        <header class="drawer-head">
          <div class="drawer-titles"><h2>${esc(cfg.title)}</h2>${cfg.subtitle ? `<p>${cfg.subtitle}</p>` : ''}</div>
          <div class="drawer-head-right">${cfg.chip || ''}<button type="button" class="icon-btn" data-close aria-label="Close panel">${ico('close')}</button></div>
        </header>
        ${cfg.actions ? `<div class="drawer-actions">${cfg.actions}</div>` : ''}
        ${cfg.notice ? `<div class="drawer-notice ${cfg.noticeKind || ''}" role="note">${cfg.notice}</div>` : ''}
        ${tabs ? `<nav class="drawer-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="drawer-tab ${t.key === active ? 'is-active' : ''}" data-dtab="${t.key}" aria-selected="${t.key === active}">${esc(t.label)}</button>`).join('')}</nav>` : ''}
        <div class="drawer-body">${tabs ? tabs.map((t) => `<section class="drawer-panel" data-dpanel="${t.key}" role="tabpanel" ${t.key === active ? '' : 'hidden'}>${t.html}</section>`).join('') : (cfg.html || '')}</div>
        ${cfg.footer ? `<footer class="drawer-foot">${cfg.footer}</footer>` : ''}
      </aside>`;
    const d = $('.drawer', root);
    $$('[data-close]', root).forEach((el) => el.addEventListener('click', () => closeDrawer(false)));
    $$('[data-dtab]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-dtab]', root).forEach((x) => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', String(on)); });
      $$('[data-dpanel]', root).forEach((p) => { p.hidden = p.dataset.dpanel !== b.dataset.dtab; });
    }));
    $('.drawer-body', root).addEventListener('input', () => { drawerState.dirty = true; });
    if (!wasOpen) document.addEventListener('keydown', onDrawerKey, true);
    markListRows();
    if (cfg.onMount) cfg.onMount(root, d);
    drawerState.dirty = false;
    d.focus({ preventScroll: true });
    return d;
  }
  const switchTab = (key) => { const b = $(`[data-dtab="${key}"]`); if (b) b.click(); };
  const markClean = () => { drawerState.dirty = false; };

  /* ------------------------------------------------------------------ list */
  const cmpVals = (a, b, dir) => {
    const ea = a === '' || a === null || a === undefined, eb = b === '' || b === null || b === undefined;
    if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
    const r = (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return r * dir;
  };

  /* cfg: {state, rows, rowId, rowLabel, tabs:[{key,label,test,empty}], columns:[{key,label,p,html,sort}],
           searchText, searchPlaceholder, filters:[{key,label,options,test}], defaultSort(tabKey), noun,
           intro, banner, source, panel, toolsLeft, toolsRight, onOpen, afterPaint} */
  function renderList(cfg) {
    const st = cfg.state;
    st.filters = st.filters || {};
    UX.activeList = cfg;
    UX.page = cfg.pageKey || null;
    const filtersHtml = (cfg.filters || []).map((f) => `<label class="sel"><span class="sr-only">${esc(f.label)}</span><select data-filter="${f.key}"><option value="">${esc(f.label)}</option>${f.options.map((o) => `<option value="${esc(o)}" ${st.filters[f.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`).join('');
    appEl.innerHTML = `<section class="list-page">
      ${cfg.intro ? `<div class="page-intro">${cfg.intro}</div>` : ''}
      ${cfg.banner || ''}
      <div class="list-card">
        <div class="list-head">
          ${cfg.headLeft !== undefined ? cfg.headLeft : `<div class="seg" role="tablist">${cfg.tabs.map((t) => `<button type="button" role="tab" class="seg-btn" data-tab="${t.key}"><span>${esc(t.label)}</span><span class="seg-count" data-count="${t.key}">0</span></button>`).join('')}</div>`}
          <div class="list-tools">${cfg.toolsLeft || ''}<div class="search-box">${ico('search')}<input type="search" id="listSearch" aria-label="Search" placeholder="${esc(cfg.searchPlaceholder || 'Search…')}" value="${esc(st.q || '')}" autocomplete="off"></div>${filtersHtml}${cfg.toolsRight || ''}</div>
        </div>
        ${cfg.panel || ''}
        <div class="dt-wrap" id="dtWrap"></div>
        <div class="list-foot"><span id="listShown"></span><span id="colHint" class="col-hint" hidden>Some columns are hidden to fit. Collapse the menu or open a row to see everything.</span><span class="list-src">${cfg.source || ''}</span></div>
      </div></section>`;

    const wrap = $('#dtWrap');
    const currentTab = () => cfg.tabs.find((t) => t.key === st.tab) || cfg.tabs[0];

    const matches = (r) => {
      if (st.q && !String(cfg.searchText(r)).toLowerCase().includes(st.q.toLowerCase())) return false;
      for (const f of cfg.filters || []) { const v = st.filters[f.key]; if (v && !f.test(r, v)) return false; }
      if (cfg.extraMatch && !cfg.extraMatch(r)) return false;
      return true;
    };
    const isFiltering = () => !!(st.q || Object.values(st.filters).some(Boolean) || (cfg.isFiltering && cfg.isFiltering()));

    const paint = () => {
      const tab = currentTab(); st.tab = tab.key;
      const matched = cfg.rows.filter(matches);
      cfg.tabs.forEach((t) => { const el = $(`[data-count="${t.key}"]`); if (el) el.textContent = matched.filter(t.test).length; });
      $$('.seg-btn[data-tab]').forEach((b) => { const on = b.dataset.tab === tab.key; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
      let list = matched.filter(tab.test);
      const cols = tab.columns || cfg.columns;
      const sort = st.sort || (cfg.defaultSort ? cfg.defaultSort(tab.key) : null);
      if (sort) {
        const col = cols.find((c) => c.key === sort.key);
        if (col && col.sort) { const dir = sort.dir === 'desc' ? -1 : 1; list = list.map((r, i) => [r, i]).sort((x, y) => cmpVals(col.sort(x[0]), col.sort(y[0]), dir) || x[1] - y[1]).map((x) => x[0]); }
      }
      if (!list.length) {
        wrap.innerHTML = isFiltering()
          ? `<div class="dt-empty"><strong>No matches</strong><span>Nothing in “${esc(tab.label)}” fits the current search or filters.</span><button type="button" class="btn" data-clear>Clear search and filters</button></div>`
          : `<div class="dt-empty"><strong>${esc(tab.empty || 'Nothing here yet')}</strong>${tab.emptyHint ? `<span>${esc(tab.emptyHint)}</span>` : ''}</div>`;
      } else {
        const head = cols.map((c, ci) => {
          const on = sort && sort.key === c.key;
          return `<th scope="col" data-c="${ci}" class="${c.p ? 'p' + c.p : ''} ${c.cls || ''}" ${on ? `aria-sort="${sort.dir === 'desc' ? 'descending' : 'ascending'}"` : ''}>${c.sort ? `<button type="button" class="th-sort" data-sort="${c.key}">${esc(c.label)}<span class="sort-ind" aria-hidden="true"></span></button>` : esc(c.label)}</th>`;
        }).join('') + '<th class="go" aria-label="Open"></th>';
        const body = list.map((r) => {
          const id = cfg.rowId(r);
          return `<tr class="row ${String(id) === String(st.openId) ? 'is-open' : ''}" data-id="${esc(id)}">${cols.map((c, ci) => `<td data-c="${ci}" class="${c.p ? 'p' + c.p : ''} ${c.cls || ''}">${c.html(r)}</td>`).join('')}<td class="go"><button type="button" class="row-go" aria-label="Open ${esc(cfg.rowLabel ? cfg.rowLabel(r) : 'record')}">${ico('chev')}</button></td></tr>`;
        }).join('');
        wrap.innerHTML = `<table class="dt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      }
      const total = cfg.rows.filter(tab.test).length;
      const noun = cfg.noun || 'records';
      const word = (n) => (n === 1 ? noun.replace(/s$/, '') : noun);
      $('#listShown').textContent = isFiltering() ? `${list.length} of ${total} ${word(total)} match` : `${total} ${word(total)}`;
      checkCols();
      if (cfg.afterPaint) cfg.afterPaint(list);
    };
    /* Fit the table to the space available: hide the least important columns, one at a time, until nothing overflows. */
    const checkCols = () => {
      const hint = $('#colHint'); const table = $('table.dt', wrap);
      if (!table) { if (hint) hint.hidden = true; return; }
      $$('[data-c]', table).forEach((el) => { el.style.display = ''; });
      const order = (currentTab().columns || cfg.columns).map((c, i) => ({ i, p: c.p || 0 })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || b.i - a.i);
      let hidden = 0;
      for (const x of order) {
        if (wrap.scrollWidth <= wrap.clientWidth + 1) break;
        $$(`[data-c="${x.i}"]`, table).forEach((el) => { el.style.display = 'none'; });
        hidden++;
      }
      if (hint) hint.hidden = hidden === 0;
    };
    let fitFrame = 0;
    if (window.ResizeObserver) new ResizeObserver(() => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(checkCols); }).observe(wrap);

    wrap.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sort]');
      if (s) {
        const key = s.dataset.sort;
        const cur = st.sort || (cfg.defaultSort ? cfg.defaultSort(currentTab().key) : null) || {};
        st.sort = { key, dir: cur.key === key && cur.dir !== 'desc' ? 'desc' : 'asc' };
        paint(); return;
      }
      if (e.target.closest('[data-clear]')) {
        st.q = ''; st.filters = {};
        const si = $('#listSearch'); if (si) si.value = '';
        $$('[data-filter]').forEach((x) => { x.value = ''; });
        if (cfg.clearExtra) cfg.clearExtra();
        paint(); return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr) {
        const row = cfg.rows.find((r) => String(cfg.rowId(r)) === tr.dataset.id);
        if (row) { st.openId = tr.dataset.id; markListRows(); cfg.onOpen(row); }
      }
    });
    $$('.seg-btn[data-tab]').forEach((b) => b.addEventListener('click', () => { if (st.tab !== b.dataset.tab) st.sort = null; st.tab = b.dataset.tab; paint(); }));
    $('#listSearch').addEventListener('input', (e) => { st.q = e.target.value.trim(); paint(); });
    $$('[data-filter]').forEach((s) => s.addEventListener('change', () => { st.filters[s.dataset.filter] = s.value; paint(); }));
    if (cfg.wire) cfg.wire({ paint, isFiltering });
    paint();
    return { paint };
  }

  const loading = (text = 'Loading…') => { appEl.innerHTML = `<div class="page-loading"><span class="spin" aria-hidden="true"></span><span>${esc(text)}</span></div>`; };

  /* Friendlier load failure (replaces the old "Unable to load" card). */
  function fatal(e, retry) {
    appEl.innerHTML = `<section class="connect-box"><h2>This screen could not load</h2><p>The data could not be read. If the Excel file is open in another program or was moved, close it or choose it again in Settings, then try again.</p><pre style="text-align:left;white-space:pre-wrap;background:#f7f9fc;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;margin:0 0 18px">${esc(errorMessage(e))}</pre><div class="inline-actions" style="justify-content:center"><button class="btn btn-primary" id="retryBtn" type="button">Try again</button><button class="btn" id="fatalSettings" type="button">Open Settings</button></div></section>`;
    $('#retryBtn').onclick = retry || (() => window.renderDashboard());
    $('#fatalSettings').onclick = () => window.renderSettings();
  }

  /* ------------------------------------------------------------------ misc */
  function showToast(msg, type = 'success') {
    toastEl.textContent = msg; toastEl.className = `toast ${type}`; toastEl.hidden = false;
    clearTimeout(showToast.t); showToast.t = setTimeout(() => { toastEl.hidden = true; }, type === 'error' ? 7000 : 3500);
  }

  async function copyToClipboard(text, label) {
    try { await window.clinicAPI.copyText(String(text ?? '')); showToast(`${label} copied.`); }
    catch (e) { showToast(errorMessage(e), 'error'); }
  }

  /* Make any leftover clickable text (legacy "← Back", "Open →") reachable by keyboard. */
  function enhanceLegacyButtons() {
    const fix = (root) => {
      $$('a.back:not([href]),a.link:not([href])', root).forEach((a) => {
        if (a.getAttribute('role')) return;
        a.setAttribute('role', 'button'); a.tabIndex = 0;
        a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } });
      });
    };
    new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) fix(n.parentNode || document); }); })
      .observe(appEl, { childList: true, subtree: true });
  }

  const UX = window.UX = {
    $, $$, ICON, ico, chip, baseName, setCollapsed, initShell, setHeader, setActiveNav,
    confirm: confirmDialog, askReason, openDrawer, closeDrawer, switchTab, markClean, renderList, loading, fatal,
    showToast, copyToClipboard, enhanceLegacyButtons, activeList: null
  };

  /* Replace the legacy presentation helpers that renderer.js still calls. */
  window.setHeader = setHeader;
  window.showToast = showToast;
  window.fatal = fatal;
})();
