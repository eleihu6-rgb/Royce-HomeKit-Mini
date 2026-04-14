#!/bin/bash
# Runs in background, updates PROGRESS_REPORT.txt every 30 seconds
# Start: nohup bash ~/rois_tg_live_load/watch_progress.sh &

BASE_DIR="$HOME/rois_tg_live_load"
TABLES_DIR="$BASE_DIR/tables"
REPORT="$HOME/rois_tg_live_load/PROGRESS_REPORT.txt"
DB="rois_tg_live_prod"

while true; do
    TOTAL_ORIG=612  # total table files (613 minus tbl_0000)
    DONE=$(ls "$TABLES_DIR/completed/" 2>/dev/null | wc -l)
    REMAINING=$(find "$TABLES_DIR" -maxdepth 1 -name 'tbl_*' ! -name 'tbl_0000' -type f | wc -l)
    FAILED=$(grep -c '^' "$BASE_DIR/FAILED.log" 2>/dev/null || echo 0)
    PCT=$(( DONE * 100 / TOTAL_ORIG ))

    IMPORT_RUNNING="NO"
    if pgrep -f "import_table.sh" > /dev/null 2>&1; then
        IMPORT_RUNNING="YES"
    fi

    DB_STATS=$(mysql -uroot -pR@iscrew2026 "$DB" -sNe \
        "SELECT COUNT(*) AS tables_with_data, FORMAT(SUM(TABLE_ROWS),0) AS est_rows, ROUND(SUM(data_length+index_length)/1024/1024/1024,2) AS data_GB FROM information_schema.tables WHERE table_schema='$DB' AND TABLE_ROWS>0;" 2>/dev/null \
        | tr '\t' '\t')

    DISK=$(df -h / | tail -1)

    cat > "$REPORT" <<EOF
=== MySQL Load Progress Report ===
Last updated: $(date '+%Y-%m-%d %H:%M:%S')

Files done   : $DONE / $TOTAL_ORIG  ($PCT%)
Files remaining: $REMAINING
Files failed : $FAILED
Import running: $IMPORT_RUNNING

MySQL DB stats:
tables_with_data	est_rows	data_GB
$DB_STATS

Disk space: $DISK

Status: $([ "$IMPORT_RUNNING" = "YES" ] && echo "IN PROGRESS" || echo "STOPPED")

--- Last 10 completed ---
$(tail -10 "$BASE_DIR/ROW_AUDIT.log" 2>/dev/null)

--- Last 5 failures ---
$(tail -5 "$BASE_DIR/FAILED.log" 2>/dev/null)
EOF

    sleep 30
done
