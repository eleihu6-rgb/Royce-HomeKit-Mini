// ===================================================================
// BIDS TYPE ANALYSIS — ANALYSIS ENGINE
// Parses N-PBS crew bid export files (.txt), classifies bid types,
// and generates a professional DOCX comparison report.
//
// Entry point (window):
//   analyseBidsFiles(fileArray, { onLog, onProgress, onDone, onError })
//   BID_TYPES — exposed for UI reference card
// ===================================================================

// ── Bid type definitions ─────────────────────────────────────────────
// Order matters within Prefer Off group (most specific first).
// meta:true = employee-level statistic, not a preference line.
const BID_TYPES = [

  // ── Group / Structure Controls ──────────────────────────────────
  { id:'pairing_bid_group',  label:'Pairing Bid Group',
    group:'Group / Structure Controls',
    match: s => /^Pairing Bid Group/.test(s) },
  { id:'reserve_bid_group',  label:'Reserve Bid Group',
    group:'Group / Structure Controls',
    match: s => /^Reserve Bid Group/.test(s) },
  { id:'clear_schedule',     label:'Clear Schedule and Start Next Bid Group',
    group:'Group / Structure Controls',
    match: s => /^Clear Schedule and Start Next Bid Group/.test(s) },
  // meta — employee-level flags, not per preference-line
  { id:'default_only', label:'Default Bid Only (no Current Bid)',
    group:'Group / Structure Controls', meta:true },
  { id:'current_only', label:'Current Bid Only (no Default Bid)',
    group:'Group / Structure Controls', meta:true },
  { id:'both_bids',    label:'Both Default + Current Bid',
    group:'Group / Structure Controls', meta:true },

  // ── Set Condition ────────────────────────────────────────────────
  { id:'sc_short_call',       label:'Set Condition Short Call Type',
    group:'Set Condition',
    match: s => /^Set Condition Short Call Type/.test(s) },
  { id:'sc_max_credit',       label:'Set Condition Maximum Credit Window',
    group:'Set Condition',
    match: s => /^Set Condition Maximum Credit Window/.test(s) },
  { id:'sc_min_credit',       label:'Set Condition Minimum Credit Window',
    group:'Set Condition',
    match: s => /^Set Condition Minimum Credit Window/.test(s) },
  { id:'sc_max_days_on',      label:'Set Condition Maximum Days On In A Row',
    group:'Set Condition',
    match: s => /^Set Condition Maximum Days On In A Row/.test(s) },
  { id:'sc_min_days_off',     label:'Set Condition Minimum Days Off In A Row',
    group:'Set Condition',
    match: s => /^Set Condition Minimum Days Off In A Row/.test(s) },
  { id:'sc_no_same_day',      label:'Set Condition No Same Day Pairings',
    group:'Set Condition',
    match: s => /^Set Condition No Same Day Pairings/.test(s) },
  { id:'sc_consec_days_off',  label:'Set Condition Consecutive Days Off In A Row',
    group:'Set Condition',
    match: s => /^Set Condition \d+ Consecutive Days Off In A Row/.test(s) },
  { id:'sc_pattern',          label:'Set Condition Pattern (Days On/Off)',
    group:'Set Condition',
    match: s => /^Set Condition Pattern/.test(s) },
  { id:'sc_min_base_layover', label:'Set Condition Minimum Base Layover',
    group:'Set Condition',
    match: s => /^Set Condition Minimum Base Layover/.test(s) },
  { id:'sc_days_off_with',    label:'Set Condition Days Off With Employee',
    group:'Set Condition',
    match: s => /^Set Condition Days Off With Employee/.test(s) },
  { id:'sc_days_off_opp',     label:'Set Condition Days Off Opposite Employee',
    group:'Set Condition',
    match: s => /^Set Condition Days Off Opposite Employee/.test(s) },

  // ── Award Pairings ───────────────────────────────────────────────
  { id:'aw_any_landing',     label:'Award Pairings If Any Landing',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Landing/.test(s) },
  { id:'aw_pairing_num',     label:'Award Pairings If Pairing Number',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Number/.test(s) },
  { id:'aw_any_layover',     label:'Award Pairings If Any Layover',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Layover/.test(s) },
  { id:'aw_checkin',         label:'Award Pairings If Pairing Check-In Time',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Check-In Time/.test(s) },
  { id:'aw_total_credit',    label:'Award Pairings If Pairing Total Credit',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Total Credit/.test(s) },
  { id:'aw_departing',       label:'Award Pairings If Departing On',
    group:'Award Pairings',
    match: s => /^Award Pairings If Departing On/.test(s) },
  { id:'aw_avg_credit',      label:'Award Pairings If Average Daily Credit',
    group:'Award Pairings',
    match: s => /^Award Pairings If Average Daily Credit/.test(s) },
  { id:'aw_any_duty_on',     label:'Award Pairings If Any Duty On',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Duty On/.test(s) },
  { id:'aw_any_leg_with',    label:'Award Pairings If Any Leg With',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Leg With/.test(s) },
  { id:'aw_any_duty_legs',   label:'Award Pairings If Any Duty Legs',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Duty Legs/.test(s) },
  { id:'aw_any_flight',      label:'Award Pairings If Any Flight Number',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Flight Number/.test(s) },
  { id:'aw_checkout',        label:'Award Pairings If Pairing Check-Out Time',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Check-Out Time/.test(s) },
  { id:'aw_pairing_len',     label:'Award Pairings If Pairing Length',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Length/.test(s) },
  { id:'aw_enroute_in',      label:'Award Pairings If Any Enroute Check-In Time',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Enroute Check-In Time/.test(s) },
  { id:'aw_tafb',            label:'Award Pairings If TAFB',
    group:'Award Pairings',
    match: s => /^Award Pairings If TAFB/.test(s) },
  { id:'aw_total_legs',      label:'Award Pairings If Total Legs In Pairing',
    group:'Award Pairings',
    match: s => /^Award Pairings If Total Legs In Pairing/.test(s) },
  { id:'aw_duty_dur',        label:'Award Pairings If Any Duty Duration',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Duty Duration/.test(s) },
  { id:'aw_avg_block',       label:'Award Pairings If Average Daily Block Time',
    group:'Award Pairings',
    match: s => /^Award Pairings If Average Daily Block Time/.test(s) },
  { id:'aw_reserve_day',     label:'Award Reserve Day On',
    group:'Award Pairings',
    match: s => /^Award Reserve Day On/.test(s) },
  { id:'aw_every_layover',   label:'Award Pairings If Every Layover',
    group:'Award Pairings',
    match: s => /^Award Pairings If Every Layover/.test(s) },
  { id:'aw_every_duty_legs', label:'Award Pairings If Every Duty Legs',
    group:'Award Pairings',
    match: s => /^Award Pairings If Every Duty Legs/.test(s) },
  { id:'aw_total_block',     label:'Award Pairings If Pairing Total Block Time',
    group:'Award Pairings',
    match: s => /^Award Pairings If Pairing Total Block Time/.test(s) },
  { id:'aw_deadhead_legs',   label:'Award Pairings If Deadhead Legs',
    group:'Award Pairings',
    match: s => /^Award Pairings If Deadhead Legs/.test(s) },
  { id:'aw_credit_tafb',     label:'Award Pairings If Credit Per Time Away From Base',
    group:'Award Pairings',
    match: s => /^Award Pairings If Credit Per Time Away From Base/.test(s) },
  { id:'aw_redeye',          label:'Award Pairings If Any Leg Is Redeye',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Leg Is Redeye/.test(s) },
  { id:'aw_first_duty_legs', label:'Award Pairings If Total Legs In First Duty',
    group:'Award Pairings',
    match: s => /^Award Pairings If Total Legs In First Duty/.test(s) },
  { id:'aw_enroute_out',     label:'Award Pairings If Any Enroute Check-Out',
    group:'Award Pairings',
    match: s => /^Award Pairings If Any Enroute Check-Out/.test(s) },
  { id:'aw_every_duty_on',   label:'Award Pairings If Every Duty On',
    group:'Award Pairings',
    match: s => /^Award Pairings If Every Duty On/.test(s) },
  { id:'aw_every_duty_dur',  label:'Award Pairings If Every Duty Duration',
    group:'Award Pairings',
    match: s => /^Award Pairings If Every Duty Duration/.test(s) },
  { id:'aw_every_leg_with',  label:'Award Pairings If Every Leg With',
    group:'Award Pairings',
    match: s => /^Award Pairings If Every Leg With/.test(s) },
  { id:'aw_work_start',      label:'Award Pairings If Work Start Station',
    group:'Award Pairings',
    match: s => /^Award Pairings If Work Start Station/.test(s) },
  { id:'aw_deadhead_day',    label:'Award Pairings If Deadhead Day',
    group:'Award Pairings',
    match: s => /^Award Pairings If Deadhead Day/.test(s) },

  // ── Avoid Pairings ───────────────────────────────────────────────
  { id:'av_any_landing',     label:'Avoid Pairings If Any Landing',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Landing/.test(s) },
  { id:'av_checkin',         label:'Avoid Pairings If Pairing Check-In Time',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Pairing Check-In Time/.test(s) },
  { id:'av_pairing_num',     label:'Avoid Pairings If Pairing Number',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Pairing Number/.test(s) },
  { id:'av_any_duty_legs',   label:'Avoid Pairings If Any Duty Legs',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Duty Legs/.test(s) },
  { id:'av_total_credit',    label:'Avoid Pairings If Pairing Total Credit',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Pairing Total Credit/.test(s) },
  { id:'av_any_layover',     label:'Avoid Pairings If Any Layover',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Layover/.test(s) },
  { id:'av_total_legs',      label:'Avoid Pairings If Total Legs In Pairing',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Total Legs In Pairing/.test(s) },
  { id:'av_checkout',        label:'Avoid Pairings If Pairing Check-Out Time',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Pairing Check-Out Time/.test(s) },
  { id:'av_pairing_len',     label:'Avoid Pairings If Pairing Length',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Pairing Length/.test(s) },
  { id:'av_enroute_in',      label:'Avoid Pairings If Any Enroute Check-In Time',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Enroute Check-In Time/.test(s) },
  { id:'av_departing',       label:'Avoid Pairings If Departing On',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Departing On/.test(s) },
  { id:'av_any_duty_on',     label:'Avoid Pairings If Any Duty On',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Duty On/.test(s) },
  { id:'av_avg_credit',      label:'Avoid Pairings If Average Daily Credit',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Average Daily Credit/.test(s) },
  { id:'av_redeye',          label:'Avoid Pairings If Any Leg Is Redeye',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Leg Is Redeye/.test(s) },
  { id:'av_tafb',            label:'Avoid Pairings If TAFB',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If TAFB/.test(s) },
  { id:'av_deadhead_legs',   label:'Avoid Pairings If Deadhead Legs',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Deadhead Legs/.test(s) },
  { id:'av_duty_dur',        label:'Avoid Pairings If Any Duty Duration',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Duty Duration/.test(s) },
  { id:'av_any_flight',      label:'Avoid Pairings If Any Flight Number',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Flight Number/.test(s) },
  { id:'av_avg_block',       label:'Avoid Pairings If Average Daily Block Time',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Average Daily Block Time/.test(s) },
  { id:'av_enroute_out',     label:'Avoid Pairings If Any Enroute Check-Out',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Enroute Check-Out/.test(s) },
  { id:'av_deadhead_day',    label:'Avoid Pairings If Deadhead Day',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Deadhead Day/.test(s) },
  { id:'av_first_duty_legs', label:'Avoid Pairings If Total Legs In First Duty',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Total Legs In First Duty/.test(s) },
  { id:'av_sit_length',      label:'Avoid Pairings If Any Sit Length',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Any Sit Length/.test(s) },
  { id:'av_credit_tafb',     label:'Avoid Pairings If Credit Per Time Away From Base',
    group:'Avoid Pairings',
    match: s => /^Avoid Pairings If Credit Per Time Away From Base/.test(s) },

  // ── Prefer Off — ORDER MATTERS: most specific first ──────────────
  { id:'pref_weekends', label:'Prefer Off (Weekends)',
    group:'Prefer Off',
    match: s => /^Prefer Off Weekends/.test(s) },
  { id:'pref_range',    label:'Prefer Off (Date Range)',
    group:'Prefer Off',
    match: s => /^Prefer Off .+ - /.test(s) },
  { id:'pref_dow',      label:'Prefer Off (Day of Week)',
    group:'Prefer Off',
    match: s => /^Prefer Off (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/.test(s) },
  { id:'pref_dates',    label:'Prefer Off (Specific Dates)',
    group:'Prefer Off',
    match: s => /^Prefer Off /.test(s) },

  // ── Other ────────────────────────────────────────────────────────
  { id:'waive_no_same_day', label:'Waive No Same Day Duty Starts',
    group:'Other',
    match: s => /^Waive No Same Day Duty Starts/.test(s) },
  { id:'forget_line',       label:'Forget Line',
    group:'Other',
    match: s => /^Forget Line/.test(s) },
];

const GROUPS = [
  'Group / Structure Controls',
  'Set Condition',
  'Award Pairings',
  'Avoid Pairings',
  'Prefer Off',
  'Other',
];

// Expose for UI reference card
window.BID_TYPES = BID_TYPES;
window.BID_GROUPS = GROUPS;

// ── Classify a single preference line ────────────────────────────
function classifyPref(line) {
  for (const bt of BID_TYPES) {
    if (!bt.meta && bt.match && bt.match(line)) return bt.id;
  }
  return null;
}

// ── RTF → plain text ─────────────────────────────────────────────
// Regex-based stripper — works for macOS Cocoa RTF and Word RTF.
// Strategy: iteratively unwrap innermost {…} groups, removing known
// skip destinations; then convert paragraph markers to newlines and
// strip all remaining control words.
function stripRtf(rtf) {
  let t = rtf;

  // 1. Iteratively strip innermost {…} groups (up to 30 passes for deep nesting)
  for (let pass = 0; pass < 30; pass++) {
    const prev = t;
    t = t.replace(/\{[^{}]*\}/g, s => {
      // Skip group entirely: {\* …} ignorable or known destination
      if (/^\{\\\*/.test(s)) return '';
      if (/^\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object|header|footer|footnote|fldinst|fldrslt|expandedcolortbl)\b/.test(s)) return '';
      // Otherwise keep content, strip the braces
      return s.slice(1, -1);
    });
    if (t === prev) break;  // no more inner groups
  }

  // 2. Paragraph / line breaks → newline
  //    \par and \pard both signal a paragraph boundary in Cocoa RTF
  t = t.replace(/\\pard?\b[^\n\\{]*/g, '\n');   // \par or \pard (+ any trailing params on same "word")
  t = t.replace(/\\line\b\s*/g, '\n');

  // 3. Tab
  t = t.replace(/\\tab\b\s*/g, '\t');

  // 4. Hex-encoded characters \'xx
  t = t.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  // 5. Remove all remaining control words  \word  \word123  \word-123
  t = t.replace(/\\[a-zA-Z]+[-]?\d*[ ]?/g, '');

  // 6. Remove stray control symbols  (backslash + non-alpha)
  t = t.replace(/\\./g, '');

  // 7. Remove any leftover braces
  t = t.replace(/[{}]/g, '');

  // 8. Collapse runs of spaces/tabs on each line; normalise blank lines
  t = t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}

// ── Parse one N-PBS bid text export ──────────────────────────────
// Returns { period, records[] }
// record: { empNum, confirmation, bidType, prefs[], examples{} }
function parseBidsFile(text) {
  // Strip RTF wrapper if present
  if (text.trimStart().startsWith('{\\rtf')) text = stripRtf(text);

  // Normalise line endings (Windows \r\n → \n, old Mac \r → \n)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const period = (text.match(/^Period:\s*(.+)/m) || [])[1]?.trim() || 'Unknown';

  // Capture first 4 non-empty lines for diagnostics
  const firstLines = text.split('\n').filter(l => l.trim()).slice(0, 4);

  // Match employee block header:
  //   ----...----
  //   Seniority N  Category X-Y-Z  Employee # NNN
  //   Confirmation: NNNNN on DATE  Default/Current Bid
  //   ----...----
  const HEADER_RE = /-{20,}\s*\n(?:Seniority\s+\d+\s+Category\s+\S+\s+Employee\s+#\s+(\d+))\s*\n(Confirmation:\s+(\d+).*?(Default Bid|Current Bid).*?)\n-{20,}/g;

  const positions = [];
  let m;
  while ((m = HEADER_RE.exec(text)) !== null) {
    positions.push({
      start:        m.index,
      contentStart: m.index + m[0].length,
      empNum:       parseInt(m[1]),
      confirmation: m[3],
      bidType:      m[4],
    });
  }

  // Preference line: right-aligned number field + ". " + preference text
  // Format: "   1.  Text" (1-digit) or "  10.  Text" (2-digit) etc.
  // The column is always 7 chars wide before the text starts.
  const PREF_LINE = /^\s+(\d+)\.\s{2,}(.+)/;

  const records = positions.map((pos, idx) => {
    const contentEnd = idx + 1 < positions.length ? positions[idx + 1].start : text.length;
    const content    = text.slice(pos.contentStart, contentEnd);

    const prefs    = [];
    const examples = {};
    let inPrefs    = false;

    for (const line of content.split('\n')) {
      if (line.includes('Bid Preferences:')) { inPrefs = true; continue; }
      if (!inPrefs) continue;
      const pm = PREF_LINE.exec(line);
      if (!pm) continue;
      const pref = pm[2].trim();
      prefs.push(pref);
      const id = classifyPref(pref);
      if (id && !examples[id]) examples[id] = pref;
    }

    return { empNum: pos.empNum, confirmation: pos.confirmation, bidType: pos.bidType, prefs, examples };
  });

  return { period, records, blockCount: positions.length, firstLines };
}

// ── Analyse a parsed file ─────────────────────────────────────────
// Returns {
//   period, totalCrew, defaultOnly, currentOnly, both,
//   counts{id->n}, examples{id->str}, totalPrefs
// }
function analyseFile(parsed) {
  const { period, records } = parsed;

  // Group records by confirmation number
  const byConf = {};
  for (const r of records) {
    if (!byConf[r.confirmation]) byConf[r.confirmation] = {};
    byConf[r.confirmation][r.bidType] = r;
  }

  const result = {
    period,
    totalCrew:   Object.keys(byConf).length,
    defaultOnly: 0,
    currentOnly: 0,
    both:        0,
    counts:      {},
    examples:    {},
    totalPrefs:  0,
  };

  BID_TYPES.forEach(bt => { result.counts[bt.id] = 0; result.examples[bt.id] = ''; });

  for (const conf of Object.values(byConf)) {
    const hasDefault = !!conf['Default Bid'];
    const hasCurrent = !!conf['Current Bid'];

    if (hasDefault && hasCurrent) { result.both++;        result.counts['both_bids']++;    }
    else if (hasDefault)           { result.defaultOnly++; result.counts['default_only']++;  }
    else                           { result.currentOnly++; result.counts['current_only']++;  }

    // Use current bid for preference analysis; fall back to default
    const record = conf['Current Bid'] || conf['Default Bid'];
    result.totalPrefs += record.prefs.length;

    // Count each bid type once per employee (use a Set for uniqueness)
    const used = new Set();
    for (const pref of record.prefs) {
      const id = classifyPref(pref);
      if (id && !used.has(id)) {
        used.add(id);
        result.counts[id]++;
        if (!result.examples[id]) result.examples[id] = record.examples[id] || pref;
      }
    }
  }

  return result;
}

// ── DOCX helpers ─────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src     = src;
    s.onload  = res;
    s.onerror = () => rej(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureDocx() {
  if (!window.docx) {
    await loadScript('js/vendor/docx.min.js');
    if (!window.docx) throw new Error('docx library failed to initialise');
  }
}

// Colour palette
const CLR = {
  navy:      '1B3A5C',  // title / section text
  navyBg:    '1B3A5C',  // header row bg
  blueBg:    '2E6DA4',  // section header bg
  white:     'FFFFFF',
  newBg:     'FFF3CD',  // ★ NEW — yellow
  onlyBg:    'FFE5D0',  // ◆ BASELINE ONLY — orange
  zeroBg:    'F7F7F7',  // zero-count row — light grey
  mutedText: '777777',
  bodyText:  '222222',
};

function thinBorder() {
  const D = window.docx;
  const b = { style: D.BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  return { top:b, bottom:b, left:b, right:b, insideHorizontal:b, insideVertical:b };
}

function mkCell(text, {
  bold=false, italic=false, color=CLR.bodyText, bg=null,
  size=20, align='left', width=null, span=null,
} = {}) {
  const D = window.docx;
  const alignMap = {
    left:   D.AlignmentType.LEFT,
    center: D.AlignmentType.CENTER,
    right:  D.AlignmentType.RIGHT,
  };
  const para = new D.Paragraph({
    children: [new D.TextRun({ text: String(text ?? ''), bold, italic, color, size })],
    alignment: alignMap[align] || D.AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
  });
  const opts = {
    children: [para],
    verticalAlign: D.VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  };
  if (bg)    opts.shading   = { type: D.ShadingType.CLEAR, color: 'auto', fill: bg };
  if (width) opts.width     = { size: width, type: D.WidthType.DXA };
  if (span)  opts.columnSpan = span;
  return new D.TableCell(opts);
}

function mkRow(cells) {
  return new window.docx.TableRow({ children: cells });
}

function mkHdrRow(cells) {
  return new window.docx.TableRow({ tableHeader: true, children: cells });
}

function mkSectionRow(label, colCount, totalWidth) {
  const D = window.docx;
  return mkRow([mkCell(label, {
    bold:true, color:CLR.white, bg:CLR.blueBg, size:20,
    span:colCount, width:totalWidth,
  })]);
}

// ── Build DOCX document ───────────────────────────────────────────
async function buildDocx(analyses, fileNames) {
  await ensureDocx();
  const D        = window.docx;
  const base     = analyses[0];
  const comps    = analyses.slice(1);
  const isComp   = comps.length > 0;
  const today    = new Date().toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });

  const periodLabel = isComp
    ? `${base.period}  vs  ${comps.map(c => c.period).join(' / ')}`
    : base.period;

  const bodyChildren = [];

  // ── Title block ─────────────────────────────────────────────────
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({ text:'PBS Bid Type Analysis Report', bold:true, size:64, color:CLR.navy })],
    alignment: D.AlignmentType.CENTER,
    spacing: { after: 80 },
  }));
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({ text: periodLabel, size:32, color:CLR.navy, bold:true })],
    alignment: D.AlignmentType.CENTER,
    spacing: { after: 60 },
  }));
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({
      text: `Prepared for: Flair Airlines   ·   Generated: ${today}   ·   ROIs Crew Platform`,
      size:20, color:CLR.mutedText, italics:true,
    })],
    alignment: D.AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  // ── Section 1: Overview ──────────────────────────────────────────
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({ text:'1.  Overview', bold:true, size:32, color:CLR.navy })],
    spacing: { before:200, after:120 },
  }));

  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({
      text: 'This report analyses crew bid type usage extracted from N-PBS bid export files. '
          + 'Each bid type is counted once per crew member (unique usage). '
          + (isComp
              ? `The baseline period is ${base.period}. Comparison period(s): ${comps.map(c=>c.period).join(', ')}.`
              : `Period analysed: ${base.period}.`),
      size:20,
    })],
    spacing: { after: 200 },
  }));

  if (isComp) {
    bodyChildren.push(new D.Paragraph({
      children: [new D.TextRun({ text:'Legend:', bold:true, size:20 })],
      spacing: { after:40 },
    }));
    const legendItems = [
      '★ NEW — Bid type first observed in comparison period (not in baseline)',
      '◆ BASELINE ONLY — Bid type in baseline but absent in comparison period',
      '✓ BOTH — Present in both periods',
      'Δ — Change in crew count vs baseline (absolute + percentage)',
    ];
    for (const li of legendItems) {
      bodyChildren.push(new D.Paragraph({
        children: [new D.TextRun({ text: `    ${li}`, size:20 })],
        spacing: { after:20 },
      }));
    }
    bodyChildren.push(new D.Paragraph({ text:'', spacing:{ after:160 } }));
  }

  // Overview stats table
  const ovHdr = isComp
    ? ['Metric', base.period, ...comps.map(c => c.period)]
    : ['Metric', 'Count'];
  const ovColW = isComp
    ? [3200, 1800, ...comps.map(() => 1800)]
    : [5000, 4360];
  const totalOvW = ovColW.reduce((a,b) => a+b, 0);

  const ovData = [
    ['Total Crew Bidders',         base.totalCrew,   ...comps.map(c => c.totalCrew)],
    ['Default Bid Only',           base.defaultOnly, ...comps.map(c => c.defaultOnly)],
    ['Current Bid Only',           base.currentOnly, ...comps.map(c => c.currentOnly)],
    ['Both Default + Current Bid', base.both,        ...comps.map(c => c.both)],
    ['Total Preference Lines',     base.totalPrefs,  ...comps.map(c => c.totalPrefs)],
  ];

  const ovTable = new D.Table({
    borders: thinBorder(),
    width: { size: totalOvW, type: D.WidthType.DXA },
    rows: [
      mkHdrRow(ovHdr.map((h, i) =>
        mkCell(h, { bold:true, color:CLR.white, bg:CLR.navyBg, size:20, align:i===0?'left':'center', width:ovColW[i] })
      )),
      ...ovData.map(row => mkRow(
        row.map((v, i) => mkCell(v, { align:i===0?'left':'center', width:ovColW[i], size:20 }))
      )),
    ],
  });
  bodyChildren.push(ovTable);
  bodyChildren.push(new D.Paragraph({ text:'', spacing:{ after:320 } }));

  // ── Section 2: Bid Type Analysis ─────────────────────────────────
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({ text:'2.  Bid Type Analysis', bold:true, size:32, color:CLR.navy })],
    spacing: { before:160, after:120 },
  }));

  if (isComp) {
    bodyChildren.push(new D.Paragraph({
      children: [new D.TextRun({
        text: `Baseline: ${base.period} (${base.totalCrew} crew)   ·   `
            + `Comparison: ${comps.map((c,i) => `${c.period} (${c.totalCrew} crew)`).join(', ')}`,
        size:20, italics:true, color:CLR.mutedText,
      })],
      spacing: { after:120 },
    }));
  }

  // Column config
  let colW, hdrLabels;
  if (isComp) {
    colW = comps.length === 1
      ? [360, 3000, 880, 880, 720, 1040, 2480]
      : [320, 2600, 780, ...comps.map(() => 720), 640, 900, 1800];
    hdrLabels = ['#', 'Bid Type', base.period, ...comps.map(c => c.period), 'Δ', 'Status', 'Example Preference'];
  } else {
    colW = [420, 4200, 1080, 1080, 2580];
    hdrLabels = ['#', 'Bid Type', 'Crew Using', '% of Crew', 'Example Preference'];
  }
  const totalW = colW.reduce((a,b) => a+b, 0);
  const colCount = colW.length;

  const tableRows = [];

  // Header row
  tableRows.push(mkHdrRow(
    hdrLabels.map((h, i) =>
      mkCell(h, { bold:true, color:CLR.white, bg:CLR.navyBg, size:18, align:i<=1?'left':'center', width:colW[i] })
    )
  ));

  let rowNum = 0;
  for (const grp of GROUPS) {
    const types = BID_TYPES.filter(bt => bt.group === grp);
    tableRows.push(mkSectionRow(grp, colCount, totalW));

    for (const bt of types) {
      rowNum++;
      const baseCount = base.counts[bt.id];

      if (isComp) {
        const compCounts = comps.map(c => c.counts[bt.id]);
        const firstComp  = compCounts[0] ?? 0;

        let status = '✓ Both';
        let delta  = '—';

        if (!bt.meta) {
          if (baseCount === 0 && firstComp > 0) {
            status = '★ NEW';
            delta  = '+' + firstComp;
          } else if (baseCount > 0 && firstComp === 0) {
            status = '◆ Baseline Only';
            delta  = '−' + baseCount;
          } else if (baseCount > 0 && firstComp > 0) {
            const diff = firstComp - baseCount;
            const pct  = Math.round((diff / baseCount) * 100);
            delta = (diff >= 0 ? '+' : '') + diff + '  (' + (pct >= 0 ? '+' : '') + pct + '%)';
          } else {
            delta = '—';
          }
        }

        const rowBg = bt.meta ? null
          : status === '★ NEW'           ? CLR.newBg
          : status === '◆ Baseline Only' ? CLR.onlyBg
          : (baseCount === 0 && firstComp === 0) ? CLR.zeroBg
          : null;

        // Build example text
        const exParts = [];
        if (base.examples[bt.id])  exParts.push(base.examples[bt.id]);
        comps.forEach((c) => { if (c.examples[bt.id] && c.examples[bt.id] !== base.examples[bt.id]) exParts.push(c.examples[bt.id]); });
        const exText = exParts[0] ? exParts[0].slice(0, 80) + (exParts[0].length > 80 ? '…' : '') : '';

        const cells = [
          mkCell(rowNum,    { align:'center', bg:rowBg, width:colW[0], size:18 }),
          mkCell(bt.label,  { bg:rowBg, width:colW[1], size:18 }),
          mkCell(bt.meta ? '' : baseCount,  { align:'center', bg:rowBg, width:colW[2], size:18 }),
          ...compCounts.map((cc, ci) =>
            mkCell(bt.meta ? '' : cc, { align:'center', bg:rowBg, width:colW[3+ci], size:18 })
          ),
          mkCell(bt.meta ? '' : delta,  { align:'center', bg:rowBg, width:colW[3+comps.length],   size:16 }),
          mkCell(bt.meta ? '' : status, { align:'center', bg:rowBg, width:colW[4+comps.length],   size:16, bold: status !== '✓ Both' }),
          mkCell(exText, { bg:rowBg, width:colW[5+comps.length], size:15, italic:true, color:CLR.mutedText }),
        ];
        tableRows.push(mkRow(cells));

      } else {
        // Single-file table
        const count = baseCount;
        const pct   = base.totalCrew > 0 ? (count / base.totalCrew * 100).toFixed(1) + '%' : '—';
        const rowBg = count === 0 ? CLR.zeroBg : null;
        const exText = (base.examples[bt.id] || '').slice(0, 70);

        tableRows.push(mkRow([
          mkCell(rowNum,   { align:'center', bg:rowBg, width:colW[0], size:18 }),
          mkCell(bt.label, { bg:rowBg, width:colW[1], size:18 }),
          mkCell(bt.meta ? count : count,      { align:'center', bg:rowBg, width:colW[2], size:18 }),
          mkCell(bt.meta ? '' : pct,           { align:'center', bg:rowBg, width:colW[3], size:18 }),
          mkCell(exText, { bg:rowBg, width:colW[4], size:15, italic:true, color:CLR.mutedText }),
        ]));
      }
    }
  }

  const analysisTable = new D.Table({
    borders: thinBorder(),
    width: { size: totalW, type: D.WidthType.DXA },
    rows: tableRows,
  });
  bodyChildren.push(analysisTable);

  // ── Section 3: Top Used Bid Types (single file only) ────────────
  if (!isComp) {
    bodyChildren.push(new D.Paragraph({ text:'', spacing:{ after:240 } }));
    bodyChildren.push(new D.Paragraph({
      children: [new D.TextRun({ text:'3.  Top 10 Most Used Bid Types', bold:true, size:32, color:CLR.navy })],
      spacing: { before:160, after:120 },
    }));

    const top10 = BID_TYPES
      .filter(bt => !bt.meta && base.counts[bt.id] > 0)
      .sort((a, b) => base.counts[b.id] - base.counts[a.id])
      .slice(0, 10);

    const topColW = [480, 3200, 1080, 1080, 3520];
    const topW    = topColW.reduce((a,b) => a+b, 0);
    const topRows = [
      mkHdrRow(['Rank', 'Bid Type', 'Crew Count', '% of Crew', 'Group'].map((h,i) =>
        mkCell(h, { bold:true, color:CLR.white, bg:CLR.navyBg, size:20, align:i<=1?'left':'center', width:topColW[i] })
      )),
    ];
    top10.forEach((bt, idx) => {
      const count = base.counts[bt.id];
      const pct   = (count / base.totalCrew * 100).toFixed(1) + '%';
      topRows.push(mkRow([
        mkCell(idx+1,    { align:'center', width:topColW[0], size:20 }),
        mkCell(bt.label, { width:topColW[1], size:20 }),
        mkCell(count,    { align:'center', width:topColW[2], size:20 }),
        mkCell(pct,      { align:'center', width:topColW[3], size:20 }),
        mkCell(bt.group, { width:topColW[4], size:18, color:CLR.mutedText }),
      ]));
    });
    bodyChildren.push(new D.Table({ borders:thinBorder(), width:{ size:topW, type:D.WidthType.DXA }, rows:topRows }));
  }

  // ── Footer ───────────────────────────────────────────────────────
  bodyChildren.push(new D.Paragraph({ text:'', spacing:{ after:360 } }));
  bodyChildren.push(new D.Paragraph({
    children: [new D.TextRun({
      text: `ROIs Crew — Aviation Intelligence Platform  ·  ${today}  ·  Confidential`,
      size:17, color:CLR.mutedText, italics:true,
    })],
    alignment: D.AlignmentType.CENTER,
  }));

  // ── Assemble document ────────────────────────────────────────────
  const pageSize = isComp
    ? { width:15840, height:12240, orientation:D.PageOrientation.LANDSCAPE }
    : { width:12240, height:15840 };

  return new D.Document({
    sections: [{
      properties: {
        page: {
          size: pageSize,
          margin: { top:1080, right:1080, bottom:1080, left:1080 },
        },
      },
      children: bodyChildren,
    }],
  });
}

