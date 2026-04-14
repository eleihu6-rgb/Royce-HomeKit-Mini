// ===================================================================
// CREW BIDS SUMMARY
// ===================================================================

let _cbsBidFile     = null;   // bid report File | null
let _cbsRosterFiles = [];     // roster File[]
let _cbsData        = null;   // parsed /api/crew-bids-summary response | null
let _cbsRosterData  = null;   // { category → parse_roster_report result } | null
let _cbsTooltipEl   = null;   // shared floating tooltip element

// Split a TXT file list into { bid: File|null, roster: File[] }
function _cbsDetectFiles(txts) {
  const roster = txts.filter(f => /roster/i.test(f.name));
  const bids   = txts.filter(f => /bid/i.test(f.name) && !/roster/i.test(f.name));
  // For a single file: classify purely by name
  if (txts.length === 1) {
    return roster.length ? { bid: null, roster } : { bid: txts[0], roster: [] };
  }
  // Multiple files: prefer explicit "bid" match; fall back to non-roster
  const bid = bids[0] || txts.find(f => !roster.includes(f)) || null;
  return { bid, roster };
}

// ── Tooltip helpers ──────────────────────────────────────────────────────────
function _cbsGetTooltip() {
  if (_cbsTooltipEl) return _cbsTooltipEl;
  const el = document.createElement('div');
  el.id = 'cbs-tooltip';
  el.style.cssText = `
    position:fixed;z-index:9999;pointer-events:none;
    background:var(--bg-elevated,#1a1a2e);
    border:1px solid var(--accent-primary,#00d4ff);
    border-radius:8px;padding:10px 14px;
    font-family:'Share Tech Mono',monospace;font-size:11px;
    color:var(--text-primary,#e0e0e0);
    box-shadow:0 4px 20px rgba(0,212,255,0.18);
    max-width:260px;line-height:1.7;
    opacity:0;transition:opacity 0.12s;
  `;
  document.body.appendChild(el);
  _cbsTooltipEl = el;
  return el;
}

function _cbsShowTooltip(e, day, rowLabel, crewIds) {
  const tip = _cbsGetTooltip();
  tip.innerHTML =
    `<div style="color:var(--accent-primary,#00d4ff);margin-bottom:5px;letter-spacing:0.5px;">` +
    `${rowLabel} — Day ${day}  (${crewIds.length} crew)</div>` +
    `<div style="column-count:${crewIds.length > 8 ? 2 : 1};column-gap:16px;">` +
    crewIds.map(id => `<div>#${id}</div>`).join('') +
    `</div>`;
  _cbsPositionTooltip(e);
  tip.style.opacity = '1';
}

function _cbsPositionTooltip(e) {
  const tip = _cbsGetTooltip();
  const pad = 12;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  // Keep within viewport
  const tw = tip.offsetWidth  || 200;
  const th = tip.offsetHeight || 100;
  if (x + tw > window.innerWidth  - pad) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - pad) y = e.clientY - th - pad;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function _cbsHideTooltip() {
  if (_cbsTooltipEl) _cbsTooltipEl.style.opacity = '0';
}

function initCrewBidsSummaryPage() {
  _cbsBidFile     = null;
  _cbsRosterFiles = [];
  _cbsData        = null;
  _cbsRosterData  = null;

  const zone        = document.getElementById('cbs-upload-zone');
  const fileInput   = document.getElementById('cbs-file-input');
  const folderInput = document.getElementById('cbs-folder-input');
  if (!zone || !fileInput || !folderInput) return;

  // Drag-and-drop on the zone (single file)
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const txts = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.txt'));
    if (!txts.length) { cbsLog('warn', 'No TXT files found in the dropped items.'); return; }
    const { bid, roster } = _cbsDetectFiles(txts);
    cbsSetFiles(bid, roster);
    // Show picker when bid is ambiguous among multiple files
    if (txts.length > 1) {
      const bidMatches = txts.filter(f => /bid/i.test(f.name) && !/roster/i.test(f.name));
      if (bidMatches.length !== 1) cbsShowFolderPicker(txts, bid ? bid.name : null);
    }
  });
  // Clicking the zone opens the single-file picker
  zone.addEventListener('click', () => fileInput.click());

  // Delegated tooltip listeners — one set on the static wrapper, never recreated
  const tablesWrap = document.getElementById('cbs-tables-wrap');
  tablesWrap.addEventListener('mouseover', e => {
    const td = e.target.closest('[data-crew]');
    if (!td) return;
    _cbsShowTooltip(e, td.dataset.day, td.dataset.row, JSON.parse(td.dataset.crew));
  });
  tablesWrap.addEventListener('mousemove', e => {
    if (e.target.closest('[data-crew]')) _cbsPositionTooltip(e);
  });
  tablesWrap.addEventListener('mouseout', e => {
    const from = e.target.closest('[data-crew]');
    const to   = e.relatedTarget?.closest('[data-crew]');
    if (from && from !== to) _cbsHideTooltip();
  });

  // File input — single or multi-select
  fileInput.addEventListener('change', () => {
    const txts = Array.from(fileInput.files)
                      .filter(f => f.name.toLowerCase().endsWith('.txt'));
    fileInput.value = '';
    if (!txts.length) return;
    const { bid, roster } = _cbsDetectFiles(txts);
    cbsSetFiles(bid, roster);
    // Show picker when bid is ambiguous among multiple files
    if (txts.length > 1) {
      const bidMatches = txts.filter(f => /bid/i.test(f.name) && !/roster/i.test(f.name));
      if (bidMatches.length !== 1) cbsShowFolderPicker(txts, bid ? bid.name : null);
    }
  });

  // Folder input — auto-detect bid+roster, always show picker to confirm
  folderInput.addEventListener('change', () => {
    const txts = Array.from(folderInput.files)
                      .filter(f => f.name.toLowerCase().endsWith('.txt'));
    folderInput.value = '';
    if (!txts.length) { cbsLog('warn', 'No TXT files found in selected folder.'); return; }
    cbsLog('info', `Folder scanned · ${txts.length} TXT file(s) found`);
    const { bid, roster } = _cbsDetectFiles(txts);
    cbsSetFiles(bid, roster);
    if (txts.length > 1) cbsShowFolderPicker(txts, bid ? bid.name : null);
  });
}

