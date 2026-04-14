#!/usr/bin/env python3
"""
Import script: Dec_2025_Bids_Data.xlsx -> crew_bids INSERT SQL
Output : crew_bids_insert.sql
Errors : import_errors.log
Run    : python3 generate_crew_bids_sql.py
"""
import openpyxl, re
from pathlib import Path

BASE       = Path(__file__).parent.parent / "Design" / "New Crew BIds"
INPUT_XLSX = BASE / "Dec_2025_Bids_Data.xlsx"
OUTPUT_SQL = BASE / "crew_bids_insert.sql"
ERROR_LOG  = BASE / "import_errors.log"
PERIOD     = "Dec 2025"

# ── PROPERTY ID MAP ─────────────────────────────────────────────────────
# Matched against each "If <clause>" text. Order: most specific first.
A_E = r'(?:Any|Every)'   # "Any" or "Every" prefix

PAIRING_PROPS = [
    ( 3, re.compile(r'^Pairing Check-In Time',                  re.I)),
    (13, re.compile(r'^Pairing Check-Out Time',                 re.I)),
    (16, re.compile(r'^Pairing Length',                         re.I)),
    ( 2, re.compile(r'^Pairing Number',                         re.I)),
    (32, re.compile(r'^Departing On',                           re.I)),
    (45, re.compile(r'^' + A_E + r'\s+Duty Legs\s+Counting Deadhead', re.I)),
    ( 8, re.compile(r'^' + A_E + r'\s+Duty Legs',              re.I)),
    ( 1, re.compile(r'^' + A_E + r'\s+Landing In',             re.I)),
    (44, re.compile(r'^' + A_E + r'\s+Duty In',                re.I)),
    (19, re.compile(r'^' + A_E + r'\s+Layover In',             re.I)),
    (30, re.compile(r'^' + A_E + r'\s+Duty Duration',          re.I)),
    ( 6, re.compile(r'^TAFB',                                   re.I)),
    ( 9, re.compile(r'^Average Daily Credit',                   re.I)),
    (46, re.compile(r'^Average Credit',                         re.I)),
    ( 4, re.compile(r'^(?:Pairing\s+)?Total Credit',            re.I)),
    (31, re.compile(r'^' + A_E + r'\s+Duty On Time',           re.I)),
    (37, re.compile(r'^' + A_E + r'\s+Duty On(?:\s+Date)?',   re.I)),
    (28, re.compile(r'^Total Legs In First Duty',               re.I)),
    (42, re.compile(r'^Total Legs In Last Duty',                re.I)),
    (11, re.compile(r'^Total Legs In',                          re.I)),
    (26, re.compile(r'^' + A_E + r'\s+Flight Number',          re.I)),
    (25, re.compile(r'^' + A_E + r'\s+Leg Is Redeye',          re.I)),
    (34, re.compile(r'^Credit Per Time Away From Base',         re.I)),
    (23, re.compile(r'^' + A_E + r'\s+Enroute Check-In Time',  re.I)),
    (38, re.compile(r'^' + A_E + r'\s+Enroute Check-Out Time', re.I)),
    (22, re.compile(r'^' + A_E + r'\s+Layover Of Duration',    re.I)),
    (49, re.compile(r'^' + A_E + r'\s+Layover On(?:\s+Date)?', re.I)),  # date or DOW list
    (27, re.compile(r'^' + A_E + r'\s+Leg With Employee Number', re.I)),
    (29, re.compile(r'^Deadhead Legs',                          re.I)),
    (33, re.compile(r'^Average Daily Block Time',               re.I)),
    (36, re.compile(r'^(?:Pairing\s+)?Total Block Time',        re.I)),
    (40, re.compile(r'^Deadhead Day',                           re.I)),
    (41, re.compile(r'^' + A_E + r'\s+Sit Length',             re.I)),
]

DATE_RE = re.compile(
    r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}', re.I)

