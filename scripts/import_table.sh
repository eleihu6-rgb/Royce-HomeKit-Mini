#!/bin/bash
# Per-table import script
# Usage: import_table.sh <table_file_path>
# - Counts rows in SQL file
# - Imports into MySQL
# - Counts rows in DB after load
# - Logs result to ROW_AUDIT.log
# - Moves file to completed/ on success

TABLE_FILE="$1"
BASE_DIR="$HOME/rois_tg_live_load"
TABLES_DIR="$BASE_DIR/tables"
COMPLETED_DIR="$TABLES_DIR/completed"
LOG_FILE="$BASE_DIR/ROW_AUDIT.log"
FAILED_LOG="$BASE_DIR/FAILED.log"
DB="rois_tg_live_prod"
MYSQL_CMD="mysql -uroot -pR@iscrew2026 $DB"

mkdir -p "$COMPLETED_DIR"

FNAME=$(basename "$TABLE_FILE")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Extract table name from file header
TABLE_NAME=$(grep -m1 'Table structure for' "$TABLE_FILE" | sed 's/.*Table structure for //' | tr -d '[:space:]')

if [ -z "$TABLE_NAME" ]; then
    echo "[$TIMESTAMP] SKIP $FNAME — could not extract table name" | tee -a "$FAILED_LOG"
    exit 1
fi

# Count rows in SQL file (each data row starts with a line beginning with '(')
SQL_ROW_COUNT=$(grep -c '^\s*(' "$TABLE_FILE" 2>/dev/null || echo 0)

# Run the import
IMPORT_OUTPUT=$(mysql -uroot -pR@iscrew2026 "$DB" < "$TABLE_FILE" 2>&1)
IMPORT_EXIT=$?

if [ $IMPORT_EXIT -ne 0 ]; then
    ERROR_MSG=$(echo "$IMPORT_OUTPUT" | grep -v "Warning" | head -3 | tr '\n' ' ')
    echo "[$TIMESTAMP] FAILED  | $FNAME | table=$TABLE_NAME | sql_rows=$SQL_ROW_COUNT | db_rows=- | error: $ERROR_MSG" | tee -a "$FAILED_LOG"
    exit 1
fi

# Count rows in DB after import
DB_ROW_COUNT=$(mysql -uroot -pR@iscrew2026 "$DB" -sNe "SELECT COUNT(*) FROM \`$TABLE_NAME\`;" 2>/dev/null || echo "?")

# Log result
echo "[$TIMESTAMP] OK      | $FNAME | table=$TABLE_NAME | sql_rows=$SQL_ROW_COUNT | db_rows=$DB_ROW_COUNT" | tee -a "$LOG_FILE"

# Move to completed
mv "$TABLE_FILE" "$COMPLETED_DIR/$FNAME"

exit 0
