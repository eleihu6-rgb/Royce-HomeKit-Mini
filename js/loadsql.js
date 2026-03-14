// ===================================================================
// LOAD SQL INTO DB
// ===================================================================

let _loadsqlUnlocked      = false;
let _loadsqlSelectedFile  = null;
let _loadsqlAnalyseResult = null;   // [{name, sql_rows, in_whitelist, enabled}]
let _loadsqlPollTimer     = null;
let _loadsqlCurrentJob    = null;
let _loadsqlFiles         = [];     // flat file array, indexed by render order
let _loadsqlLoadMode      = 'drop'; // 'drop' | 'append'

function initLoadSqlPage() {
  _loadsqlUnlocked      = false;
  _loadsqlSelectedFile  = null;
  _loadsqlAnalyseResult = null;
  _loadsqlCurrentJob    = null;
  if (_loadsqlPollTimer) { clearInterval(_loadsqlPollTimer); _loadsqlPollTimer = null; }

  const gate  = document.getElementById('loadsql-gate');
  const panel = document.getElementById('loadsql-panel');
  const input = document.getElementById('loadsql-passcode');
  if (gate)  gate.style.display  = 'flex';
  if (panel) panel.style.display = 'none';
  if (input) { input.value = ''; input.focus(); }
  loadsqlSetError('');
}

function loadsqlCheckPasscode() { loadsqlSetError(''); }

function loadsqlSubmitPasscode() {
  const input = document.getElementById('loadsql-passcode');
  if (!input) return;
  if (input.value === '5566') {
    _loadsqlUnlocked = true;
    document.getElementById('loadsql-gate').style.display  = 'none';
    document.getElementById('loadsql-panel').style.display = 'block';
    loadsqlRefreshFiles();
    loadsqlRefreshWhitelist();
  } else {
    input.value = '';
    loadsqlSetError('✕  INCORRECT PASSCODE');
    input.focus();
  }
}

function loadsqlSetError(msg) {
  const el = document.getElementById('loadsql-gate-error');
  if (el) el.textContent = msg;
}

function loadsqlSetLoadMode(mode) {
  _loadsqlLoadMode = mode;
  const dropEl   = document.getElementById('loadsql-mode-drop');
  const appendEl = document.getElementById('loadsql-mode-append');
  const dropTog  = document.getElementById('loadsql-mode-drop-toggle');
  const appTog   = document.getElementById('loadsql-mode-append-toggle');
  if (!dropEl || !appendEl) return;

  if (mode === 'drop') {
    // Drop active
    dropEl.style.background   = 'rgba(255,80,80,0.06)';
    dropEl.style.borderColor  = 'rgba(255,80,80,0.2)';
    dropTog.style.background  = 'rgba(255,100,100,0.7)';
    dropTog.style.borderColor = 'rgba(255,80,80,0.5)';
    dropTog.children[0].style.left       = '13px';
    dropTog.children[0].style.background = '#ff6464';
    dropEl.querySelector('div > div:first-child').style.color = 'rgba(255,100,100,0.9)';
    // Append inactive
    appendEl.style.background   = 'rgba(255,255,255,0.02)';
    appendEl.style.borderColor  = 'rgba(255,255,255,0.06)';
    appTog.style.background     = 'rgba(255,255,255,0.12)';
    appTog.style.borderColor    = 'rgba(255,255,255,0.1)';
    appTog.children[0].style.left       = '2px';
    appTog.children[0].style.background = 'rgba(255,255,255,0.5)';
    appendEl.querySelector('div > div:first-child').style.color = 'rgba(255,255,255,0.4)';
  } else {
    // Append active
    appendEl.style.background   = 'rgba(0,200,255,0.06)';
    appendEl.style.borderColor  = 'rgba(0,200,255,0.2)';
    appTog.style.background     = 'rgba(0,200,255,0.6)';
    appTog.style.borderColor    = 'rgba(0,200,255,0.4)';
    appTog.children[0].style.left       = '13px';
    appTog.children[0].style.background = '#00c8ff';
    appendEl.querySelector('div > div:first-child').style.color = 'rgba(0,200,255,0.9)';
    // Drop inactive
    dropEl.style.background   = 'rgba(255,255,255,0.02)';
    dropEl.style.borderColor  = 'rgba(255,255,255,0.06)';
    dropTog.style.background  = 'rgba(255,255,255,0.12)';
    dropTog.style.borderColor = 'rgba(255,255,255,0.1)';
    dropTog.children[0].style.left       = '2px';
    dropTog.children[0].style.background = 'rgba(255,255,255,0.5)';
    dropEl.querySelector('div > div:first-child').style.color = 'rgba(255,255,255,0.4)';
  }
}

