#!/usr/bin/env python3
"""
Reload missing/empty tables from the original SQL dump into MySQL.

Strategy:
1. Build list of target tables: tables not in MySQL + tables with 0 rows in MySQL
   (excluding intentionally excluded tables)
2. Make ONE streaming pass through the 17GB SQL file
3. For each target table found: batch INSERTs and pipe directly to MySQL
4. Generate a final comparison report

Usage: python3 reload_missing.py [--dry-run] [--report-only]
"""

import subprocess
import sys
import re
import os
import time
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
SQL_FILE    = os.path.expanduser("~/rois_tg_live_load/rois_tg_live_prod.sql")
REPO_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDED    = os.path.join(REPO_DIR, "scripts/excluded_tables.txt")
DB          = "rois_tg_live_prod"
MYSQL_USER  = "root"
MYSQL_PASS  = "R@iscrew2026"
BATCH_SIZE  = 5000          # rows per INSERT batch
LOG_FILE    = os.path.join(REPO_DIR, "logs_data/reload_missing.log")
REPORT_FILE = os.path.join(REPO_DIR, "logs_data/COMPARISON_REPORT.txt")
DRY_RUN     = "--dry-run"    in sys.argv
REPORT_ONLY = "--report-only" in sys.argv

# --table <name>  →  force-load exactly one table regardless of its current state
_table_arg = next((sys.argv[i+1] for i, a in enumerate(sys.argv) if a == "--table" and i+1 < len(sys.argv)), None)
FORCE_TABLE = _table_arg

def mysql_cmd():
    return ["mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASS}", DB]

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def get_excluded_tables():
    excluded = set()
    if os.path.exists(EXCLUDED):
        with open(EXCLUDED) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    excluded.add(line)
    return excluded

def get_mysql_tables_with_counts():
    """Returns dict: table_name -> exact_row_count (via COUNT(*))"""
    # First get list of all tables
    result = subprocess.run(
        mysql_cmd() + ["-sNe",
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=%s ORDER BY table_name;", DB],
        capture_output=True, text=True
    )
    # Fix: pass DB as argument properly
    result = subprocess.run(
        ["mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASS}", "-sNe",
         f"SELECT table_name FROM information_schema.tables WHERE table_schema='{DB}' ORDER BY table_name;"],
        capture_output=True, text=True
    )
    tables = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]

    # Get zero-row tables via information_schema estimate (fast)
    result2 = subprocess.run(
        ["mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASS}", "-sNe",
         f"SELECT table_name FROM information_schema.tables "
         f"WHERE table_schema='{DB}' AND table_rows=0 ORDER BY table_name;"],
        capture_output=True, text=True
    )
    zero_est = set(t.strip() for t in result2.stdout.strip().split("\n") if t.strip())

    return set(tables), zero_est

def exact_count(table):
    result = subprocess.run(
        ["mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASS}", DB, "-sNe",
         f"SELECT COUNT(*) FROM `{table}`;"],
        capture_output=True, text=True
    )
    try:
        return int(result.stdout.strip())
    except:
        return -1

def get_sql_tables():
    """Get all table names from SQL file (fast grep pass)."""
    result = subprocess.run(
        ["grep", "-a", "^-- Table structure for ", SQL_FILE],
        capture_output=True, text=True
    )
    tables = []
    for line in result.stdout.strip().split("\n"):
        line = line.strip().rstrip("\r")
        tbl = line.replace("-- Table structure for ", "").strip()
        if tbl:
            tables.append(tbl)
    return tables

