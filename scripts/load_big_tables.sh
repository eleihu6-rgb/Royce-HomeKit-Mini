#!/bin/bash
# Load big table chunks sequentially (one at a time to avoid RAM spike)
# Run this BEFORE starting workers on the regular queue.

TABLES_DIR="$HOME/rois_tg_live_load/tables/big_tables"
LOG="$HOME/rois_tg_live_load/logs/big_tables.log"
DB="rois_tg_live_prod"
MYSQL="mysql -uroot -pR@iscrew2026 $DB"

mkdir -p "$HOME/rois_tg_live_load/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

load_chunk() {
    local file="$1"
    local label="$2"
    local start=$(date +%s)
    log "LOADING $label ..."
    error=$($MYSQL < "$file" 2>&1)
    local rc=$?
    local elapsed=$(( $(date +%s) - start ))
    if [ $rc -eq 0 ]; then
        log "OK      $label (${elapsed}s)"
        return 0
    else
        log "FAILED  $label | $error"
        return 1
    fi
}

# Big tables: load chunks in strict order
declare -A TABLES=(
    [tbl_0428]="roster_publish"
    [tbl_0429]="roster_publish_adjust"
    [tbl_0455]="schedule_roster_flight"
    [tbl_0419]="roster_ground_export"
    [tbl_0447]="schedule_crew_manday_cc_am"
    [tbl_0411]="roster_ground"
)

log "=== Big Table Sequential Load Start ==="
log "Buffer pool: $(mysql -uroot -pR@iscrew2026 -se 'SELECT @@innodb_buffer_pool_size/1024/1024/1024' 2>/dev/null)GB"
log "Free RAM: $(vm_stat | awk '/Pages free/{printf "%.1fGB\n", $3*4096/1024/1024/1024}')"

for tbl in tbl_0428 tbl_0429 tbl_0455 tbl_0419 tbl_0447 tbl_0411; do
    tname="${TABLES[$tbl]}"
    chunks=$(ls "$TABLES_DIR/${tbl}_chunk_"* 2>/dev/null | sort)
    if [ -z "$chunks" ]; then
        log "SKIP $tbl — no chunks found (may have been loaded already)"
        continue
    fi
    log "--- $tname ---"
    failed=0
    for chunk in $chunks; do
        label="$(basename $chunk)"
        load_chunk "$chunk" "$label" || { failed=1; break; }
    done
    if [ $failed -eq 0 ]; then
        log "COMPLETE $tname — all chunks loaded OK"
        # Verify row count
        rows=$(mysql -uroot -pR@iscrew2026 $DB -se "SELECT COUNT(*) FROM \`$tname\`" 2>/dev/null)
        log "ROW COUNT $tname = $rows"
        # Move original to completed
        mv "$TABLES_DIR/$tbl" "$HOME/rois_tg_live_load/tables/completed/$tbl" 2>/dev/null
        # Clean up chunk files
        rm -f "$TABLES_DIR/${tbl}_chunk_"*
    else
        log "FAILED $tname — stopping. Fix issue before retrying."
        break
    fi
    echo ""
done

log "=== Big Table Load Done ==="