// Show a list of TXT files found in a folder for user to pick one.
// selectedName (optional) highlights the already-auto-selected file.
function cbsShowFolderPicker(files, selectedName) {
  const picker  = document.getElementById('cbs-folder-picker');
  const list    = document.getElementById('cbs-folder-list');
  const hdrText = picker && picker.querySelector('div');
  if (!picker || !list) return;

  const hasAutoSelect = !!selectedName;
  if (hdrText) {
    hdrText.textContent = hasAutoSelect
      ? 'BID REPORT AUTO-SELECTED — click to change:'
      : 'TXT FILES IN FOLDER — click to select:';
  }

  list.innerHTML = '';
  files.forEach(file => {
    const isSelected = selectedName && file.name === selectedName;
    const btn = document.createElement('button');
    btn.style.cssText = `
      display:flex;align-items:center;gap:10px;
      background:${isSelected ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)'};
      border:1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-dim)'};
      border-radius:6px;padding:7px 12px;cursor:pointer;
      font-family:'Share Tech Mono',monospace;font-size:11px;
      color:var(--text-primary);text-align:left;width:100%;
      transition:border-color 0.15s,background 0.15s;
    `;
    btn.innerHTML = `
      <span style="color:var(--accent-primary);">${isSelected ? '✔' : '📄'}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${file.name}</span>
      <span style="color:var(--text-secondary);font-size:10px;">${(file.size/1024).toFixed(1)} KB</span>
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.background  = 'rgba(0,212,255,0.06)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = isSelected ? 'var(--accent-primary)' : 'var(--border-dim)';
      btn.style.background  = isSelected ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)';
    });
    btn.addEventListener('click', () => {
      // Clicked file becomes bid report; remaining roster-named files stay as roster
      const rosterFiles = files.filter(f => f !== file && /roster/i.test(f.name));
      cbsSetFiles(file, rosterFiles);
      picker.style.display = 'none';
    });
    list.appendChild(btn);
  });

  picker.style.display = '';
  if (!hasAutoSelect) cbsLog('info', `Select a file from the list (${files.length} TXT found)`);
}

function cbsSetFiles(bidFile, rosterFiles) {
  _cbsBidFile     = bidFile || null;
  _cbsRosterFiles = rosterFiles || [];

  if (!_cbsBidFile && !_cbsRosterFiles.length) return;

  const display = document.getElementById('cbs-file-display');
  const nameEl  = document.getElementById('cbs-file-name');
  if (display) display.style.display = 'block';
  if (nameEl) {
    const kb = f => (f.size / 1024).toFixed(1);
    let parts = [];
    if (_cbsBidFile)
      parts.push(`📄 ${_cbsBidFile.name}  <span style="color:var(--text-secondary)">(${kb(_cbsBidFile)} KB)</span>`);
    _cbsRosterFiles.forEach(f =>
      parts.push(`📋 ${f.name}  <span style="color:var(--text-secondary)">(${kb(f)} KB)</span>`)
    );
    nameEl.innerHTML = parts.join('<br>');
  }

  const picker = document.getElementById('cbs-folder-picker');
  if (picker) picker.style.display = 'none';
  document.getElementById('cbs-analyse-btn').disabled = false;

  const parts = [];
  if (_cbsBidFile)          parts.push(`bid: ${_cbsBidFile.name}`);
  if (_cbsRosterFiles.length) parts.push(`${_cbsRosterFiles.length} roster file(s)`);
  cbsLog('info', `Selected: ${parts.join(' + ')}`);

  // Reset report
  document.getElementById('cbs-report-section').style.display = 'none';
  document.getElementById('cbs-analysis-card').style.display = 'none';
  document.getElementById('cbs-category-card').style.display = 'none';
  document.getElementById('cbs-generate-wrap').style.display = 'none';
  _cbsData       = null;
  _cbsRosterData = null;
}

function cbsLog(type, msg) {
  const body    = document.getElementById('cbs-log-body');
  const countEl = document.getElementById('cbs-log-count');
  if (!body) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const ts = new Date().toUTCString().split(' ')[4];
  entry.innerHTML = `<span class="log-time">${ts}</span><span class="log-msg ${type}">${msg}</span>`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
  const count = body.querySelectorAll('.log-entry').length;
  if (countEl) countEl.textContent = count + ' ENTRIES';
}

async function cbsAnalyse() {
  if (!_cbsBidFile && !_cbsRosterFiles.length) return;

  const btn     = document.getElementById('cbs-analyse-btn');
  const spinner = document.getElementById('cbs-spinner');
  const btnText = document.getElementById('cbs-btn-text');
  btn.disabled = true;
  spinner.style.display = 'inline-block';
  btnText.textContent = 'Analysing…';

  try {
    // Build parallel fetch list
    const jobs = [];
    if (_cbsBidFile) {
      const form = new FormData();
      form.append('file', _cbsBidFile);
      jobs.push({ type: 'bid', res: fetch('/api/crew-bids-summary', { method: 'POST', body: form }) });
    }
    if (_cbsRosterFiles.length) {
      const form = new FormData();
      _cbsRosterFiles.forEach(f => form.append('files', f));
      jobs.push({ type: 'roster', res: fetch('/api/roster-report', { method: 'POST', body: form }) });
    }

    const parts = [];
    if (_cbsBidFile)            parts.push(_cbsBidFile.name);
    if (_cbsRosterFiles.length) parts.push(`${_cbsRosterFiles.length} roster file(s)`);
    cbsLog('info', `Uploading ${parts.join(' + ')}…`);

    const responses = await Promise.all(jobs.map(j => j.res));

    for (let i = 0; i < jobs.length; i++) {
      const { type } = jobs[i];
      const res  = responses[i];
      const data = await res.json();

      if (type === 'bid') {
        if (!res.ok) throw new Error(data.error || 'Bid analysis failed');
        _cbsData = data;
        cbsLog('ok', `Bid analysis complete · ${data.categories.length} categories · ${data.bid_month}`);
      } else {
        if (!res.ok) {
          cbsLog('warn', `Roster upload failed: ${data.error || 'unknown error'}`);
        } else {
          _cbsRosterData = {};
          data.forEach(r => { if (r.category) _cbsRosterData[r.category] = r; });
          cbsLog('ok', `Roster loaded · ${Object.keys(_cbsRosterData).length} category/ies`);
        }
      }
    }

    cbsShowAnalysis();

  } catch (err) {
    cbsLog('error', `Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = '⇄  ANALYSE FILE';
  }
}

function cbsShowAnalysis() {
  // Build a unified category list from whichever data is available.
  // Bid data takes priority for total_crew; roster fills the gap if bid is absent.
  let bidMonth, categories;

  if (_cbsData) {
    bidMonth   = _cbsData.bid_month;
    // Merge total_crew: bid value has priority; roster fallback if needed
    categories = _cbsData.categories.map(cat => ({
      name:       cat.name,
      total_crew: cat.total_crew,
    }));
  } else if (_cbsRosterData) {
    // Roster-only: derive month + categories from roster results
    const entries = Object.values(_cbsRosterData);
    if (!entries.length) return;
    bidMonth   = entries[0].period || '—';
    categories = entries.map(r => ({ name: r.category, total_crew: r.total_crew || 0 }));
  } else {
    return;
  }

  document.getElementById('cbs-bid-month').textContent = bidMonth;
  document.getElementById('cbs-cat-count').textContent = categories.length;
  document.getElementById('cbs-analysis-card').style.display = '';

  const body = document.getElementById('cbs-category-body');
  body.innerHTML = '';
  categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'config-row';
    row.style.cssText = 'padding:6px 4px;';
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;">
        <input type="checkbox" class="cbs-cat-chk" value="${cat.name}" checked
          style="accent-color:var(--accent-primary);width:14px;height:14px;cursor:pointer;">
        <span style="font-family:'Share Tech Mono',monospace;font-size:12px;
                     color:var(--text-primary);flex:1;">${cat.name}</span>
        <span style="font-family:'Share Tech Mono',monospace;font-size:11px;
                     color:var(--accent-primary);background:rgba(0,212,255,0.08);
                     border:1px solid rgba(0,212,255,0.2);border-radius:4px;
                     padding:1px 7px;">${cat.total_crew} crew</span>
      </label>`;
    body.appendChild(row);
  });
  document.getElementById('cbs-category-card').style.display = '';
  document.getElementById('cbs-generate-wrap').style.display = '';
}

function cbsSelectAll() {
  document.querySelectorAll('.cbs-cat-chk').forEach(c => c.checked = true);
}

function cbsSelectNone() {
  document.querySelectorAll('.cbs-cat-chk').forEach(c => c.checked = false);
}


function cbsGenerate() {
  if (!_cbsData && !_cbsRosterData) return;

  const selected = Array.from(document.querySelectorAll('.cbs-cat-chk:checked'))
                        .map(c => c.value);
  if (!selected.length) {
    cbsLog('warn', 'No categories selected. Please select at least one.');
    return;
  }

  const wrap = document.getElementById('cbs-tables-wrap');

  const rosterEntries  = Object.values(_cbsRosterData || {});
  const days           = _cbsData ? _cbsData.days_in_month : (rosterEntries[0]?.days_in_month || 31);
  const reportMonthStr = _cbsData ? _cbsData.bid_month     : (rosterEntries[0]?.period || '');
  const monAbbr        = reportMonthStr.split(' ')[0] || '';

  const rowDefs = [
    { label: 'Total Number of Crew',      key: 'total_crew'  },
    { label: 'PAIRING DEMAND FROM ACTUAL', key: null          },
    { label: 'DO SLOT',                    key: null          },
    { label: 'DO PRE-ASSIN',               key: 'do_pre_assin'},
    { label: 'GRD PRE-ASSIN',              key: null          },
    { label: 'DO OPENING',                 key: null          },
    { label: 'DO BIDS',                    key: 'do_bids'     },
  ];

  // Build shared thead (same day columns for every category)
  let theadHtml = '<thead><tr><th class="cbs-th cbs-th-label">Metric</th>';
  for (let d = 1; d <= days; d++) theadHtml += `<th class="cbs-th">${d}-${monAbbr}</th>`;
  theadHtml += '</tr></thead>';

  const sections = [];

  selected.forEach(catName => {
    const catData   = _cbsData      ? (_cbsData.summary[catName]  || null) : null;
    const rosterCat = _cbsRosterData ? (_cbsRosterData[catName]   || null) : null;
    if (!catData && !rosterCat) return;

    let html = `<div class="cbs-cat-section">` +
               `<div class="cbs-cat-hdr">Category: ${catName}</div>` +
               `<div class="cbs-cat-wrap"><table class="cbs-cat-table">${theadHtml}<tbody>`;

    rowDefs.forEach((def, ri) => {
      const isAlt = ri % 2 === 1;
      html += `<tr><td class="cbs-td cbs-td-label">${def.label}</td>`;

      for (let d = 1; d <= days; d++) {
        let val      = '';
        let crewIds  = null;

        if (def.key === 'total_crew') {
          val = catData ? catData.total_crew : (rosterCat ? rosterCat.total_crew : '');
        } else if (def.key === 'do_bids' && catData) {
          const cnt = catData.do_bids[String(d)];
          if (cnt !== undefined) {
            val     = cnt;
            crewIds = (catData.do_bids_crew || {})[String(d)] || null;
          }
        } else if (def.key === 'do_pre_assin' && rosterCat) {
          const ids = (rosterCat.do_pre_assin || {})[String(d)];
          if (ids && ids.length) { val = ids.length; crewIds = ids; }
        }

        const hasData = val !== '' && val !== 0;
        const hasTip  = crewIds && crewIds.length > 0;

        let cls = `cbs-td${isAlt ? ' cbs-td-alt' : ''}`;
        if (hasData) cls += (def.key === 'do_bids' || def.key === 'do_pre_assin') ? ' cbs-td-data' : ' cbs-td-val';
        if (hasTip)  cls += ' cbs-td-tip';

        const dataAttrs = hasTip
          ? ` data-crew="${JSON.stringify(crewIds).replace(/"/g, '&quot;')}" data-day="${d}" data-row="${def.label}"`
          : '';

        html += `<td class="${cls}"${dataAttrs}>${val !== '' ? val : ''}</td>`;
      }

      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    sections.push(html);
  });

  wrap.innerHTML = sections.join('');

  document.getElementById('cbs-report-month').textContent = reportMonthStr;
  document.getElementById('cbs-report-section').style.display = '';
  cbsLog('ok', `Report generated for ${selected.length} categor${selected.length === 1 ? 'y' : 'ies'}`);
}