// ── Whitelist display ─────────────────────────────────────────────────

async function loadsqlRefreshWhitelist() {
  const container = document.getElementById('loadsql-tablelist');
  const countEl   = document.getElementById('loadsql-table-count');
  const statsEl   = document.getElementById('loadsql-match-stats');
  if (!container) return;
  container.innerHTML = '<div style="padding:8px;color:rgba(255,255,255,0.25);">Loading…</div>';
  try {
    const res  = await fetch('/api/whitelist');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    const tables = data.tables || [];
    const loadCount = tables.filter(t => t.load_data).length;
    if (countEl) countEl.textContent = tables.length ? `${tables.length} TABLES` : '';
    if (statsEl) statsEl.textContent = tables.length ? `LOAD DATA: ${loadCount}/${tables.length}` : '';
    if (!tables.length) {
      container.innerHTML = '<div style="padding:8px;color:rgba(255,255,255,0.2);">Whitelist is empty.</div>';
      return;
    }
    container.innerHTML = tables.map((t, i) => {
      const on = t.load_data;
      return `<div style="display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:5px;margin-bottom:1px;
                  background:${on?'rgba(0,200,100,0.04)':'rgba(255,255,255,0.01)'};
                  border:1px solid ${on?'rgba(0,200,100,0.12)':'rgba(255,255,255,0.04)'};">
        <span style="color:rgba(255,255,255,0.2);min-width:22px;text-align:right;font-size:9px;">${i+1}</span>
        <span style="flex:1;font-size:11px;color:${on?'rgba(0,220,110,0.85)':'rgba(0,200,255,0.7)'};word-break:break-all;">${escHtml(t.name)}</span>
        <div onclick="loadsqlToggleLoadData('${escHtml(t.name)}')"
             title="${on?'Click to skip data':'Click to load data'}"
             style="width:30px;height:16px;border-radius:8px;cursor:pointer;transition:all 0.2s;flex-shrink:0;position:relative;
                    background:${on?'rgba(0,200,100,0.6)':'rgba(255,255,255,0.12)'};
                    border:1px solid ${on?'rgba(0,200,100,0.4)':'rgba(255,255,255,0.1)'};">
          <div style="position:absolute;top:2px;left:${on?'13':'2'}px;width:10px;height:10px;border-radius:50%;
                      background:${on?'#00dc6e':'rgba(255,255,255,0.5)'};transition:left 0.2s;"></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="padding:8px;color:#ff4466;">Error: ${escHtml(e.message)}</div>`;
  }
}

async function loadsqlToggleLoadData(tableName) {
  // Read current state from the rendered toggle, then flip it
  try {
    const res  = await fetch('/api/whitelist');
    const data = await res.json();
    const row  = (data.tables || []).find(t => t.name === tableName);
    if (!row) return;
    const newVal = !row.load_data;
    await fetch('/api/whitelist-toggle', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({table: tableName, load_data: newVal})
    });
    loadsqlRefreshWhitelist();
  } catch (e) {
    // silent
  }
}

// ── File listing ──────────────────────────────────────────────────────

async function loadsqlRefreshFiles() {
  const container = document.getElementById('loadsql-filelist');
  if (!container) return;
  container.innerHTML = '<div style="padding:16px;font-size:11px;color:rgba(255,255,255,0.3);">Loading...</div>';
  try {
    const res  = await fetch('/api/sql-files');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    loadsqlRenderFiles(data.files || []);
  } catch (e) {
    container.innerHTML = `<div style="padding:16px;font-size:11px;color:#ff4466;">Error: ${e.message}</div>`;
  }
}

function loadsqlRenderFiles(files) {
  _loadsqlFiles = files;
  const container = document.getElementById('loadsql-filelist');
  if (!files.length) {
    container.innerHTML = '<div style="padding:16px;font-size:11px;color:rgba(255,255,255,0.3);">No files found.</div>';
    return;
  }
  const groups = {};
  files.forEach((f, idx) => {
    const parts = f.rel_path.split('/');
    const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push({...f, _idx: idx});
  });
  let html = '';
  Object.keys(groups).sort().forEach(dir => {
    if (dir !== '.') {
      html += `<div style="padding:8px 8px 4px;font-size:10px;letter-spacing:1px;color:rgba(255,255,255,0.25);font-family:'Share Tech Mono',monospace;">📁 ${dir}/</div>`;
    }
    groups[dir].forEach(f => {
      const isSql = f.name.endsWith('.sql');
      html += `
        <div class="loadsql-file-row ${isSql?'loadsql-sql':'loadsql-other'}"
             ${isSql ? `onclick="loadsqlSelectFile(${f._idx},this)"` : ''}
             style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:7px;margin-bottom:2px;
                    cursor:${isSql?'pointer':'default'};
                    border:1px solid ${isSql?'rgba(0,200,255,0.08)':'transparent'};
                    background:${isSql?'rgba(0,200,255,0.03)':'transparent'};transition:all 0.15s;"
             onmouseover="${isSql?"this.style.background='rgba(0,200,255,0.1)';this.style.borderColor='rgba(0,200,255,0.2)'":''}"
             onmouseout="${isSql?"this.style.background='rgba(0,200,255,0.03)';this.style.borderColor='rgba(0,200,255,0.08)'":''}"
        >
          <span style="font-size:14px;">${isSql?'🗄️':'📄'}</span>
          <span style="flex:1;font-family:'Share Tech Mono',monospace;font-size:11px;color:${isSql?'rgba(0,200,255,0.85)':'rgba(255,255,255,0.35)'};word-break:break-all;">${f.name}</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.25);white-space:nowrap;">${loadsqlFmtSize(f.size)}</span>
        </div>`;
    });
  });
  container.innerHTML = html;
}

function loadsqlFmtSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}

