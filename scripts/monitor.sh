#!/bin/bash
# ============================================================
# monitor.sh  —  Live Status Monitor Agent
# Refreshes PROGRESS_REPORT.txt every 15 seconds.
# Run in background: nohup bash monitor.sh &
# ============================================================

BASE_DIR="$HOME/rois_tg_live_load"
PENDING_DIR="$BASE_DIR/tables"
IN_PROGRESS_DIR="$BASE_DIR/tables/in_progress"
COMPLETED_DIR="$BASE_DIR/tables/completed"
FAILED_DIR="$BASE_DIR/tables/failed"
AUDIT_LOG="$BASE_DIR/logs/ROW_AUDIT.log"
FAILED_LOG="$BASE_DIR/logs/FAILED.log"
REPORT="$BASE_DIR/PROGRESS_REPORT.txt"
DB="rois_tg_live_prod"
TOTAL_TABLES=306   # total pending at start of this run (excl tbl_0000)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Monitor started" >> "$BASE_DIR/logs/monitor.log"

while true; do
    PENDING=$(find "$PENDING_DIR" -maxdepth 1 -name 'tbl_*' ! -name 'tbl_0000' -type f | wc -l)
    IN_PROG=$(ls "$IN_PROGRESS_DIR" 2>/dev/null | wc -l)
    DONE=$(ls "$COMPLETED_DIR" 2>/dev/null | wc -l)
    FAILED=$(ls "$FAILED_DIR" 2>/dev/null | wc -l)
    PROCESSED=$(( DONE + FAILED ))
    PCT=$(( PROCESSED * 100 / TOTAL_TABLES ))

    # Active workers
    WORKER_PIDS=$(pgrep -f "worker.sh" 2>/dev/null | tr '\n' ' ')
    ACTIVE_WORKERS=$(echo "$WORKER_PIDS" | wc -w)

    # DB stats
    DB_STATS=$(mysql -uroot -pR@iscrew2026 "$DB" -sNe \
        "SELECT COUNT(*) as tables, FORMAT(SUM(TABLE_ROWS),0) as est_rows, ROUND(SUM(data_length+index_length)/1024/1024/1024,2) as data_GB \
         FROM information_schema.tables \
         WHERE table_schema='$DB' AND TABLE_ROWS>0;" 2>/dev/null)

    # In-progress detail (which tables are actively being imported)
    IN_PROG_DETAIL=$(ls "$IN_PROGRESS_DIR" 2>/dev/null | sed 's/_w[0-9]*//' | sort | head -10 | sed 's/^/  - /' || echo "  (none)")

    # Last 8 completions from audit log
    RECENT_OK=$(tail -8 "$AUDIT_LOG" 2>/dev/null | awk -F'|' '{printf "  %-12s %-35s sql=%-8s db=%-8s %s\n", $2, $4, $5, $6, $7}' || echo "  (none)")

    # Last 5 failures
    RECENT_FAIL=$(tail -5 "$FAILED_LOG" 2>/dev/null | awk -F'|' '{printf "  %-12s %-35s %s\n", $2, $4, $6}' || echo "  (none)")

    DISK=$(df -h / | tail -1 | awk '{print $3 " used / " $2 " total (" $5 " full)"}')

    STATUS="IN PROGRESS"
    [ "$ACTIVE_WORKERS" -eq 0 ] && STATUS="STOPPED"
    [ "$PENDING" -eq 0 ] && [ "$IN_PROG" -eq 0 ] && [ "$ACTIVE_WORKERS" -eq 0 ] && STATUS="COMPLETED"

    cat > "$REPORT" <<EOF
╔══════════════════════════════════════════════════════════════╗
║           MySQL Import — Live Status                        ║
╚══════════════════════════════════════════════════════════════╝
Last updated : $(date '+%Y-%m-%d %H:%M:%S')
Status       : $STATUS
Active agents: $ACTIVE_WORKERS workers running  (PIDs: $WORKER_PIDS)

─── Queue ────────────────────────────────────────────────────
  Pending     : $PENDING
  In progress : $IN_PROG
  Completed   : $DONE
  Failed      : $FAILED
  Progress    : $PROCESSED / $TOTAL_TABLES  ($PCT%)

─── Currently importing ──────────────────────────────────────
$IN_PROG_DETAIL

─── Database ─────────────────────────────────────────────────
$(echo "$DB_STATS" | awk '{printf "  Tables loaded : %s\n  Est rows      : %s\n  Data size     : %s GB\n", $1, $2, $3}')

─── Disk ─────────────────────────────────────────────────────
  $DISK

─── Recent completions ───────────────────────────────────────
$RECENT_OK

─── Recent failures ──────────────────────────────────────────
$RECENT_FAIL
EOF

    sleep 15
done
