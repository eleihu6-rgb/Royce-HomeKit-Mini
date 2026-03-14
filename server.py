#!/usr/bin/env python3
"""
NAVOPS — PDF Roster Parser Backend
Run: python3 server.py
Serves the HTML on :8080 and the parse API on POST /api/convert
"""
import http.server, json, os, re, io, traceback, subprocess, threading, uuid, time
import concurrent.futures
from collections import defaultdict
from urllib.parse import urlparse, parse_qs

ANALYSE_WORKERS = 4
TABLE_LIMIT     = 50

# ─── Background job store ───────────────────────────────────────────────────────
_jobs = {}   # job_id -> {'status': 'running'|'done'|'error', 'tables': [], 'progress': N, 'error': str}

SQL_DATA_DIR   = '/home/eleihu6/rois_tg_live_load'
MYSQL_CMD      = ['mysql', '-u', 'debian-sys-maint', '-pR2QY1jwpPm0Vxoyf', 'rois_tg_live_prod']
WHITELIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'table_whitelist.md')

try:
    import pdfplumber
except ImportError:
    raise SystemExit("pdfplumber not installed. Run: pip3 install pdfplumber --break-system-packages")

# ─── Parser ───────────────────────────────────────────────────────────────────
DUTY_PATTERN = re.compile(
    r'FLYXX|FLY|SIM|VGDO|TGDO|LEAVE|UNION|WILD|COD|PRPM|PRAM|CRM|CBT|TGS|SCM|V\d{4}|GT|ST|IB|NB|VAC'
)
TIME_RE = re.compile(r'^\d{1,2}:\d{2}$')

def split_codes(text):
    parts = DUTY_PATTERN.findall(text)
    return parts if parts else [text]

def build_col_map(words):
    col = {}
    for w in words:
        if re.fullmatch(r'\d{1,2}', w['text']) and 100 <= w['top'] <= 115:
            d = int(w['text'])
            if 1 <= d <= 31:
                col[d] = (w['x0'] + w['x1']) / 2
        if w['text'] == 'C/IN'  and 95 <= w['top'] <= 115: col['CIN']  = (w['x0']+w['x1'])/2
        if w['text'] == 'C/Out' and 95 <= w['top'] <= 115: col['COUT'] = (w['x0']+w['x1'])/2
    return col

def sorted_int_cols(col_map):
    return sorted(k for k in col_map if isinstance(k, int))

def nearest_col(x, col_map, tol=18):
    best, dist = None, 1e9
    for k, cx in col_map.items():
        d = abs(x - cx)
        if d < dist: dist, best = d, k
    return best if dist < tol else None

def col_dict_split(row_words, col_map):
    """Assign duty codes to columns, splitting merged strings (e.g. UNIONUNIONV4011)."""
    result = {}
    scols = sorted_int_cols(col_map)
    for w in row_words:
        cx    = (w['x0'] + w['x1']) / 2
        parts = split_codes(w['text'])
        if len(parts) == 1:
            c = nearest_col(cx, col_map)
            if c is not None:
                result[c] = result.get(c, '') + parts[0]
        else:
            # Multi-part: assign consecutive columns starting from left edge
            start = nearest_col(w['x0'] + 2, col_map)
            if start is None or start not in scols:
                start = nearest_col(cx, col_map)
            if start in scols:
                idx = scols.index(start)
                for p in parts:
                    if idx < len(scols):
                        result[scols[idx]] = p
                        idx += 1
            elif start == 'CIN':
                result['CIN'] = parts[0]
                idx = 0
                for p in parts[1:]:
                    if idx < len(scols):
                        result[scols[idx]] = p
                        idx += 1
    return result

def time_col_dict(row_words, col_map):
    """Like plain_col_dict but only accepts HH:MM time strings — filters header/footer noise."""
    d = {}
    for w in row_words:
        if not TIME_RE.match(w['text']): continue
        c = nearest_col((w['x0']+w['x1'])/2, col_map)
        if c is not None:
            d[c] = d.get(c, '') + w['text']
    return d

def plain_col_dict(row_words, col_map):
    d = {}
    for w in row_words:
        c = nearest_col((w['x0']+w['x1'])/2, col_map)
        if c is not None:
            d[c] = d.get(c, '') + w['text']
    return d

