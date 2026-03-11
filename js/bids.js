// ===================================================================
// BIDS TYPE ANALYSIS — UI CONTROLLER
// ===================================================================
(function () {

  let bidsFiles = [];
  let lastBlob  = null;
  let lastFname = null;

  // ── Logging ──────────────────────────────────────────────────────
  function bidsLog(msg, type = 'info') {
    const body = document.getElementById('bids-log-body');
    if (!body) return;
    const now   = new Date().toUTCString().split(' ')[4];
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${now}</span>`
                    + `<span class="log-msg ${type}">${msg}</span>`;
    body.appendChild(entry);
    body.scrollTop = body.scrollHeight;
    const cnt = document.getElementById('bids-log-count');
    if (cnt) cnt.textContent = body.querySelectorAll('.log-entry').length + ' ENTRIES';
  }

  // ── Progress bar ─────────────────────────────────────────────────
  function setProgress(pct) {
    const bar  = document.getElementById('bids-progress-bar');
    const wrap = document.getElementById('bids-progress-wrap');
    if (!bar || !wrap) return;
    if (pct <= 0 || pct >= 100) {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = 'block';
      bar.style.width = pct + '%';
    }
  }

  // ── File list ────────────────────────────────────────────────────
  function updateFileList() {
    const list   = document.getElementById('bids-file-list');
    const empty  = document.getElementById('bids-empty-state');
    const count  = document.getElementById('bids-file-count');
    const btn    = document.getElementById('bids-generate-btn');
    const roleEl = document.getElementById('bids-role-note');
    if (!list) return;

    const n = bidsFiles.length;
    if (empty)  empty.classList.toggle('visible', n === 0);
    if (count)  count.textContent = n + ' FILE' + (n !== 1 ? 'S' : '') + ' QUEUED';
    if (btn)    btn.disabled = (n === 0);
    if (roleEl) roleEl.style.display = n > 1 ? 'block' : 'none';

    list.querySelectorAll('.file-item').forEach(el => el.remove());

    bidsFiles.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      const kb   = (f.size / 1024).toFixed(1);
      const role = i === 0
        ? (n > 1 ? '<span class="file-role baseline">BASELINE</span> ' : '')
        : `<span class="file-role compare">COMPARE ${i}</span> `;
      item.innerHTML = `
        <div class="file-item-info">
          <span class="file-item-name">${role}${f.name}</span>
          <span class="file-item-meta">${kb} KB</span>
        </div>
        <button class="file-item-remove" data-idx="${i}" title="Remove">✕</button>`;
      list.appendChild(item);
    });

    list.querySelectorAll('.file-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        bidsFiles.splice(parseInt(btn.dataset.idx), 1);
        updateFileList();
      });
    });
  }

  function addFiles(fileList) {
    Array.from(fileList).forEach(f => {
      if (!bidsFiles.find(x => x.name === f.name && x.size === f.size)) {
        bidsFiles.push(f);
        bidsLog(`Queued: ${f.name}  (${(f.size / 1024).toFixed(1)} KB)`);
      }
    });
    updateFileList();
  }

  // ── Result card ──────────────────────────────────────────────────
  function showResult(analyses) {
    const rc = document.getElementById('bids-result-card');
    if (!rc) return;
    rc.style.display = 'block';

    const base = analyses[0];
    const el   = id => document.getElementById(id);

    if (el('bids-res-files'))   el('bids-res-files').textContent   = bidsFiles.length;
    if (el('bids-res-crews'))   el('bids-res-crews').textContent   = base.totalCrew;
    if (el('bids-res-entries')) el('bids-res-entries').textContent = base.totalPrefs;
    if (el('bids-res-types'))   el('bids-res-types').textContent   =
      window.BID_TYPES
        ? window.BID_TYPES.filter(bt => !bt.meta && base.counts[bt.id] > 0).length
        : '—';

    // Populate Bid Type Reference — top 20 by count
    const ref = document.getElementById('bids-type-ref-body');
    if (ref && window.BID_TYPES) {
      ref.innerHTML = '';
      const sorted = window.BID_TYPES
        .filter(bt => !bt.meta && base.counts[bt.id] > 0)
        .sort((a, b) => base.counts[b.id] - base.counts[a.id])
        .slice(0, 20);

      sorted.forEach(bt => {
        const count = base.counts[bt.id];
        const pct   = base.totalCrew > 0 ? (count / base.totalCrew * 100).toFixed(1) : '0';
        const row   = document.createElement('div');
        row.className = 'config-row';
        row.innerHTML = `<span class="config-label" style="font-size:11px;line-height:1.4">${bt.label}</span>`
                      + `<span class="config-value">${count} `
                      + `<span style="color:var(--text-muted);font-size:10px">(${pct}%)</span></span>`;
        ref.appendChild(row);
      });

      const legend = document.getElementById('bids-type-legend-placeholder');
      if (legend) legend.style.display = 'none';
    }
  }

  // ── Download ─────────────────────────────────────────────────────
  function downloadReport() {
    if (!lastBlob || !lastFname) return;
    const url = URL.createObjectURL(lastBlob);
    const a   = document.createElement('a');
    a.href = url; a.download = lastFname; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Generate report ──────────────────────────────────────────────
  window.generateBidsReport = async function () {
    if (bidsFiles.length === 0) return;

    const btn  = document.getElementById('bids-generate-btn');
    const spin = document.getElementById('bids-spinner');
    const txt  = document.getElementById('bids-btn-text');
    const rc   = document.getElementById('bids-result-card');

    btn.disabled = true;
    if (spin) spin.style.display = 'inline-block';
    if (txt)  txt.textContent = 'ANALYSING…';
    if (rc)   rc.style.display = 'none';
    setProgress(5);
    lastBlob = null; lastFname = null;

    const modeStr = bidsFiles.length > 1
      ? `${bidsFiles[0].name} (baseline) vs ${bidsFiles.length - 1} comparison file(s)`
      : bidsFiles[0].name;
    bidsLog(`Starting analysis — ${modeStr}`);

    await window.analyseBidsFiles(bidsFiles, {
      onLog:      bidsLog,
      onProgress: setProgress,
      onDone: ({ blob, fname, analyses }) => {
        lastBlob  = blob;
        lastFname = fname;
        showResult(analyses);
        bidsLog(`Complete — ${fname}`, 'info');
        setTimeout(() => setProgress(0), 1200);
        btn.disabled = false;
        if (spin) spin.style.display = 'none';
        if (txt)  txt.textContent = '◑  GENERATE WORD REPORT';
        downloadReport();
      },
      onError: (err) => {
        const msg = (err instanceof Error) ? err.message : String(err);
        bidsLog('Failed: ' + msg, 'error');
        setProgress(0);
        btn.disabled = false;
        if (spin) spin.style.display = 'none';
        if (txt)  txt.textContent = '◑  GENERATE WORD REPORT';
      },
    });
  };

  // ── Init (called by nav.js after lazy page load) ──────────────────
  window.initBidsPage = function () {
    const input  = document.getElementById('bids-file-input');
    const zone   = document.getElementById('bids-upload-zone');
    const timeEl = document.getElementById('bids-init-time');
    const dlBtn  = document.getElementById('bids-download-btn');
    const rc     = document.getElementById('bids-result-card');

    if (timeEl) timeEl.textContent = new Date().toUTCString().split(' ')[4];
    if (rc)     rc.style.display = 'none';

    if (!input || !zone) return;

    input.addEventListener('change', e => addFiles(e.target.files));

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });

    if (dlBtn) dlBtn.addEventListener('click', downloadReport);

    // Re-init file state (page may have been re-loaded)
    bidsFiles = [];
    lastBlob  = null;
    lastFname = null;
    updateFileList();
  };

})();