def load_table_sql(table_name, sql_lines, is_new_table):
    """
    Batch INSERTs and pipe to MySQL.
    Handles Navicat format: one INSERT INTO `t` VALUES (...); per line.
    sql_lines: list of lines for this table (DDL + data)
    is_new_table: if True, include full DDL; if False, only INSERT data (TRUNCATE first)
    Returns: (sql_row_count, db_row_count, error_msg)
    """
    # Parse: collect DDL lines and data rows separately
    # Pattern: INSERT INTO `table` VALUES (row_data);
    INSERT_RE = re.compile(r'^INSERT INTO `[^`]+` VALUES (.+);?\s*$', re.DOTALL)

    ddl_lines = []
    data_rows = []   # list of "(val,...)" strings

    for line in sql_lines:
        stripped = line.rstrip("\r\n")
        m = INSERT_RE.match(stripped)
        if m:
            row = m.group(1).rstrip(";").strip()
            if row:
                data_rows.append(row)
        elif not data_rows:  # DDL lines come before any INSERT
            ddl_lines.append(stripped)

    sql_row_count = len(data_rows)

    if DRY_RUN:
        log(f"  [DRY-RUN] {table_name}: {sql_row_count} rows would be loaded")
        return sql_row_count, 0, None

    # Build the SQL to send to mysql
    out_lines = []
    out_lines.append("SET NAMES utf8mb4;")
    out_lines.append("SET FOREIGN_KEY_CHECKS = 0;")
    out_lines.append("SET UNIQUE_CHECKS = 0;")

    # Always use DROP+CREATE from SQL dump DDL to ensure schema matches data
    # (catches cases where MySQL schema is older than the dump)
    out_lines.extend(ddl_lines)

    # Emit batched INSERT statements
    insert_prefix = f"INSERT INTO `{table_name}` VALUES"
    for i in range(0, len(data_rows), BATCH_SIZE):
        batch = data_rows[i:i + BATCH_SIZE]
        out_lines.append(insert_prefix + " " + ",\n".join(batch) + ";")

    out_lines.append("SET FOREIGN_KEY_CHECKS = 1;")
    out_lines.append("SET UNIQUE_CHECKS = 1;")

    sql_input = "\n".join(out_lines) + "\n"

    proc = subprocess.run(
        ["mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASS}", DB],
        input=sql_input, capture_output=True, text=True
    )

    if proc.returncode != 0:
        err = (proc.stderr or "").strip().replace("\n", " ")[:200]
        return sql_row_count, -1, err

    db_count = exact_count(table_name)
    return sql_row_count, db_count, None


def generate_report(results):
    """Generate comparison report."""
    lines = []
    lines.append("=" * 70)
    lines.append("  MySQL Load Comparison Report")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 70)
    lines.append("")

    ok = [(t, sq, db) for t, sq, db, e in results if e is None and sq == db]
    mismatch = [(t, sq, db, e) for t, sq, db, e in results if e is None and sq != db]
    errors = [(t, sq, db, e) for t, sq, db, e in results if e is not None]

    lines.append(f"SUMMARY: {len(ok)} OK | {len(mismatch)} mismatch | {len(errors)} errors")
    lines.append("")

    if mismatch:
        lines.append("── MISMATCHES (sql_rows != db_rows) ──")
        for t, sq, db, _ in sorted(mismatch):
            lines.append(f"  {t:<50} sql={sq:>10}  db={db:>10}")
        lines.append("")

    if errors:
        lines.append("── ERRORS ──")
        for t, sq, db, e in sorted(errors):
            lines.append(f"  {t:<50} error: {e}")
        lines.append("")

    if ok:
        lines.append("── OK (sql_rows == db_rows) ──")
        for t, sq, db in sorted(ok):
            lines.append(f"  {t:<50} rows={db:>10}")

    report = "\n".join(lines) + "\n"
    with open(REPORT_FILE, "w") as f:
        f.write(report)
    print(report)