def infer_period(words):
    """Extract year and month from 'Period: May 2025' header."""
    MONTHS = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
              'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
    texts = [w['text'].lower() for w in words if w['top'] < 80]
    for i, t in enumerate(texts):
        if t in MONTHS and i+1 < len(texts) and texts[i+1].isdigit():
            return int(texts[i+1]), MONTHS[t]
    return 2025, 5  # fallback

def infer_category(words):
    """Extract base and rank from 'Category: YVR-737-CA' header (e.g. base='YVR', rank='CA')."""
    header = [w for w in words if w['top'] < 80]
    for i, w in enumerate(header):
        if w['text'] == 'Category:' and i + 1 < len(header):
            parts = header[i + 1]['text'].split('-')
            base = parts[0] if parts else ''
            rank = parts[-1] if len(parts) > 1 else ''
            return base, rank
    return '', ''

def parse_pdf_bytes(pdf_bytes):
    """Parse a PDF (as bytes) and return list of duty dicts."""
    duties = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pg_idx, page in enumerate(pdf.pages):
            words = page.extract_words(x_tolerance=2, y_tolerance=2)
            col_map = build_col_map(words)

            if pg_idx == 0:
                year, month = infer_period(words)
                crew_base, crew_rank = infer_category(words)

            rows_by_top = defaultdict(list)
            for w in words:
                rows_by_top[round(w['top'])].append(w)

            crew_starts = []
            for top in sorted(rows_by_top.keys()):
                rw   = sorted(rows_by_top[top], key=lambda w: w['x0'])
                left = [w for w in rw if w['x0'] < 90]
                lt   = [w['text'] for w in left]
                if (len(lt) >= 3 and re.fullmatch(r'\d+', lt[0])
                        and lt[1] == '/' and re.fullmatch(r'\d+', lt[2])):
                    crew_starts.append(top)

            for ci, block_top in enumerate(crew_starts):
                block_end = crew_starts[ci+1]-1 if ci+1 < len(crew_starts) else int(page.height)
                bw = [w for w in words if block_top-8 <= w['top'] <= block_end]

                id_row = sorted([w for w in bw if abs(w['top']-block_top) <= 1 and w['x0'] < 90],
                                key=lambda w: w['x0'])
                it = [w['text'] for w in id_row]
                try:
                    si = it.index('/'); seniority = it[si-1]; crew_id = it[si+1]
                except:
                    continue

                def left_word(offset, tol=2):
                    ws = [w for w in bw if abs(w['top']-block_top-offset) <= tol and w['x0'] < 90]
                    return ws[0]['text'] if ws else ''

                def left_last(offset, tol=2):
                    ws = sorted([w for w in bw if abs(w['top']-block_top-offset) <= tol and w['x0'] < 90],
                                key=lambda w: w['x0'])
                    return ws[-1]['text'] if ws else ''

                name     = left_word(6)
                rp_cr    = left_word(12).replace('Cr:', '')

                # Keyword-based: find "Days Off: <N>" regardless of vertical position
                left_seq = sorted([w for w in bw if w['x0'] < 90], key=lambda w: (w['top'], w['x0']))
                days_off = ''
                for i, w in enumerate(left_seq):
                    if w['text'] == 'Off:' and i + 1 < len(left_seq):
                        days_off = left_seq[i + 1]['text']
                        break

                def get_row(offset, tol=1.5):
                    return [w for w in bw if abs(w['top']-block_top-offset) <= tol and w['x0'] > 90]

                cin_map    = plain_col_dict(get_row(1),      col_map)
                cout_map   = plain_col_dict(get_row(7),      col_map)
                code_map   = col_dict_split(get_row(19, 2),  col_map)
                crhour_map = col_dict_split(get_row(13, 2),  col_map)
                rank_map   = plain_col_dict(get_row(25, 2),  col_map)

                # ── Carry-over from previous month ──
                carry_time = cin_map.get('CIN', '')
                carry_code = code_map.get('CIN', '')
                if re.match(r'\d{1,2}:\d{2}', carry_time) and carry_code:
                    cout_label = cout_map.get('CIN', '')
                    m = re.match(r'([A-Za-z]+)(\d+)', cout_label)
                    prev_day  = int(m.group(2)) if m else 30
                    prev_month = month - 1 if month > 1 else 12
                    prev_year  = year if month > 1 else year - 1
                    end_time   = cout_map.get(1, '')
                    duties.append({
                        'crewId': crew_id, 'seniority': seniority, 'name': name,
                        'crew_base': crew_base, 'crew_rank': crew_rank,
                        'credit': rp_cr, 'daysOff': days_off,
                        'date': f'{prev_year}-{prev_month:02d}-{prev_day:02d}',
                        'startDate': f'{prev_year}-{prev_month:02d}-{prev_day:02d} {carry_time}',
                        'endDate': (f'{year}-{month:02d}-01 {end_time}' if end_time
                                    else f'{prev_year}-{prev_month:02d}-{prev_day:02d}'),
                        'assignment': carry_code,
                        'creditHours': crhour_map.get('CIN', ''),
                        'pairingLabel': carry_code,
                        'actingRank': rank_map.get('CIN', ''),
                    })

                # ── Normal days 1-31 ──
                all_days = set()
                for k in list(code_map.keys()) + list(cin_map.keys()):
                    if isinstance(k, int):
                        all_days.add(k)

                for day in sorted(all_days):
                    code   = code_map.get(day, '')
                    c_in   = cin_map.get(day, '')
                    c_out  = cout_map.get(day, '')
                    crhour   = crhour_map.get(day, '')
                    act_rank = rank_map.get(day, '')
                    if not code and not c_in:
                        continue
                    date_str = f'{year}-{month:02d}-{day:02d}'
                    # Overnight duty: end time spills into next day's C/OUT column
                    if not c_out and day + 1 not in all_days and cout_map.get(day + 1):
                        next_cout = cout_map[day + 1]
                        if day < 31:
                            end_str = f'{year}-{month:02d}-{day+1:02d} {next_cout}'
                        else:
                            nm = month % 12 + 1
                            ny = year + (1 if month == 12 else 0)
                            end_str = f'{ny}-{nm:02d}-01 {next_cout}'
                    else:
                        end_str = f'{date_str} {c_out}' if c_out else date_str
                    duties.append({
                        'crewId': crew_id, 'seniority': seniority, 'name': name,
                        'crew_base': crew_base, 'crew_rank': crew_rank,
                        'credit': rp_cr, 'daysOff': days_off,
                        'date': date_str,
                        'startDate': f'{date_str} {c_in}' if c_in else date_str,
                        'endDate':   end_str,
                        'assignment': code if code else 'UNKNOWN',
                        'creditHours': crhour,
                        'pairingLabel': code if code else '',
                        'actingRank': act_rank,
                    })

                # ── Additional sub-blocks: same-day multi-duties ──
                # Navtech stacks extra 42pt sub-blocks (C/IN at +43, +85, +127 ...)
                # for each additional duty on the same day. Loop until no data found.
                # time_col_dict filters out column-header repeat / footer noise.
                sub_n = 2
                while sub_n <= 10:  # safety cap
                    blk_off = 42 * (sub_n - 1)
                    if block_end < block_top + blk_off + 20:
                        break
                    cin_n    = time_col_dict(get_row(blk_off + 1,  2), col_map)
                    cout_n   = time_col_dict(get_row(blk_off + 7,  2), col_map)
                    crhour_n = col_dict_split(get_row(blk_off + 13, 2), col_map)
                    code_n   = col_dict_split(get_row(blk_off + 19, 2), col_map)

                    all_days_n = set(k for k in list(code_n.keys()) + list(cin_n.keys())
                                     if isinstance(k, int))
                    if not all_days_n:
                        break

                    for day in sorted(all_days_n):
                        cn_code  = code_n.get(day, '')
                        cn_cin   = cin_n.get(day, '')
                        cn_cout  = cout_n.get(day, '')
                        cn_cr    = crhour_n.get(day, '')
                        if not cn_code and not cn_cin:
                            continue
                        date_str = f'{year}-{month:02d}-{day:02d}'
                        duties.append({
                            'crewId': crew_id, 'seniority': seniority, 'name': name,
                            'crew_base': crew_base, 'crew_rank': crew_rank,
                            'credit': rp_cr, 'daysOff': days_off,
                            'date': date_str,
                            'startDate': f'{date_str} {cn_cin}'  if cn_cin  else date_str,
                            'endDate':   f'{date_str} {cn_cout}' if cn_cout else date_str,
                            'assignment': cn_code if cn_code else 'UNKNOWN',
                            'creditHours': cn_cr,
                            'pairingLabel': cn_code if cn_code else '',
                            'actingRank': '',
                        })
                    sub_n += 1

    # Sort by seniority → date
    duties.sort(key=lambda d: (int(d['seniority']), d['date']))
    return duties