// ── File selection ────────────────────────────────────────────────────

function loadsqlSelectFile(idx, el) {
  const file = _loadsqlFiles[idx];
  if (!file) return;
  _loadsqlSelectedFile  = file;
  _loadsqlAnalyseResult = null;
  _loadsqlCurrentJob    = null;
  if (_loadsqlPollTimer) { clearInterval(_loadsqlPollTimer); _loadsqlPollTimer = null; }

  // Highlight row
  document.querySelectorAll('.loadsql-sql').forEach(r => {
    r.style.background  = 'rgba(0,200,255,0.03)';
    r.style.borderColor = 'rgba(0,200,255,0.08)';
    r.style.outline     = 'none';
  });
  if (el) {
    el.style.background  = 'rgba(0,200,255,0.15)';
    el.style.borderColor = 'rgba(0,200,255,0.4)';
    el.style.outline     = '1px solid rgba(0,200,255,0.2)';
  }

  // Show full path
  const nameEl = document.getElementById('loadsql-selected-name');
  if (nameEl) {
    nameEl.innerHTML =
      `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:4px;letter-spacing:1px;">FULL PATH</div>` +
      `<div style="word-break:break-all;">/home/eleihu6/rois_tg_live_load/${escHtml(file.rel_path)}</div>`;
  }
  const metaEl = document.getElementById('loadsql-selected-meta');
  if (metaEl) metaEl.textContent = loadsqlFmtSize(file.size);

  // Enable analyse, disable load
  _loadsqlSetBtnState('loadsql-analyse-btn', true, 'rgba(160,120,255,0.9)', 'rgba(120,80,255,0.35)', 'pointer');
  _loadsqlSetBtnState('loadsql-load-btn', false, 'rgba(0,200,100,0.4)', 'rgba(0,200,100,0.15)', 'not-allowed');

  // Hide analysis panel
  const panel = document.getElementById('loadsql-analysis-panel');
  if (panel) panel.style.display = 'none';

  loadsqlRefreshWhitelist();
}