def main():
    log("=" * 60)
    log("reload_missing.py starting")
    if DRY_RUN:
        log("DRY-RUN mode — no changes will be made")

    excluded = get_excluded_tables()
    log(f"Excluded tables: {len(excluded)}")

    log("Querying MySQL for existing tables and zero-row estimates...")
    db_tables, zero_est_tables = get_mysql_tables_with_counts()
    log(f"  MySQL tables: {len(db_tables)}, estimated zero-row: {len(zero_est_tables)}")

    log("Getting table list from SQL file...")
    sql_tables = get_sql_tables()
    log(f"  SQL tables: {len(sql_tables)}")

    # Target tables: missing from MySQL + zero-row in MySQL, neither excluded
    missing_from_db = set(sql_tables) - db_tables - excluded
    zero_row_in_db  = (zero_est_tables & set(sql_tables)) - excluded

    log(f"  Missing from MySQL (not excluded): {len(missing_from_db)}")
    log(f"  Zero-row in MySQL (not excluded): {len(zero_row_in_db)}")

    # Confirm zero-row with exact COUNT(*) for a subset
    log("Verifying zero-row tables with exact COUNT(*)...")
    confirmed_zero = set()
    for tbl in sorted(zero_row_in_db):
        c = exact_count(tbl)
        if c == 0:
            confirmed_zero.add(tbl)
    log(f"  Confirmed zero-row (exact count): {len(confirmed_zero)}")

    target_tables = {
        tbl: ("new" if tbl in missing_from_db else "reload")
        for tbl in (missing_from_db | confirmed_zero)
    }
    log(f"Total target tables: {len(target_tables)} "
        f"({len(missing_from_db)} new + {len(confirmed_zero)} reload)")

    if REPORT_ONLY:
        log("--report-only: skipping load, generating report from current DB state")
        # Just query current DB and SQL and report
        results = []
        # ... would need SQL row counts separately
        log("Report-only mode not fully implemented without SQL counts; run without --report-only")
        return

    # --table override: force exactly one table regardless of DB state
    if FORCE_TABLE:
        log(f"--table override: forcing load of '{FORCE_TABLE}'")
        target_tables = {FORCE_TABLE: "reload"}

    if not target_tables:
        log("No tables to reload. Generating comparison report...")
        # Generate report from existing state
        results = []
        for tbl in sorted(sql_tables):
            if tbl in excluded:
                continue
            db_count = exact_count(tbl) if tbl in db_tables else -1
            results.append((tbl, -1, db_count, None if tbl in db_tables else "not in MySQL"))
        generate_report(results)
        return

    log(f"\nStarting single-pass extraction from {SQL_FILE}...")
    log(f"Tables to process: {sorted(target_tables.keys())[:10]}{'...' if len(target_tables) > 10 else ''}")

    results = []
    current_table = None
    current_lines = []
    in_target = False
    tables_done = 0
    tables_found = set()

    t0 = time.time()
    with open(SQL_FILE, "r", encoding="utf-8", errors="replace") as f:
        for lineno, line in enumerate(f, 1):
            if lineno % 5_000_000 == 0:
                elapsed = time.time() - t0
                log(f"  ... {lineno:,} lines read in {elapsed:.0f}s, {tables_done} tables done")

            # Detect table boundary
            if line.startswith("-- Table structure for "):
                # Finish previous table if it was a target
                if in_target and current_table and current_lines:
                    log(f"  Loading: {current_table} ({'new' if target_tables[current_table]=='new' else 'reload'})...")
                    is_new = (target_tables[current_table] == "new")
                    sq, db, err = load_table_sql(current_table, current_lines, is_new)
                    tables_done += 1
                    if err:
                        log(f"  ERROR {current_table}: {err}")
                        results.append((current_table, sq, db, err))
                    else:
                        log(f"  OK {current_table}: sql={sq} db={db}")
                        results.append((current_table, sq, db, None))

                tbl_name = line.strip().rstrip("\r").replace("-- Table structure for ", "").strip()
                current_table = tbl_name
                current_lines = []
                in_target = (tbl_name in target_tables)
                if in_target:
                    tables_found.add(tbl_name)
            elif in_target:
                current_lines.append(line)

    # Handle last table
    if in_target and current_table and current_lines:
        log(f"  Loading: {current_table}...")
        is_new = (target_tables[current_table] == "new")
        sq, db, err = load_table_sql(current_table, current_lines, is_new)
        tables_done += 1
        if err:
            log(f"  ERROR {current_table}: {err}")
            results.append((current_table, sq, db, err))
        else:
            log(f"  OK {current_table}: sql={sq} db={db}")
            results.append((current_table, sq, db, None))

    elapsed = time.time() - t0
    log(f"\nExtraction pass done in {elapsed:.1f}s. {tables_done} tables processed.")

    # Tables in target_tables but not found in SQL
    not_found = set(target_tables.keys()) - tables_found
    if not_found:
        log(f"WARNING: {len(not_found)} target tables not found in SQL file:")
        for t in sorted(not_found):
            log(f"  {t}")
            results.append((t, 0, -1, "not found in SQL file"))

    log("\nGenerating comparison report...")
    generate_report(results)

    log(f"Report saved to: {REPORT_FILE}")
    log("Done.")


if __name__ == "__main__":
    main()
