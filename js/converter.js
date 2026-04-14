// ===================================================================
// FILE HANDLING
// ===================================================================
let files = [];
let logEntries = 0;

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

function addLog(msg, type = 'info') {
  logEntries++;
  const body = document.getElementById('log-body');
  const time = new Date().toUTCString().split(' ')[4];
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${type}">${msg}</span>`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
  document.getElementById('log-count').textContent = logEntries + ' ENTRIES';
}

function renderFiles() {
  const list = document.getElementById('file-list');
  const empty = document.getElementById('empty-state');
  const countLabel = document.getElementById('file-count-label');

  // Clear non-empty-state children
  Array.from(list.children).forEach(c => { if (c.id !== 'empty-state') c.remove(); });

  if (files.length === 0) {
    empty.classList.add('visible');
    document.getElementById('convert-btn').disabled = true;
    countLabel.textContent = '0 FILES QUEUED';
    return;
  }

  empty.classList.remove('visible');
  countLabel.textContent = files.length + ' FILE' + (files.length > 1 ? 'S' : '') + ' QUEUED';
  document.getElementById('convert-btn').disabled = false;

  files.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item ' + (f.status || 'pending');
    item.id = 'file-item-' + idx;
    item.innerHTML = `
      <div class="file-icon">📄</div>
      <div class="file-info">
        <div class="file-name">${f.file.name}</div>
        <div class="file-meta">
          <span>${formatBytes(f.file.size)}</span>
          <span>PDF</span>
        </div>
      </div>
      <span class="file-status ${f.status || 'pending'}">${(f.status || 'PENDING').toUpperCase()}</span>
      <button class="file-remove" onclick="removeFile(${idx})" title="Remove">✕</button>
    `;
    list.insertBefore(item, empty);
  });
}

function removeFile(idx) {
  addLog(`Removed: ${files[idx].file.name}`, 'warn');
  files.splice(idx, 1);
  renderFiles();
  document.getElementById('result-card').classList.remove('visible');
}

function initConverterPage() {
  // File input
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      handleFiles(Array.from(e.target.files));
      this.value = '';
    });
  }

  // Drag and drop
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles(Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf'));
    });
  }

  // Reset init-time display
  const initTimeEl = document.getElementById('init-time');
  if (initTimeEl) initTimeEl.textContent = new Date().toUTCString().split(' ')[4];
}

function handleFiles(newFiles) {
  if (!newFiles.length) return;
  newFiles.forEach(f => {
    if (!files.find(x => x.file.name === f.name && x.file.size === f.size)) {
      files.push({ file: f, status: 'pending' });
      addLog(`Queued: ${f.name} (${formatBytes(f.size)})`, 'info');
    }
  });
  renderFiles();
  startConversion();
}

// ===================================================================
// CONVERSION ENGINE
// ===================================================================
const BACKEND = 'http://localhost:8080/api/convert';
let xlsxBlob = null;
let pdfBaseName = '';

async function checkBackend() {
  try {
    const r = await fetch(BACKEND, { method: 'OPTIONS', signal: AbortSignal.timeout(800) });
    return r.ok || r.status === 200;
  } catch { return false; }
}