# ─── HTTP Handler ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class ThreadingHTTPServer(http.server.ThreadingHTTPServer):
    pass

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f'  {self.address_string()} {fmt % args}')

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/sql-files':
            self.handle_sql_files()
            return
        if path == '/api/whitelist':
            self.handle_whitelist()
            return
        if path == '/api/analyse-status':
            self.handle_analyse_status()
            return
        if path in ('/', '/index.html'):
            path = '/ROIs_Crew_platform.html'
        filepath = os.path.join(BASE_DIR, path.lstrip('/'))
        if os.path.isfile(filepath):
            self.serve_file(filepath)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/api/convert':
            self.handle_convert()
        elif self.path == '/api/analyse-sql':
            self.handle_analyse_sql()
        elif self.path == '/api/load-sql':
            self.handle_load_sql()
        elif self.path == '/api/whitelist-toggle':
            self.handle_whitelist_toggle()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def handle_convert(self):
        try:
            content_type = self.headers.get('Content-Type', '')
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)

            all_duties = []
            crews_seen = set()

            # Multipart form: multiple PDF files
            if 'multipart/form-data' in content_type:
                boundary = content_type.split('boundary=')[-1].encode()
                parts = body.split(b'--' + boundary)
                for part in parts:
                    if b'filename=' not in part: continue
                    # Extract binary content after double CRLF
                    header_end = part.find(b'\r\n\r\n')
                    if header_end == -1: continue
                    pdf_data = part[header_end+4:].rstrip(b'\r\n--')
                    if len(pdf_data) < 100: continue
                    duties = parse_pdf_bytes(pdf_data)
                    all_duties.extend(duties)
                    for d in duties:
                        crews_seen.add(d['crewId'])
            else:
                # Raw binary body
                duties = parse_pdf_bytes(body)
                all_duties.extend(duties)
                for d in duties: crews_seen.add(d['crewId'])

            # De-duplicate (same crew+date+assignment across files)
            seen_keys = set()
            deduped   = []
            for d in all_duties:
                k = (d['crewId'], d['date'], d['assignment'])
                if k not in seen_keys:
                    seen_keys.add(k)
                    deduped.append(d)

            deduped.sort(key=lambda d: (int(d['seniority']), d['date']))

            result = {
                'duties': deduped,
                'totalDuties': len(deduped),
                'totalCrews': len(set(d['crewId'] for d in deduped)),
            }

            payload = json.dumps(result).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)

        except Exception as e:
            err = json.dumps({'error': str(e), 'trace': traceback.format_exc()}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_whitelist(self):
        try:
            tables = []
            if os.path.isfile(WHITELIST_PATH):
                with open(WHITELIST_PATH, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            if ':' in line:
                                name, flag = line.rsplit(':', 1)
                                load_data = flag.upper() == 'Y'
                            else:
                                name, load_data = line, False
                            tables.append({'name': name, 'load_data': load_data})
            payload = json.dumps({'tables': tables, 'count': len(tables)}).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_whitelist_toggle(self):
        """Toggle the load_data flag (Y/N) for a table in table_whitelist.md."""
        try:
            length  = int(self.headers.get('Content-Length', 0))
            body    = json.loads(self.rfile.read(length))
            table   = body.get('table', '').strip()
            enabled = bool(body.get('load_data', False))
            if not table:
                raise ValueError('table name required')

            lines = []
            if os.path.isfile(WHITELIST_PATH):
                with open(WHITELIST_PATH, 'r') as f:
                    lines = f.readlines()

            new_lines = []
            found = False
            for line in lines:
                stripped = line.rstrip('\n')
                if stripped.startswith('#') or not stripped.strip():
                    new_lines.append(line)
                    continue
                if ':' in stripped:
                    name = stripped.rsplit(':', 1)[0]
                else:
                    name = stripped
                if name == table:
                    new_lines.append(f'{name}:{"Y" if enabled else "N"}\n')
                    found = True
                else:
                    new_lines.append(line)

            if not found:
                new_lines.append(f'{table}:{"Y" if enabled else "N"}\n')

            with open(WHITELIST_PATH, 'w') as f:
                f.writelines(new_lines)

            payload = json.dumps({'ok': True, 'table': table, 'load_data': enabled}).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_sql_files(self):
        try:
            files = []
            for root, dirs, fnames in os.walk(SQL_DATA_DIR):
                dirs.sort()
                for fname in sorted(fnames):
                    full = os.path.join(root, fname)
                    rel  = os.path.relpath(full, SQL_DATA_DIR)
                    files.append({
                        'name':     fname,
                        'rel_path': rel,
                        'size':     os.path.getsize(full),
                    })
            payload = json.dumps({'files': files}).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_analyse_sql(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            rel    = body.get('file', '')
            full   = os.path.realpath(os.path.join(SQL_DATA_DIR, rel))
            if not full.startswith(os.path.realpath(SQL_DATA_DIR) + os.sep):
                raise ValueError('Path traversal not allowed')
            if not full.endswith('.sql'):
                raise ValueError('Only .sql files are allowed')

            job_id = str(uuid.uuid4())[:8]
            _jobs[job_id] = {
                'status': 'running', 'phase': 'scanning',
                'tables': [], 'progress': 0, 'total': 0,
                'workers': ANALYSE_WORKERS, 'limit': TABLE_LIMIT, 'error': '',
                'worker_status': [{'id': i+1, 'state': 'STANDBY', 'table': ''} for i in range(ANALYSE_WORKERS)]
            }

            def _count_rows(file_path, start_off, end_off):
                count = 0
                try:
                    with open(file_path, 'rb') as fh:
                        fh.seek(start_off)
                        while True:
                            if fh.tell() >= end_off:
                                break
                            line = fh.readline()
                            if not line:
                                break
                            if line.startswith(b'INSERT INTO'):
                                count += 1
                except Exception:
                    pass
                return count

            def run():
                try:
                    whitelist = {}  # name -> load_data bool
                    if os.path.isfile(WHITELIST_PATH):
                        with open(WHITELIST_PATH) as f:
                            for line in f:
                                line = line.strip()
                                if line and not line.startswith('#'):
                                    if ':' in line:
                                        name, flag = line.rsplit(':', 1)
                                        whitelist[name] = flag.upper() == 'Y'
                                    else:
                                        whitelist[line] = False

                    # Phase 1: locate all table byte-offsets with grep -b (single fast pass)
                    _jobs[job_id]['phase'] = 'scanning'
                    for w in _jobs[job_id]['worker_status']:
                        w['state'] = 'AWAITING OFFSETS'
                    gp = subprocess.run(
                        ['grep', '-b', '^-- Table structure for ', full],
                        capture_output=True, text=True, timeout=600
                    )
                    entries = []
                    for line in gp.stdout.splitlines():
                        try:
                            colon  = line.index(':')
                            offset = int(line[:colon])
                            name   = line[colon+1:].replace('-- Table structure for ', '').strip()
                            entries.append((offset, name))
                        except Exception:
                            pass

                    # Filter to only tables in whitelist with load_data=True, then cap
                    entries = [(off, name) for off, name in entries if whitelist.get(name) is True]
                    entries = entries[:TABLE_LIMIT]
                    file_size = os.path.getsize(full)
                    _jobs[job_id]['total'] = len(entries)
                    _jobs[job_id]['phase'] = 'counting'

                    # Immediately publish all table names with sql_rows=None (pending)
                    init_tables = [
                        {'name': name, 'sql_rows': None, 'in_whitelist': name in whitelist,
                         'load_data': whitelist.get(name, False)}
                        for _, name in entries
                    ]
                    _jobs[job_id]['tables'] = init_tables

                    # Phase 2: parallel row count — workers update counts in-place as they finish
                    tasks = []
                    for i, (offset, name) in enumerate(entries):
                        end_off = entries[i+1][0] if i+1 < len(entries) else file_size
                        tasks.append((full, offset, end_off, name, i))

                    lock = threading.Lock()
                    # Map thread ident → worker slot (0-based)
                    thread_slot = {}
                    slot_counter = [0]

                    for w in _jobs[job_id]['worker_status']:
                        w['state'] = 'IDLE'
                        w['table'] = ''

                    def worker(task):
                        file_path, start_off, end_off, name, idx = task
                        tid = threading.current_thread().ident

                        # Assign a stable worker slot to this thread
                        with lock:
                            if tid not in thread_slot:
                                thread_slot[tid] = slot_counter[0] % ANALYSE_WORKERS
                                slot_counter[0] += 1
                            slot = thread_slot[tid]
                            ws = _jobs[job_id]['worker_status'][slot]
                            ws['state'] = 'COUNTING'
                            ws['table'] = name

                        count = _count_rows(file_path, start_off, end_off)

                        with lock:
                            _jobs[job_id]['worker_status'][slot]['state'] = 'DONE'
                            _jobs[job_id]['worker_status'][slot]['table'] = name
                            _jobs[job_id]['tables'][idx]['sql_rows'] = count
                            _jobs[job_id]['progress'] = sum(
                                1 for t in _jobs[job_id]['tables'] if t['sql_rows'] is not None
                            )

                    with concurrent.futures.ThreadPoolExecutor(max_workers=ANALYSE_WORKERS) as ex:
                        list(ex.map(worker, tasks))

                    for w in _jobs[job_id]['worker_status']:
                        w['state'] = 'DONE'

                    _jobs[job_id]['progress'] = len(entries)
                    _jobs[job_id]['status']   = 'done'

                except Exception as ex:
                    _jobs[job_id]['status'] = 'error'
                    _jobs[job_id]['error']  = str(ex)

            threading.Thread(target=run, daemon=True).start()

            payload = json.dumps({'job_id': job_id}).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e), 'trace': traceback.format_exc()}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_analyse_status(self):
        try:
            qs     = parse_qs(urlparse(self.path).query)
            job_id = qs.get('job', [''])[0]
            job    = _jobs.get(job_id)
            if not job:
                raise ValueError(f'Unknown job: {job_id}')
            payload = json.dumps(job).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def handle_load_sql(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            rel    = body.get('file', '')
            full   = os.path.realpath(os.path.join(SQL_DATA_DIR, rel))
            if not full.startswith(os.path.realpath(SQL_DATA_DIR) + os.sep):
                raise ValueError('Path traversal not allowed')
            if not full.endswith('.sql'):
                raise ValueError('Only .sql files are allowed')

            split_script  = os.path.join(BASE_DIR, 'split_sql.py')
            import_script = os.path.join(SQL_DATA_DIR, 'run_import.sh')
            tables_dir    = os.path.join(SQL_DATA_DIR, 'tables')

            # Step 1: split in background
            subprocess.Popen(
                ['bash', '-c',
                 f'python3 {split_script} {full} --out-dir {tables_dir} --quiet'
                 f' && bash {import_script}'
                 f' >> /tmp/royce-loadsql.log 2>&1'],
                close_fds=True
            )
            result = type('R', (), {'returncode': 0, 'stdout': 'Split + import started in background. Check /tmp/royce-loadsql.log', 'stderr': ''})()
            payload = json.dumps({
                'exit_code': result.returncode,
                'stdout':    result.stdout,
                'stderr':    result.stderr,
            }).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(payload))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            err = json.dumps({'error': str(e), 'trace': traceback.format_exc()}).encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(err))
            self.end_headers()
            self.wfile.write(err)

    def serve_file(self, path):
        ext = os.path.splitext(path)[1].lower()
        mime = {'.html':'text/html','.js':'application/javascript',
                '.css':'text/css','.json':'application/json',
                '.svg':'image/svg+xml','.png':'image/png',
                '.jpg':'image/jpeg','.jpeg':'image/jpeg'}.get(ext,'application/octet-stream')
        with open(path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    PORT = 8088
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'NAVOPS backend running → http://localhost:{PORT}/')
    print(f'API endpoint: POST http://localhost:{PORT}/api/convert')
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