# ── HELPERS ─────────────────────────────────────────────────────────────
def sql_val(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def norm_val(v):
    v = str(v).strip()
    v = re.sub(r'\s+(legs?|days?)\s*$', '', v, flags=re.I).strip()
    return v or None

def norm_list(v):
    parts = [p.strip() for p in str(v).split(',')]
    return ','.join(p for p in parts if p) or None

# ── MODIFIER STRIPPING ──────────────────────────────────────────────────
def strip_modifiers(s):
    """Remove trailing modifiers. Returns (cleaned, limit_n, all_or_nothing)."""
    limit_n = None
    all_or_nothing = None
    s = re.sub(r'\s*Else Start Next Bid Group\s*$', '', s, flags=re.I).strip()
    m = re.search(r'\s*Limit\s+(\d+)\s*$', s, re.I)
    if m:
        limit_n = int(m.group(1))
        s = s[:m.start()].strip()
    if re.search(r'\bAll or Nothing\b', s, re.I):
        all_or_nothing = 1
        s = re.sub(r'\s*All or Nothing\s*', ' ', s, flags=re.I).strip()
    return s, limit_n, all_or_nothing

# ── OPERATOR / PARAM EXTRACTION ─────────────────────────────────────────
def extract_op_params(rem):
    """Returns (operator, param_a, param_b, param_c)."""
    s = rem.strip()
    m = re.match(r'^Between\s+(.+?)\s+And\s+(.+)$', s, re.I)
    if m:
        return 'Between', norm_val(m.group(1)), norm_val(m.group(2)), None
    m = re.match(r'^(>=|<=|>|<|=)\s+(.+)$', s)
    if m:
        return m.group(1), norm_val(m.group(2)), None, None
    if s:
        return None, norm_list(s), None, None
    return None, None, None, None

def match_pairing_prop(clause):
    """Returns (property_id, remainder) or (None, None)."""
    clause = clause.strip()
    for pid, pat in PAIRING_PROPS:
        m = pat.match(clause)
        if m:
            return pid, clause[m.end():].strip()
    return None, None

# ── PREFER OFF PARSER ───────────────────────────────────────────────────
def parse_prefer_off(s):
    """Returns (operator, param_a, param_b, param_c, minimum_n)."""
    body = re.sub(r'^Prefer Off\s*', '', s, flags=re.I).strip()
    minimum_n = None
    m = re.search(r'\s+Minimum\s+(\d+)\s*$', body, re.I)
    if m:
        minimum_n = int(m.group(1))
        body = body[:m.start()].strip()
    # time window at end
    param_b = param_c = None
    tw = re.search(r'\s+Between\s+(\d{1,3}:\d{2})\s+And\s+(\d{1,3}:\d{2})\s*$', body, re.I)
    if tw:
        param_b, param_c = tw.group(1), tw.group(2)
        body = body[:tw.start()].strip()
    # "Prefer Off Between X And Y"
    if re.match(r'^Between\b', body, re.I):
        m = re.match(r'^Between\s+(.+?)\s+And\s+(.+)$', body, re.I)
        if m:
            return 'Between', m.group(1).strip(), m.group(2).strip(), param_c, minimum_n
    # date range with dash
    dp = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}'
    dr = re.match(r'^(' + dp + r')\s*[-\u2013]\s*(' + dp + r')\s*$', body, re.I)
    if dr:
        return 'Between', dr.group(1).strip(), dr.group(2).strip(), param_c, minimum_n
    # "Friday Through Sunday"
    th = re.match(r'^(.+?)\s+Through\s+(.+)$', body, re.I)
    if th:
        return 'Between', th.group(1).strip(), th.group(2).strip(), param_c, minimum_n
    # date list
    dates = DATE_RE.findall(body)
    if dates:
        return None, ','.join(d.strip() for d in dates), param_b, param_c, minimum_n
    # DOW / keyword
    return None, norm_list(body) if body else None, param_b, param_c, minimum_n