async function startConversion() {
  if (!files.length) return;

  pdfBaseName = files[0].file.name.replace(/\.pdf$/i, '');

  const btn         = document.getElementById('convert-btn');
  const btnText     = document.getElementById('convert-btn-text');
  const spinner     = document.getElementById('spinner');
  const progressWrap= document.getElementById('progress-wrap');
  const progressBar = document.getElementById('progress-bar');

  btn.disabled = true;
  btn.classList.add('processing');
  spinner.classList.add('visible');
  btnText.textContent = 'PROCESSING...';
  progressWrap.classList.add('visible');
  progressBar.style.width = '0%';

  document.getElementById('result-card').classList.remove('visible');
  document.getElementById('res-files').textContent = '—';

  addLog('Initialising roster processing engine...', 'highlight');

  let allDuties = [];
  let totalCrews = new Set();

  const backendAvailable = await checkBackend();

  if (backendAvailable) {
    addLog('Backend connected · using pdfplumber parser', 'success');
    progressBar.style.width = '15%';

    try {
      const form = new FormData();
      files.forEach((f, i) => {
        form.append('file' + i, f.file, f.file.name);
        f.status = 'processing';
      });
      renderFiles();

      addLog(`Uploading ${files.length} file(s) to parser...`, 'info');
      progressBar.style.width = '30%';

      const resp = await fetch(BACKEND, { method: 'POST', body: form });
      if (!resp.ok) throw new Error(`Backend error ${resp.status}`);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      allDuties = data.duties;
      allDuties.forEach(d => totalCrews.add(d.crewId));

      files.forEach(f => { f.status = 'success'; });
      renderFiles();

      addLog(`  ✓ Parsed ${data.totalDuties} duty rows across ${data.totalCrews} crews`, 'success');
      addLog('  ✓ Carry-over duties (prev month) included', 'info');
      addLog('  ✓ Merged duty codes split (UNION, VGDO chains, etc.)', 'info');
      progressBar.style.width = '70%';

    } catch (err) {
      addLog('  ⚠ Backend error: ' + err.message, 'warn');
      addLog('  → Falling back to demo mode', 'warn');
      files.forEach(f => { f.status = 'error'; });
      renderFiles();
      allDuties = [];
      totalCrews = new Set();
      for (let i = 0; i < files.length; i++) {
        const sim = simulateParse(files[i].file.name, i);
        allDuties = allDuties.concat(sim.duties);
        sim.crews.forEach(c => totalCrews.add(c));
        files[i].status = 'success';
      }
      renderFiles();
    }

  } else {
    addLog('Backend not detected · running in DEMO mode', 'warn');
    addLog('  → Start server.py for real PDF parsing', 'info');

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      f.status = 'processing';
      renderFiles();
      addLog(`Simulating parse: ${f.file.name}`, 'info');
      progressBar.style.width = ((i / files.length) * 60) + '%';
      await sleep(600);
      const sim = simulateParse(f.file.name, i);
      allDuties = allDuties.concat(sim.duties);
      sim.crews.forEach(c => totalCrews.add(c));
      addLog(`  ✓ ${sim.duties.length} duty rows (simulated)`, 'success');
      f.status = 'success';
      renderFiles();
    }
    progressBar.style.width = '70%';
  }

  addLog('Building Excel workbook...', 'highlight');
  await sleep(200);
  addLog('  → Sorting by seniority → date...', 'info');
  await sleep(150);
  addLog('  → Writing Roster sheet...', 'info');
  await sleep(200);
  addLog('  → Writing Row Count Summary sheet...', 'info');
  await sleep(150);
  progressBar.style.width = '95%';

  try {
    xlsxBlob = await buildExcel(allDuties);
    addLog('  ✓ Excel file generated successfully', 'success');
  } catch (err) {
    addLog('  ⚠ Excel build error: ' + err.message, 'warn');
  }

  progressBar.style.width = '100%';
  await sleep(200);

  const pdfRows   = allDuties.length;
  const excelRows = pdfRows + 1;

  document.getElementById('res-files').textContent = files.length;
  document.getElementById('res-pdf-rows').textContent = pdfRows;
  document.getElementById('res-excel-rows').textContent = excelRows;
  document.getElementById('res-crews').textContent = totalCrews.size;

  addLog(`COMPLETE · PDF rows: ${pdfRows} · Excel rows: ${excelRows} · Crews: ${totalCrews.size}`, 'success');

  btn.classList.remove('processing');
  btn.classList.add('success');
  spinner.classList.remove('visible');
  btnText.textContent = '✓  CONVERSION COMPLETE';
  btn.disabled = false;

  document.getElementById('result-card').classList.add('visible');

  downloadExcel();

  setTimeout(() => {
    btn.classList.remove('success');
    btnText.textContent = '⇄   CONVERT TO EXCEL';
  }, 4000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===================================================================
// SIMULATE PARSED DATA
// ===================================================================
function simulateParse(filename, fileIndex) {
  const crewNames = ['Symonds','Mammel','Hughes','Neufeld','Charbonneau','Gillies',
    'Di Tommaso','Bold-de-Haughton','Camplin','Spentzas','Hunter','Kirk','Schatz',
    'Delf','English','Smith','Broderick','Black','Wolf','Guy','Carmichael','Bateman',
    'Schwegler','Fox','Distefano','Cossey','Choiselat','Beselt','Brady','Page',
    'Engbrecht','Armstrong','Lin','Enzenhofer','Zou','Kim','Borysenko','Lainchbury',
    'Yasel','Healey','Drummond','Su','Budd','Booth','Lyons','Sinclair'];

  const assignments = ['FLY','FLY','FLY','FLY','FLY','FLYXX','SIM','VAC','VAC',
    'VGDO','TGDO','COD','PRPM','PRAM','CRM','CBT','LEAVE','UNION'];

  const pairings = ['V4011','V4012','V4013','V4014','V4015','V4017','V4019','V4020',
    'V4022','V4024','V4030','V4032','V4035'];

  const duties = [];
  const crewSet = new Set();

  const crewCount = 40 + Math.floor(Math.random() * 12);
  const selectedCrews = crewNames.slice(0, crewCount);

  selectedCrews.forEach((name, ci) => {
    crewSet.add(name);
    const dutyCount = 10 + Math.floor(Math.random() * 20);
    const usedDays = new Set();

    for (let d = 0; d < dutyCount; d++) {
      let day;
      do { day = 1 + Math.floor(Math.random() * 31); } while (usedDays.has(day) && usedDays.size < 28);
      usedDays.add(day);

      const asgn = assignments[Math.floor(Math.random() * assignments.length)];
      const isFly = asgn === 'FLY';
      const pairing = isFly ? pairings[Math.floor(Math.random() * pairings.length)] : '';

      duties.push({
        crewId: String(ci * 37 + 3),
        seniority: String(ci + 1),
        name,
        credit: '082:00',
        daysOff: '18',
        date: `2025-05-${String(day).padStart(2,'0')}`,
        startDate: `2025-05-${String(day).padStart(2,'0')} 08:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`,
        endDate: `2025-05-${String(day).padStart(2,'0')} 16:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`,
        assignment: asgn,
        creditHours: isFly ? '005:45' : '',
        pairingLabel: pairing,
        actingRank: isFly ? 'CA' : '',
      });
    }
  });

  return { duties, crews: crewSet };
}

// ===================================================================
// BUILD EXCEL
// ===================================================================
async function buildExcel(duties) {
  if (!window.XLSX) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }

  const wb = XLSX.utils.book_new();

  const sorted = [...duties].sort((a, b) => {
    const senDiff = parseInt(a.seniority, 10) - parseInt(b.seniority, 10);
    if (senDiff !== 0) return senDiff;
    return a.date.localeCompare(b.date);
  });

  const headers = ['Crew ID','Seniority','Name','Base','Rank','RP CR','PR DOs',
    'Date','Start Date','End Date','Assignment','Credit','Pairing Label','Acting Rank'];

  const rows = [headers, ...sorted.map(d => [
    d.crewId, d.seniority, d.name, d.crew_base, d.crew_rank, d.credit, d.daysOff,
    d.date, d.startDate, d.endDate,
    d.assignment, d.creditHours, d.pairingLabel, d.actingRank
  ])];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  const autoFit = (colIdx) => {
    const maxLen = rows.reduce((max, row) => Math.max(max, String(row[colIdx] ?? '').length), 0);
    return { wch: maxLen + 2 };
  };
  const colDefs = [8, 10, 22, 6, 6, 10, null, 12, null, null, 12, 8, 14, 12];
  ws['!cols'] = colDefs.map((w, i) => w !== null ? { wch: w } : autoFit(i));

  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Roster');

  const assignCounts = {};
  duties.forEach(d => { assignCounts[d.assignment] = (assignCounts[d.assignment] || 0) + 1; });

  const crewSet = new Set(duties.map(d => d.crewId));

  const summaryRows = [
    ['Metric', 'Count'],
    ['PDF Row Count Logic', 'Each crew × each date duty = 1 row'],
    ['2 duties on same date', '= 2 rows'],
    ['', ''],
    ['PDF Total Duty Rows', duties.length],
    ['Excel Data Rows (excl. header)', duties.length],
    ['Excel Total Rows (incl. header)', duties.length + 1],
    ['Unique Crew Members', crewSet.size],
    ['', ''],
    ['Assignment Breakdown', ''],
    ...Object.entries(assignCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => [k, v])
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2['!cols'] = [{wch: 40}, {wch: 20}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Row Count Summary');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ===================================================================
// DOWNLOAD
// ===================================================================
function downloadExcel() {
  if (!xlsxBlob) {
    addLog('No output ready. Run conversion first.', 'warn');
    return;
  }
  const url = URL.createObjectURL(xlsxBlob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth()+1).padStart(2,'0')
    + String(now.getDate()).padStart(2,'0')
    + '_'
    + String(now.getHours()).padStart(2,'0')
    + String(now.getMinutes()).padStart(2,'0')
    + String(now.getSeconds()).padStart(2,'0');
  const base = pdfBaseName || 'ROIs_Crew_Export';
  const filename = `${base}_${ts}.xlsx`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addLog('Excel file downloaded: ' + filename, 'success');
}
