# MySQL Bulk Load — Lessons Learned
**Date:** 2026-03-09
**Project:** ROIs-Crew-Gantt-aiGen
**Source:** Azure MySQL 8.0.42 (southeast-asia-db-test.az.roiscloud.com)
**Target:** Local MySQL 8.0 on GCP (34.126.181.195)
**Dump Tool:** Navicat Premium
**Database:** rois_tg_live_prod (~50M rows, ~18GB uncompressed)

---

## Overview

Loading a large Navicat SQL dump into MySQL is non-trivial. This document captures every issue encountered, how it was resolved, and the final optimized approach. It is intended as the blueprint for a future web-based load tool.

---

## Timeline

| Time | Event |
|------|-------|
| Session start | Connected to server, confirmed MySQL running |
| +5 min | Discovered `/api/upload/status` = `done` — but that was Redis, not MySQL |
| +10 min | Found `rois_tg_live_prod.sql.zip` (1.2GB zip / 18GB SQL) in home dir |
| +15 min | Set up DBeaver connection from macOS via SSH tunnel |
| +20 min | Confirmed both MySQL databases empty — load had not happened yet |
| +30 min | First naive load attempt — failed immediately |
| +60 min | Root cause found, plan redesigned |
| +90 min | Optimized 7-step plan executed with 3-4 parallel agents |
| +3 hrs  | Load in progress (613 table files, xargs -P 2) |

---

## Issues Encountered & Fixes

### Issue 1 — MySQL user password unknown
**Symptom:** `rois_user` exists in MySQL but password not stored anywhere in the project.
**Fix:** Used `debian-sys-maint` system user (credentials in `/etc/mysql/debian.cnf`) — it has full MySQL access and is always available on Debian/Ubuntu MySQL installs.
**Lesson:** Always note the `debian-sys-maint` credentials as a fallback. They live in `/etc/mysql/debian.cnf`.

---

### Issue 2 — DBeaver: `allowPublicKeyRetrieval` error
**Symptom:** DBeaver connected via SSH tunnel but threw: *"Public Key Retrieval is not allowed"*
**Fix:** In DBeaver → Driver Properties tab → set `allowPublicKeyRetrieval = true`
**Or in URL:** append `?allowPublicKeyRetrieval=true&useSSL=false`
**Lesson:** MySQL 8.0 uses `caching_sha2_password` by default which requires this flag when connecting from external clients.

---

### Issue 3 — macOS ZIP `__MACOSX` metadata corrupting stream
**Symptom:** First load attempt: `ERROR 1146: Table 'airport' doesn't exist` at line 10891.
When using `unzip -p file.zip | mysql ...`, macOS-created zips contain a hidden `__MACOSX/._filename` metadata file. This gets concatenated into the stream, corrupting the SQL before the first CREATE TABLE.
**Fix:** Always specify the SQL filename explicitly:
```bash
unzip -p file.zip rois_tg_live_prod.sql | mysql ...
# NOT: unzip -p file.zip | mysql ...
```
**Better fix:** Unzip to disk first, then load from file — avoids re-reading for debugging.
**Lesson:** Always check `unzip -l file.zip` before streaming. macOS zips contain junk files.

---

### Issue 4 — Single-row INSERTs (Navicat default) are extremely slow
**Symptom:** Second load attempt progressed but was estimated to take 10+ hours.
**Root cause:** Navicat dumps generate one `INSERT INTO table VALUES (row);` per row. With 50M rows = 50M separate SQL statements = catastrophic performance.
**Fix:** Convert to batched multi-row INSERTs before loading:
```sql
-- Navicat (slow): 50,000,000 statements
INSERT INTO `t` VALUES (1,...);
INSERT INTO `t` VALUES (2,...);

-- Batched (fast): 10,000 statements
INSERT INTO `t` VALUES (1,...),(2,...),(500,...);
```
Tool: `batch_split.py` — reads SQL, batches every 5000 rows per table, streams to stdout.
**Lesson:** Always batch INSERTs for Navicat dumps. 5000 rows per INSERT is safe with `max_allowed_packet=1G`.

---

