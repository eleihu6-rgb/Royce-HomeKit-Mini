#!/bin/bash
# Master import runner
# Loads all remaining table files in parallel (2 workers)
# Skips tbl_0000 (header/DDL only, already loaded)
# Progress is written to: ~/rois_tg_live_load/ROW_AUDIT.log
#                          ~/rois_tg_live_load/FAILED.log
#                          ~/rois_tg_live_load/PROGRESS_REPORT.txt (updated every 30s by watch_progress.sh)

BASE_DIR="$HOME/rois_tg_live_load"
TABLES_DIR="$BASE_DIR/tables"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPORT_SCRIPT="$SCRIPT_DIR/import_table.sh"
WORKERS=2

chmod +x "$IMPORT_SCRIPT"

echo "=== Import started at $(date) ==="
echo "Tables dir: $TABLES_DIR"
echo "Workers: $WORKERS"
echo ""

# List all table files excluding tbl_0000 and the completed/ subdir
TABLE_FILES=$(find "$TABLES_DIR" -maxdepth 1 -name 'tbl_*' ! -name 'tbl_0000' -type f | sort)
TOTAL=$(echo "$TABLE_FILES" | grep -c .)

echo "Files to process: $TOTAL"
echo ""

echo "$TABLE_FILES" | xargs -P $WORKERS -I {} bash "$IMPORT_SCRIPT" {}

echo ""
echo "=== Import finished at $(date) ==="
echo ""

# Final summary
DONE=$(ls "$TABLES_DIR/completed/" 2>/dev/null | wc -l)
REMAINING=$(find "$TABLES_DIR" -maxdepth 1 -name 'tbl_*' ! -name 'tbl_0000' -type f | wc -l)
FAILED=$(wc -l < "$BASE_DIR/FAILED.log" 2>/dev/null || echo 0)

echo "Summary:"
echo "  Completed : $DONE"
echo "  Remaining : $REMAINING"
echo "  Failed    : $FAILED"
echo ""
echo "See full row audit: $BASE_DIR/ROW_AUDIT.log"
echo "See failures:       $BASE_DIR/FAILED.log"