# ── SET CONDITION PARSER ────────────────────────────────────────────────
def parse_set_condition(s):
    """Returns (property_id, operator, param_a, param_b, param_c)."""
    m = re.match(
        r'^Set Condition\s+(\d+)\s+Consecutive Days Off In A Row'
        r'(?:\s+Between\s+(.+?)\s+And\s+(.+))?$', s, re.I)
    if m:
        return 12, ('Between' if m.group(2) else None), m.group(1), m.group(2), m.group(3)
    m = re.match(r'^Set Condition Minimum Days Off In A Row\s+(\d+)$', s, re.I)
    if m:
        return 14, None, m.group(1), None, None
    m = re.match(r'^Set Condition Maximum Days Off In A Row\s+(\d+)$', s, re.I)
    if m:
        return 48, None, m.group(1), None, None
    m = re.match(r'^Set Condition Maximum Days On In A Row\s+(\d+)$', s, re.I)
    if m:
        return 15, None, m.group(1), None, None
    m = re.match(
        r'^Set Condition Pattern Between\s+(\d+)\s+and\s+(\d+)\s+Days On'
        r',?\s+with\s+(\d+)\s+Days Off', s, re.I)
    if m:  # A=min_days_off, B=min_days_on, C=max_days_on
        return 21, 'Between', m.group(3), m.group(1), m.group(2)
    m = re.match(
        r'^Set Condition Days Off Opposite Employee\s+(\d+)\s+Minimum\s+(\d+)$', s, re.I)
    if m:
        return 43, None, m.group(1), m.group(2), None
    if re.match(r'^Set Condition Minimum Credit Window$', s, re.I):
        return 18, None, None, None, None
    if re.match(r'^Set Condition Maximum Credit Window$', s, re.I):
        return 17, None, None, None, None
    m = re.match(r'^Set Condition Minimum Base Layover\s+(\S+)$', s, re.I)
    if m:
        return 39, None, m.group(1), None, None
    if re.match(r'^Set Condition No Same Day Pairings$', s, re.I):
        return 20, None, None, None, None
    m = re.match(r'^Set Condition Short Call Type\s+(\S+)$', s, re.I)
    if m:
        return 5, None, m.group(1), None, None
    return None, None, None, None, None

# ── NODE BUILDER ────────────────────────────────────────────────────────
def nd(ai, pi, op, pa, pb, pc, ni, ao, ln, aon, mn):
    return dict(action_id=ai, property_id=pi, operator=op,
                param_a=pa, param_b=pb, param_c=pc,
                node_id=ni, and_or_or=ao,
                limit_n=ln, all_or_nothing=aon, minimum_n=mn)

# ── MAIN ROW PARSER ─────────────────────────────────────────────────────
SKIP = {'Pairing Bid Group', 'Reserve Bid Group'}

def parse_row(raw):
    """Returns list of node dicts (empty = skip row), or None on error."""
    s, ln, aon = strip_modifiers(raw)
    if s in SKIP:
        return []
    if re.match(r'^Clear Schedule and Start Next Bid Group$', s, re.I):
        return [nd(None, 10, None, None, None, None, 1, None, ln, aon, None)]
    m = re.match(r'^Forget Line\s+(\d+)$', s, re.I)
    if m:
        return [nd(None, 35, None, m.group(1), None, None, 1, None, ln, aon, None)]
    if re.match(r'^Waive No Same Day Duty Starts$', s, re.I):
        return [nd(None, 24, None, None, None, None, 1, None, ln, aon, None)]
    if re.match(r'^Prefer Off\b', s, re.I):
        op, pa, pb, pc, mn = parse_prefer_off(s)
        return [nd(None, 7, op, pa, pb, pc, 1, None, ln, aon, mn)]
    m = re.match(r'^Award Reserve Day On\s+(.+)$', s, re.I)
    if m:
        dates = DATE_RE.findall(m.group(1))
        pa = ','.join(d.strip() for d in dates) if dates else norm_list(m.group(1))
        return [nd(None, 47, None, pa, None, None, 1, None, ln, aon, None)]
    if re.match(r'^Set Condition\b', s, re.I):
        pid, op, pa, pb, pc = parse_set_condition(s)
        if pid:
            return [nd(None, pid, op, pa, pb, pc, 1, None, ln, aon, None)]
        return None
    ma = re.match(r'^Award Pairings\s+If\s+', s, re.I)
    mv = re.match(r'^Avoid Pairings\s+If\s+', s, re.I)
    if ma or mv:
        ai   = 1 if ma else 2
        rest = s[(ma or mv).end():]
        clauses = re.split(r'\s+If\s+', rest, flags=re.I)
        nodes = []
        for i, clause in enumerate(clauses):
            clause = clause.strip()
            if not clause:
                continue
            if re.match(r'^Followed By Pairings', clause, re.I):
                break   # MVP: skip sequence rules
            pid, rem = match_pairing_prop(clause)
            if pid is None:
                return None
            op, pa, pb, pc = extract_op_params(rem)
            nodes.append(nd(
                ai if i == 0 else None, pid, op, pa, pb, pc,
                i + 1, None if i == 0 else 'AND',
                ln if i == 0 else None,
                aon if i == 0 else None,
                None))
        return nodes if nodes else None
    return None