// ── Main entry point ─────────────────────────────────────────────
// Called by bids.js UI controller
window.analyseBidsFiles = async function(files, { onLog, onProgress, onDone, onError } = {}) {
  const log      = msg => onLog && onLog(msg, 'info');
  const logErr   = msg => onLog && onLog(msg, 'error');
  const progress = pct => onProgress && onProgress(pct);

  try {
    log('Reading files…');
    const texts = await Promise.all(files.map(f => f.text()));
    progress(15);

    log(`Parsing bid records from ${files.length} file(s)…`);
    const parsed = texts.map(parseBidsFile);
    progress(35);

    log('Classifying bid types…');
    const analyses  = parsed.map(analyseFile);
    const fileNames = files.map(f => f.name);
    progress(55);

    parsed.forEach((p, i) => {
      const mode = i === 0 ? 'baseline' : `compare ${i}`;
      log(`[${mode}] ${fileNames[i]}: period="${p.period}", blocks=${p.blockCount}`);
      if (p.blockCount === 0) {
        logErr(`  ↳ 0 blocks found. First lines: ${p.firstLines.map(l => '"' + l.trim().slice(0,60) + '"').join(' | ')}`);
      }
    });

    const allZero = analyses.every(a => a.totalCrew === 0);
    if (!allZero) {
      analyses.forEach((a, i) => {
        if (a.totalCrew === 0) logErr(`  ↳ ${fileNames[i]}: 0 crew after grouping — check Confirmation line format`);
      });
    }

    const active = BID_TYPES.filter(bt => !bt.meta && analyses[0].counts[bt.id] > 0).length;
    log(`Baseline active bid types: ${active}`);
    progress(70);

    log('Building Word document…');
    const doc  = await buildDocx(analyses, fileNames);
    const blob = await window.docx.Packer.toBlob(doc);
    progress(92);

    const base    = analyses[0];
    const p1      = base.period.replace(/\s+/g, '_');
    const p2      = analyses.length > 1 ? '_VS_' + analyses[1].period.replace(/\s+/g, '_') : '';
    const fname   = `PBS_BidTypeAnalysis_${p1}${p2}.docx`;

    progress(100);
    log(`Report ready → ${fname}`);

    if (onDone) onDone({ blob, fname, analyses, fileNames });

  } catch (err) {
    const msg = (err instanceof Error) ? err.message : String(err);
    logErr('Error: ' + msg);
    console.error('[bids-analysis]', err);
    if (onError) onError(err);
  }
};
