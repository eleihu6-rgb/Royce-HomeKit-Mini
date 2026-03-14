#!/bin/bash
# ============================================================
# worker.sh  —  Import Agent
# Usage: bash worker.sh <WORKER_ID>
# Each worker loops: claim next table → import → log → repeat
# Stops when no more pending files.
# ============================================================

WORKER_ID="${1:-1}"
BASE_DIR="/home/eleihu6/rois_tg_live_load"
PENDING_DIR="$BASE_DIR/tables"
IN_PROGRESS_DIR="$BASE_DIR/tables/in_progress"
COMPLETED_DIR="$BASE_DIR/tables/completed"
FAILED_DIR="$BASE_DIR/tables/failed"
AUDIT_LOG="$BASE_DIR/logs/ROW_AUDIT.log"
FAILED_LOG="$BASE_DIR/logs/FAILED.log"
WORKER_LOG="$BASE_DIR/logs/worker_${WORKER_ID}.log"
DB="rois_tg_live_prod"
MYSQL="mysql -u debian-sys-maint -pR2QY1jwpPm0Vxoyf $DB"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [W$WORKER_ID] $*" | tee -a "$WORKER_LOG"; }

mkdir -p "$IN_PROGRESS_DIR" "$COMPLETED_DIR" "$FAILED_DIR" "$(dirname $AUDIT_LOG)"

log "=== Worker $WORKER_ID started ==="

while true; do

    # --- Atomically claim next pending file ---
    CLAIMED=""
    for CANDIDATE in $(ls "$PENDING_DIR"/tbl_* 2>/dev/null | grep -v tbl_0000 | sort | head -30); do
        [ -f "$CANDIDATE" ] || continue
        FNAME=$(basename "$CANDIDATE")
        DEST="$IN_PROGRESS_DIR/${FNAME}_w${WORKER_ID}"
        if mv "$CANDIDATE" "$DEST" 2>/dev/null; then
            CLAIMED="$DEST"
            break
        fi
    done

    # No more files — done
    if [ -z "$CLAIMED" ]; then
        log "No more pending files. Worker exiting."
        break
    fi

    FNAME=$(basename "$CLAIMED" "_w${WORKER_ID}")
    log "Claimed $FNAME"

    # --- Extract table name ---
    TABLE_NAME=$(grep -m1 'Table structure for' "$CLAIMED" | sed 's/.*Table structure for //' | tr -d '[:space:]')
    if [ -z "$TABLE_NAME" ]; then
        log "ERROR: Cannot extract table name from $FNAME"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAILED  | W$WORKER_ID | $FNAME | table=UNKNOWN | error: cannot extract table name" >> "$FAILED_LOG"
        mv "$CLAIMED" "$FAILED_DIR/$FNAME"
        continue
    fi

    # --- Count rows in SQL file ---
    SQL_ROWS=$(grep -c '^\s*(' "$CLAIMED" 2>/dev/null | tr -d '[:space:]' || echo 0)
    log "Importing $FNAME → table=$TABLE_NAME | sql_rows=$SQL_ROWS"

    # --- Run import ---
    START_TS=$(date +%s)
    IMPORT_OUT=$(mysql -u debian-sys-maint -pR2QY1jwpPm0Vxoyf "$DB" < "$CLAIMED" 2>&1)
    IMPORT_EXIT=$?
    END_TS=$(date +%s)
    ELAPSED=$(( END_TS - START_TS ))

    if [ $IMPORT_EXIT -ne 0 ]; then
        ERR=$(echo "$IMPORT_OUT" | grep -v Warning | head -2 | tr '\n' ' ')
        log "FAILED $FNAME | $ERR"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAILED  | W$WORKER_ID | $FNAME | table=$TABLE_NAME | sql_rows=$SQL_ROWS | error: $ERR" >> "$FAILED_LOG"
        mv "$CLAIMED" "$FAILED_DIR/$FNAME"
        continue
    fi

    # --- Count DB rows after import ---
    DB_ROWS=$(mysql -u debian-sys-maint -pR2QY1jwpPm0Vxoyf "$DB" -sNe "SELECT COUNT(*) FROM \`$TABLE_NAME\`;" 2>/dev/null || echo "?")

    log "OK $FNAME | table=$TABLE_NAME | sql_rows=$SQL_ROWS | db_rows=$DB_ROWS | ${ELAPSED}s"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK      | W$WORKER_ID | $FNAME | table=$TABLE_NAME | sql_rows=$SQL_ROWS | db_rows=$DB_ROWS | ${ELAPSED}s" >> "$AUDIT_LOG"

    mv "$CLAIMED" "$COMPLETED_DIR/$FNAME"

done

log "=== Worker $WORKER_ID finished ==="