# ── GENERATE SQL ────────────────────────────────────────────────────────
def main():
    wb = openpyxl.load_workbook(INPUT_XLSX, read_only=True, data_only=True)
    ws = wb["Dec 2025 Bids"]

    value_rows = []
    errors     = []
    group_id   = 0
    src_data   = 0   # source data rows (non-header, non-blank)

    for row in ws.iter_rows(min_row=3, values_only=True):
        bid_str = row[5]
        if not bid_str:
            continue
        bid_str = str(bid_str).strip()
        if not bid_str:
            continue
        if bid_str in SKIP:
            continue

        src_data += 1
        crew_id = str(row[1]).strip()
        bid_ctx = str(row[2]).strip()
        layer   = int(row[3])

        nodes = parse_row(bid_str)

        if nodes is None:
            errors.append(
                f"crew={crew_id:>6}  ctx={bid_ctx:<8}  layer={layer}  |  {bid_str}")
            continue

        if not nodes:
            continue

        group_id += 1
        for n in nodes:
            value_rows.append(
                f"  ({crew_id},{sql_val(bid_ctx)},{sql_val(PERIOD)},{layer},"
                f"{group_id},{n['node_id']},{sql_val(n['and_or_or'])},"
                f"{'NULL' if n['action_id'] is None else n['action_id']},"
                f"{n['property_id']},{sql_val(n['operator'])},"
                f"{sql_val(n['param_a'])},{sql_val(n['param_b'])},{sql_val(n['param_c'])},"
                f"{'NULL' if n['limit_n'] is None else n['limit_n']},"
                f"{'NULL' if n['all_or_nothing'] is None else n['all_or_nothing']},"
                f"{'NULL' if n['minimum_n'] is None else n['minimum_n']})"
            )

    # ── write SQL ──────────────────────────────────────────────────────
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
        f.write("-- crew_bids INSERT data\n")
        f.write(f"-- Source    : Dec_2025_Bids_Data.xlsx\n")
        f.write(f"-- Period    : {PERIOD}\n")
        f.write(f"-- Generated : 2026-03-10\n")
        f.write(f"-- Rows      : {len(value_rows)}\n")
        f.write(f"-- Groups    : {group_id}\n")
        f.write(f"-- Errors    : {len(errors)}\n\n")
        f.write("INSERT INTO crew_bids\n")
        f.write("  (crew_id, bid_context, period, layer,\n")
        f.write("   property_group_id, node_id, and_or_or,\n")
        f.write("   action_id, property_id, operator,\n")
        f.write("   param_a, param_b, param_c,\n")
        f.write("   limit_n, all_or_nothing, minimum_n)\n")
        f.write("VALUES\n")
        f.write(',\n'.join(value_rows))
        f.write(';\n')

    # ── write error log ────────────────────────────────────────────────
    with open(ERROR_LOG, 'w', encoding='utf-8') as f:
        f.write(f"Source data rows : {src_data}\n")
        f.write(f"Inserted rows    : {len(value_rows)}\n")
        f.write(f"Groups           : {group_id}\n")
        f.write(f"Unmatched rows   : {len(errors)}\n")
        f.write(f"Match rate       : {100*(src_data-len(errors))/src_data:.1f}%\n")
        f.write("\n-- UNMATCHED ROWS --\n")
        f.write('\n'.join(errors))

    print(f"Source rows  : {src_data}")
    print(f"INSERT rows  : {len(value_rows)}")
    print(f"Groups       : {group_id}")
    print(f"Errors       : {len(errors)}")
    print(f"Match rate   : {100*(src_data-len(errors))/src_data:.1f}%")
    print(f"SQL  -> {OUTPUT_SQL}")
    print(f"Log  -> {ERROR_LOG}")

if __name__ == '__main__':
    main()