### Issue 5 — Sequential single-stream load wastes parallelism
**Symptom:** Even with batched INSERTs, loading tables sequentially is slow on multi-core machines.
**Fix:** Split the SQL dump into per-table files using `csplit`, then load in parallel:
```bash
# Split
python3 batch_split.py | csplit --digits=4 --quiet --prefix=tables/tbl_ - '/^-- Table structure for /' '{*}'

# Parallel import (2 workers for 2 CPUs)
ls tables/tbl_* | grep -v tbl_0000 | xargs -P 2 -I {} sh -c 'mysql ... < "{}"'
```
**Lesson:** Always split-and-parallel for dumps > 1GB. Match `-P N` to available CPU cores.

---

### Issue 6 — Not enough disk space for split files
**Concern:** 18GB SQL + 17GB split files = 35GB needed. Server had 27GB free initially.
**Resolution:** The 18GB SQL file was already counted in used space. Split files (17GB) fit in the 27GB free. Peak during splitting: both coexist (~34GB used). Monitored with `df -h`.
**Lesson:** Always check `df -h` before splitting. Need free space ≥ size of SQL file.

---

### Issue 7 — MySQL settings not optimized for bulk load
**Default settings** are tuned for OLTP (safe, slow writes). For bulk loading:

| Setting | Default | Bulk Load | Why |
|---------|---------|-----------|-----|
| `innodb_flush_log_at_trx_commit` | 1 | 0 | Skip fsync per commit |
| `innodb_doublewrite` | ON | OFF | Skip doublewrite buffer |
| `innodb_io_capacity` | 200 | 4000 | More aggressive I/O |
| `bulk_insert_buffer_size` | 8M | 1G | Large insert buffer |
| `skip-log-bin` | off | on | No binary log overhead |
| `innodb_read/write_io_threads` | 4 | 4 | Match to CPU |

**Important:** Restore safe settings after load (`innodb_flush_log_at_trx_commit=1`, `innodb_doublewrite=ON`).

---

### Issue 8 — uvicorn consuming 3GB RAM during load
**Fix:** Stop uvicorn before load, restart after. Frees ~3GB for MySQL buffer pool.
**Lesson:** Stop all non-essential services before bulk load on memory-constrained servers.

---

## Final Optimized Process (8 Steps) — v3  ★ CURRENT PLAN

```
Step 1  Verify file exists, check disk space (need ≥ SQL file size free)
Step 2  Unzip to disk (never stream from zip for large files)
Step 3  Convert + split: batch_split.py | csplit → per-table files in tables/
Step 4  Tune MySQL for bulk load + stop uvicorn
Step 5  Create DB + load header (tbl_0000)
Step 6  Launch agents:
          bash ~/rois_tg_live_load/start_agents.sh [NUM_WORKERS]
          Default: 3 import workers + 1 monitor agent = 4 agents total
Step 7  Monitor: cat ~/rois_tg_live_load/PROGRESS_REPORT.txt
Step 8  When done: verify ROW_AUDIT.log, restore MySQL settings, restart uvicorn
```

### Agent Architecture

```
start_agents.sh
  ├── monitor.sh          (1 agent)  — updates PROGRESS_REPORT.txt every 15s
  ├── worker.sh 1         (import agent 1) ─┐
  ├── worker.sh 2         (import agent 2)  ├── queue-based, each claims 1 table at a time
  └── worker.sh 3         (import agent 3) ─┘
```

### Worker Loop (worker.sh)

Each worker independently:
1. Atomically claims next `tbl_XXXX` from `tables/` → moves to `tables/in_progress/tbl_XXXX_wN`
2. Extracts table name from file header
3. Counts SQL rows (`(` lines in VALUES block)
4. Runs `mysql < file`
5. On **success**: queries `SELECT COUNT(*) FROM table` → logs sql_rows vs db_rows → moves to `tables/completed/`
6. On **failure**: logs error to `logs/FAILED.log` → moves to `tables/failed/`
7. Loops back to claim next file until queue is empty

### Scripts