function _loadsqlSetBtnState(id, enabled, color, borderColor, cursor) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled          = !enabled;
  btn.style.opacity     = enabled ? '1' : '0.5';
  btn.style.cursor      = cursor;
  btn.style.color       = color;
  btn.style.borderColor = borderColor;
}

// ── Step 1: Analyse ───────────────────────────────────────────────────

async function loadsqlAnalyse() {
  if (!_loadsqlSelectedFile) return;
  if (_loadsqlPollTimer) { clearInterval(_loadsqlPollTimer); _loadsqlPollTimer = null; }

  const btnTextEl  = document.getElementById('loadsql-analyse-btn-text');
  const progEl     = document.getElementById('loadsql-analysis-progress');
  const bodyEl     = document.getElementById('loadsql-analysis-body');
  const analysisEl = document.getElementById('loadsql-analysis-panel');

  _loadsqlSetBtnState('loadsql-analyse-btn', false, 'rgba(160,120,255,0.5)', 'rgba(120,80,255,0.2)', 'not-allowed');
  if (btnTextEl) btnTextEl.textContent = '⏳  Analysing…';
  if (analysisEl) analysisEl.style.display = 'block';
  if (progEl) progEl.innerHTML = `<span style="color:rgba(251,191,36,0.8);">⟳ SCANNING OFFSETS…</span>`;
  if (bodyEl) bodyEl.innerHTML = `<div style="padding:12px 16px;font-size:11px;font-family:'Share Tech Mono',monospace;color:rgba(255,255,255,0.25);">Waiting for offset scan to complete…</div>`;
  // Init badges immediately
  _loadsqlRenderWorkers({worker_status: Array.from({length:4},(_,i)=>({id:i+1,state:'STANDBY',table:''}))});

  try {
    const res  = await fetch('/api/analyse-sql', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({file: _loadsqlSelectedFile.rel_path})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start analysis');

    _loadsqlCurrentJob = data.job_id;
    _loadsqlPollTimer  = setInterval(_loadsqlPoll, 1500);

  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = `<div style="padding:12px 16px;color:#ff4466;font-size:11px;">Error: ${escHtml(e.message)}</div>`;
    _loadsqlSetBtnState('loadsql-analyse-btn', true, 'rgba(160,120,255,0.9)', 'rgba(120,80,255,0.35)', 'pointer');
    if (btnTextEl) btnTextEl.textContent = '🔍 \u00a0 STEP 1 — ANALYSE SQL FILE';
  }
}

async function _loadsqlPoll() {
  if (!_loadsqlCurrentJob) return;
  const btnTextEl = document.getElementById('loadsql-analyse-btn-text');
  const progEl    = document.getElementById('loadsql-analysis-progress');
  const bodyEl    = document.getElementById('loadsql-analysis-body');

  try {
    const res = await fetch(`/api/analyse-status?job=${_loadsqlCurrentJob}`);
    const job = await res.json();

    // Phase label
    if (progEl) {
      if (job.status === 'done') {
        progEl.innerHTML = `<span style="color:rgba(0,220,110,0.8);">✓ ${job.tables.length} / ${job.limit} TABLES</span>`;
      } else if (job.phase === 'scanning') {
        progEl.innerHTML = `<span style="color:rgba(251,191,36,0.8);">⟳ SCANNING OFFSETS…</span>`;
      } else {
        const pct = job.total > 0 ? Math.round(job.progress / job.total * 100) : 0;
        progEl.innerHTML =
          `<span style="color:rgba(160,120,255,0.9);">` +
          `${job.workers} WORKERS · ${job.progress}/${job.total} · ${pct}%` +
          `</span>`;
      }
    }

    // Always render worker badges
    _loadsqlRenderWorkers(job);

    // Show scanning placeholder in table body
    if (job.phase === 'scanning' && (!job.tables || job.tables.length === 0)) {
      if (bodyEl) bodyEl.innerHTML = `<div style="padding:12px 16px;font-size:11px;font-family:'Share Tech Mono',monospace;color:rgba(255,255,255,0.25);">Waiting for offset scan to complete…</div>`;
    }

    // Render counting progress
    if (job.phase === 'counting' || job.status === 'done') {
      if (job.tables && job.tables.length > 0) {
        _loadsqlAnalyseResult = job.tables.map(t => ({...t, enabled: t.in_whitelist}));
        _loadsqlRenderAnalysisTable(_loadsqlAnalyseResult, job.total, job.status !== 'done');
      }
    }

    if (job.status === 'done') {
      clearInterval(_loadsqlPollTimer);
      _loadsqlPollTimer = null;
      _loadsqlRenderWhitelistToggles(_loadsqlAnalyseResult);
      _loadsqlSetBtnState('loadsql-load-btn', true, 'rgba(0,220,110,0.9)', 'rgba(0,200,100,0.4)', 'pointer');
      document.getElementById('loadsql-load-btn').style.background =
        'linear-gradient(135deg,rgba(0,200,100,0.15),rgba(0,150,80,0.15))';
      _loadsqlSetBtnState('loadsql-analyse-btn', true, 'rgba(160,120,255,0.9)', 'rgba(120,80,255,0.35)', 'pointer');
      if (btnTextEl) btnTextEl.textContent = '🔍 \u00a0 STEP 1 — ANALYSE SQL FILE';

    } else if (job.status === 'error') {
      clearInterval(_loadsqlPollTimer);
      _loadsqlPollTimer = null;
      if (bodyEl) bodyEl.innerHTML = `<div style="padding:12px 16px;color:#ff4466;font-size:11px;">Error: ${escHtml(job.error)}</div>`;
      _loadsqlSetBtnState('loadsql-analyse-btn', true, 'rgba(160,120,255,0.9)', 'rgba(120,80,255,0.35)', 'pointer');
      if (btnTextEl) btnTextEl.textContent = '🔍 \u00a0 STEP 1 — ANALYSE SQL FILE';
    }

  } catch (e) {
    // network glitch — keep polling
  }
}

function _loadsqlRenderWorkers(job) {
  const el = document.getElementById('loadsql-worker-badges');
  if (!el) return;

  // When job is done, force all workers to DONE to avoid stale COUNTING state
  const isDone = job.status === 'done';
  const ws = (job.worker_status || []).map(w =>
    isDone ? {...w, state: 'DONE'} : w
  );

  const cfg = {
    'STANDBY':         { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', spin: false },
    'AWAITING OFFSETS':{ color: 'rgba(251,191,36,0.8)',   bg: 'rgba(251,191,36,0.08)', spin: true  },
    'IDLE':            { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', spin: false },
    'COUNTING':        { color: 'rgba(160,120,255,0.9)',  bg: 'rgba(160,120,255,0.1)', spin: true  },
    'DONE':            { color: 'rgba(0,220,110,0.8)',    bg: 'rgba(0,200,100,0.08)', spin: false },
  };

  el.innerHTML = ws.map(w => {
    const c     = cfg[w.state] || cfg['STANDBY'];
    const label = w.state === 'COUNTING' && w.table
      ? `COUNTING · ${w.table}`
      : w.state === 'DONE' && w.table
        ? `✓ ${w.table}`
        : w.state;
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;
                         background:${c.bg};border:1px solid ${c.color.replace(/,([\d.]+)\)$/, ',0.25)')};
                         font-size:10px;letter-spacing:1px;color:${c.color};font-family:'Rajdhani',sans-serif;
                         max-width:100%;overflow:hidden;">
      ${c.spin ? `<span style="flex-shrink:0;display:inline-block;width:7px;height:7px;border:1.5px solid ${c.color.replace(/,([\d.]+)\)$/, ',0.3)')};border-top-color:${c.color};border-radius:50%;animation:spin 0.7s linear infinite;"></span>` : ''}
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">W${w.id} · ${escHtml(label)}</span>
    </div>`;
  }).join('');
}

function _loadsqlLoadingRow() {
  return `<div style="padding:16px;font-size:11px;font-family:'Share Tech Mono',monospace;color:rgba(255,255,255,0.3);display:flex;align-items:center;gap:10px;">
    <span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(160,120,255,0.4);border-top-color:rgba(160,120,255,0.9);border-radius:50%;animation:spin 0.8s linear infinite;"></span>
    Starting analysis…
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
}

function _loadsqlScanningRow() {
  return `<div style="padding:16px 16px;display:flex;flex-direction:column;gap:10px;">
    <div style="display:flex;align-items:center;gap:10px;font-family:'Share Tech Mono',monospace;font-size:11px;color:rgba(251,191,36,0.7);">
      <span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(251,191,36,0.3);border-top-color:rgba(251,191,36,0.9);border-radius:50%;animation:spin 0.8s linear infinite;"></span>
      Phase 1 — Scanning 17 GB file for table positions…
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${[1,2,3,4].map(n=>`<div style="padding:4px 10px;border-radius:5px;background:rgba(160,120,255,0.08);border:1px solid rgba(160,120,255,0.15);font-size:10px;letter-spacing:1px;color:rgba(160,120,255,0.6);font-family:'Rajdhani',sans-serif;">WORKER ${n} · STANDBY</div>`).join('')}
    </div>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
}

function _loadsqlRenderAnalysisTable(tables, total, inProgress) {
  const bodyEl = document.getElementById('loadsql-analysis-body');
  if (!bodyEl) return;

  const COLS = '24px minmax(0,1fr) 90px 90px 36px minmax(0,2fr)';

  const html = tables.map((t, i) => {
    const on     = t.enabled;
    const remark = t.remark || '';
    return `<div style="display:grid;grid-template-columns:${COLS};gap:0;padding:5px 16px;
                         border-bottom:1px solid rgba(255,255,255,0.03);
                         background:${i%2===0?'rgba(255,255,255,0.01)':'transparent'};"
                 onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                 onmouseout="this.style.background='${i%2===0?'rgba(255,255,255,0.01)':'transparent'}'">
      <span style="font-size:10px;color:rgba(255,255,255,0.2);align-self:center;">${i+1}</span>
      <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:${on?'rgba(0,220,110,0.85)':'rgba(255,255,255,0.35)'};align-self:center;word-break:break-all;padding-right:8px;">${escHtml(t.name)}</span>
      <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:rgba(0,200,255,0.7);text-align:right;align-self:center;">
        ${t.sql_rows === null
          ? `<span style="display:inline-block;width:8px;height:8px;border:1.5px solid rgba(160,120,255,0.3);border-top-color:rgba(160,120,255,0.8);border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;"></span>`
          : t.sql_rows > 0 ? t.sql_rows.toLocaleString() : '—'}
      </span>
      <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:rgba(255,255,255,0.2);text-align:right;align-self:center;">—</span>
      <span style="text-align:center;align-self:center;font-size:14px;color:rgba(255,255,255,0.15);">○</span>
      <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:${remark?'rgba(255,80,80,0.85)':'rgba(255,255,255,0.12)'};align-self:center;padding-left:10px;word-break:break-word;">${remark ? escHtml(remark) : '—'}</span>
    </div>`;
  }).join('');

  bodyEl.innerHTML = html;
}

// expose worker count to template
const ANALYSE_WORKERS = 4;

// ── Right panel: whitelist with toggles (post-analysis) ──────────────

function _loadsqlRenderWhitelistToggles(tables) {
  const container = document.getElementById('loadsql-tablelist');
  const countEl   = document.getElementById('loadsql-table-count');
  const statsEl   = document.getElementById('loadsql-match-stats');
  if (!container) return;

  const matched   = tables.filter(t => t.in_whitelist).length;
  const unmatched = tables.length - matched;
  if (countEl) countEl.textContent = `${tables.length} FOUND`;
  if (statsEl) statsEl.textContent = `✓${matched}  ✗${unmatched}`;

  container.innerHTML = tables.map((t, i) => {
    const on      = t.enabled;
    const hit     = t.in_whitelist;
    const loadOn  = !!t.load_data;
    return `
    <div style="display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:5px;margin-bottom:1px;
                background:${on?'rgba(0,200,100,0.04)':'rgba(255,255,255,0.01)'};
                border:1px solid ${on?'rgba(0,200,100,0.12)':'rgba(255,255,255,0.04)'};">
      <span style="color:rgba(255,255,255,0.2);min-width:22px;text-align:right;font-size:9px;">${i+1}</span>
      <span style="flex:1;font-size:11px;color:${on?'rgba(0,220,110,0.85)':'rgba(255,255,255,0.3)'};word-break:break-all;">${escHtml(t.name)}</span>
      ${hit
        ? `<span style="font-size:9px;color:rgba(0,200,255,0.5);background:rgba(0,200,255,0.08);border-radius:3px;padding:1px 4px;">WL</span>`
        : `<span style="font-size:9px;color:rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);border-radius:3px;padding:1px 4px;">—</span>`}
      <span style="font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:1px;font-family:'Rajdhani',sans-serif;flex-shrink:0;">DATA</span>
      <div onclick="loadsqlToggleLoadDataAnalysis(${i})"
           title="${loadOn?'Click to skip data':'Click to load data'}"
           style="width:30px;height:16px;border-radius:8px;cursor:pointer;transition:all 0.2s;flex-shrink:0;position:relative;
                  background:${loadOn?'rgba(251,191,36,0.6)':'rgba(255,255,255,0.12)'};
                  border:1px solid ${loadOn?'rgba(251,191,36,0.4)':'rgba(255,255,255,0.1)'};">
        <div style="position:absolute;top:2px;left:${loadOn?'13':'2'}px;width:10px;height:10px;border-radius:50%;
                    background:${loadOn?'#fbbf24':'rgba(255,255,255,0.5)'};transition:left 0.2s;"></div>
      </div>
      <div onclick="loadsqlToggleTable(${i})"
           title="${on?'Remove from load':'Add to load'}"
           style="width:30px;height:16px;border-radius:8px;cursor:pointer;transition:all 0.2s;flex-shrink:0;position:relative;
                  background:${on?'rgba(0,200,100,0.6)':'rgba(255,255,255,0.12)'};
                  border:1px solid ${on?'rgba(0,200,100,0.4)':'rgba(255,255,255,0.1)'};">
        <div style="position:absolute;top:2px;left:${on?'13':'2'}px;width:10px;height:10px;border-radius:50%;
                    background:${on?'#00dc6e':'rgba(255,255,255,0.5)'};transition:left 0.2s;"></div>
      </div>
    </div>`;
  }).join('');
}

function loadsqlToggleTable(idx) {
  if (!_loadsqlAnalyseResult) return;
  _loadsqlAnalyseResult[idx].enabled = !_loadsqlAnalyseResult[idx].enabled;
  _loadsqlRenderWhitelistToggles(_loadsqlAnalyseResult);
}

async function loadsqlToggleLoadDataAnalysis(idx) {
  if (!_loadsqlAnalyseResult) return;
  const t      = _loadsqlAnalyseResult[idx];
  const newVal = !t.load_data;
  t.load_data  = newVal;
  _loadsqlRenderWhitelistToggles(_loadsqlAnalyseResult);
  try {
    await fetch('/api/whitelist-toggle', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({table: t.name, load_data: newVal})
    });
  } catch (e) { /* silent */ }
}

// ── Step 2: Load into DB ──────────────────────────────────────────────

async function loadsqlLoadFile() {
  if (!_loadsqlSelectedFile) return;

  const btn = document.getElementById('loadsql-load-btn');
  btn.disabled    = true;
  btn.textContent = '⏳  SPLITTING & LOADING…';

  const enabledTables = _loadsqlAnalyseResult
    ? _loadsqlAnalyseResult.filter(t => t.enabled).map(t => t.name)
    : null;

  try {
    const res  = await fetch('/api/load-sql', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({file: _loadsqlSelectedFile.rel_path, tables: enabledTables, mode: _loadsqlLoadMode})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Load failed');

    const countEl = document.getElementById('loadsql-table-count');
    if (countEl) countEl.textContent = data.exit_code === 0 ? '✓ STARTED' : '✗ FAILED';
  } catch (e) {
    alert('Load error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = '⚡ \u00a0 STEP 2 — LOAD INTO DB';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
