// ===================================================================
// N-BIDS REFORMAT
// ===================================================================

let _nbidsFiles    = [];     // selected File objects (one or more)
let _nbidsBlob     = null;   // result Excel blob
let _nbidsFilename = 'crew_bids_reference.xlsx';

function initNbidsPage() {
  _nbidsFiles = [];
  _nbidsBlob  = null;
  const zone  = document.getElementById('nbids-upload-zone');
  const input = document.getElementById('nbids-file-input');
  if (!zone || !input) return;

  // Drag & drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) nbidsSetFiles(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files.length) nbidsSetFiles(input.files); });
}

function nbidsSetFiles(fileList) {
  _nbidsFiles = Array.from(fileList);
  const display = document.getElementById('nbids-file-display');
  const nameEl  = document.getElementById('nbids-file-name');
  if (display) display.style.display = 'block';
  if (nameEl) {
    nameEl.innerHTML = _nbidsFiles.map(f =>
      `📄 ${f.name}  <span style="color:var(--text-secondary)">(${(f.size/1024).toFixed(1)} KB)</span>`
    ).join('<br>');
  }
  document.getElementById('nbids-process-btn').disabled = false;
  nbidsLog('info', `${_nbidsFiles.length} file(s) selected: ${_nbidsFiles.map(f => f.name).join(', ')}`);
}

function nbidsLog(type, msg) {
  const body    = document.getElementById('nbids-log-body');
  const countEl = document.getElementById('nbids-log-count');
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

async function nbidsProcess() {
  if (!_nbidsFiles.length) return;
  const btn     = document.getElementById('nbids-process-btn');
  const spinner = document.getElementById('nbids-spinner');
  const btnText = document.getElementById('nbids-btn-text');
  const period  = (document.getElementById('nbids-period')?.value || '').trim();

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  btnText.textContent = 'Processing…';
  document.getElementById('nbids-result-card').style.display = 'none';
  nbidsLog('info', `Uploading ${_nbidsFiles.length} file(s) to server…`);

  const wrap = document.getElementById('nbids-progress-wrap');
  const bar  = document.getElementById('nbids-progress-bar');
  if (wrap) wrap.style.display = 'block';
  if (bar)  bar.style.width = '30%';

  try {
    const form = new FormData();
    _nbidsFiles.forEach(f => form.append('file', f));
    form.append('period', period);

    const res = await fetch('/api/nbids-reformat', { method: 'POST', body: form });
    if (bar) bar.style.width = '80%';

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }

    // Response is JSON with base64 xlsx + stats
    const data = await res.json();
    if (bar) bar.style.width = '100%';

    // Decode base64 xlsx
    const binary = atob(data.xlsx_b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    _nbidsBlob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    _nbidsFilename = data.filename || 'nbids_output.xlsx';

    // Show result card
    document.getElementById('nbids-res-rows').textContent    = data.input_rows.toLocaleString();
    document.getElementById('nbids-res-parsed').textContent  = data.parsed_rows.toLocaleString();
    document.getElementById('nbids-res-groups').textContent  = data.groups.toLocaleString();
    document.getElementById('nbids-res-errors').textContent  = data.error_rows.toLocaleString();
    const filesEl = document.getElementById('nbids-res-files');
    if (filesEl) filesEl.textContent = (data.files || _nbidsFiles.length).toLocaleString();
    document.getElementById('nbids-result-card').style.display = 'block';

    nbidsLog('ok', `Done — ${data.parsed_rows} rows parsed, ${data.groups} groups, ${data.error_rows} errors`);

    // Auto-download immediately after successful generate
    await nbidsDownload();

  } catch (e) {
    nbidsLog('error', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = '⇄   PROCESS & CONVERT';
    if (wrap) wrap.style.display = 'none';
    if (bar)  bar.style.width = '0%';
  }
}

async function nbidsDownload() {
  if (!_nbidsBlob) return;

  // Use File System Access API to let user pick save location
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: _nbidsFilename,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(_nbidsBlob);
      await writable.close();
      nbidsLog('ok', `Saved to selected location`);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;  // user cancelled
      // Fall through to regular download
    }
  }

  // Fallback: regular download
  const url = URL.createObjectURL(_nbidsBlob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = _nbidsFilename;
  a.click();
  URL.revokeObjectURL(url);
  nbidsLog('ok', `Downloaded as ${_nbidsFilename}`);
}