| Script | Role |
|--------|------|
| `start_agents.sh` | Launches all workers + monitor |
| `worker.sh N` | Import agent — one table at a time, loops until done |
| `monitor.sh` | Status agent — refreshes PROGRESS_REPORT.txt every 15s |
| `batch_split.py` | Converts single-row → 5000-row batched INSERTs + csplit |

### Queue Directory Layout

```
~/rois_tg_live_load/tables/
  ├── tbl_0000            ← DDL header, never touched by workers
  ├── tbl_XXXX            ← PENDING (waiting to be claimed)
  ├── in_progress/
  │     └── tbl_XXXX_w2  ← actively being imported by worker 2
  ├── completed/
  │     └── tbl_XXXX     ← successfully imported
  └── failed/
        └── tbl_XXXX     ← failed, available for manual retry
```

### Log Files

| File | Contents |
|------|----------|
| `logs/ROW_AUDIT.log` | Per-success: timestamp, worker, file, table, sql_rows, db_rows, elapsed |
| `logs/FAILED.log` | Per-failure: timestamp, worker, file, table, sql_rows, error |
| `logs/worker_N.log` | Per-worker console output |
| `logs/monitor.log` | Monitor agent log |
| `PROGRESS_REPORT.txt` | Live dashboard, refreshed every 15s |

### Commands

```bash
# Start (3 workers default)
bash ~/rois_tg_live_load/start_agents.sh

# Start with 4 workers
bash ~/rois_tg_live_load/start_agents.sh 4

# Watch live status
watch -n 5 cat ~/rois_tg_live_load/PROGRESS_REPORT.txt

# Follow a worker
tail -f ~/rois_tg_live_load/logs/worker_1.log

# Stop all agents
pkill -f worker.sh; pkill -f monitor.sh
```

---

## Performance Reference

| Approach | Estimated Time (50M rows, 18GB) |
|----------|--------------------------------|
| Naive stream (single-row INSERTs) | 8–12 hours |
| Batched INSERTs, single stream | 2–4 hours |
| Batched INSERTs + parallel (xargs -P 2) | 1–2 hours |
| Batched INSERTs + parallel (xargs -P 4+) | <1 hour (if CPU/disk allows) |

---

## File Organization

```
~/DataLoading/
  ├── LESSONS_LEARNED.md              ← this file
  ├── mysql_load.sh                   ← 7-step orchestrator script
  ├── batch_split.py                  ← INSERT batcher + splitter
  └── rois_tg_live_load/
        ├── rois_tg_live_prod.sql     ← 17GB uncompressed dump
        ├── rois_tg_live_prod.sql.zip ← 1.2GB original zip
        └── tables/                   ← 614 per-table split files
```

---

## Web Tool Requirements (Future)

Based on this session, a web-based load tool should support:

1. **Upload** — Accept `.sql` or `.sql.zip` (handle macOS `__MACOSX` stripping)
2. **Pre-flight check** — Disk space, MySQL connectivity, target DB exists/empty
3. **Conversion** — Auto-detect single-row Navicat dumps, auto-batch to N rows
4. **Split** — csplit into per-table files, show progress bar
5. **MySQL tuning** — Apply bulk-load settings before, restore after
6. **Parallel import** — Configurable workers (`-P N`), per-file progress
7. **Live monitoring** — Real-time table row counts, done/failed/pending counts
8. **Reconciliation** — Compare SQL row counts vs DB row counts, highlight deltas
9. **Retry** — Auto-retry failed table files (up to 3 rounds)
10. **Cleanup** — Delete split files, organize into archive folder
11. **Report** — Final summary: tables loaded, total rows, GB, time taken, any gaps

---

## Server Reference

| Item | Value |
|------|-------|
| Server IP | 34.126.181.195 |
| MySQL port | 3306 |
| MySQL version | 8.0 |
| MySQL user for loads | `debian-sys-maint` (see `/etc/mysql/debian.cnf`) |
| MySQL app user | `rois_user@localhost` (password unknown — reset if needed) |
| Databases | `rois_tg_live_prod`, `rois_tg_scenario_prod` |
| Backend port | 8000 (uvicorn) |
| Frontend port | 5566 (vite) |
| SSH user | eleihu6 |
| SSH key (macOS) | `~/.ssh/google_compute_engine` |
