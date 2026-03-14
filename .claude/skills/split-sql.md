---
name: split-sql
description: Split a large MySQL .sql dump file into per-table files and prepare them for parallel import using the rois_tg_live_load pipeline. Use when the user wants to break up a big SQL file, prepare tables for loading, or run the split_sql.py splitter.
---

Split a large MySQL dump file into per-table files ready for `run_import.sh`.

## What this skill does

1. Runs `split_sql.py` against the target SQL file
2. Writes one file per table into `~/rois_tg_live_load/tables/`
3. Each file is named `tbl_NNNN_<table_name>` (compatible with `run_import.sh` and `worker.sh`)
4. Optionally launches `run_import.sh` to start parallel loading

## Usage

```
/split-sql [sql_file_path]
```

- Default SQL file: `~/rois_tg_live_load/rois_tg_live_prod.sql`
- Default output:   `~/rois_tg_live_load/tables/`

## Steps to execute

1. Confirm the SQL file path with the user if not specified
2. Check available disk space (`df -h ~`) — the split produces ~same total size
3. Run the splitter:
   ```bash
   python3 ~/Royce-Homekit/split_sql.py <sql_file> --out-dir ~/rois_tg_live_load/tables/
   ```
4. Report the number of table files created
5. Ask user if they want to start the import with:
   ```bash
   bash ~/rois_tg_live_load/run_import.sh
   ```

## Notes
- The splitter streams the file line-by-line so memory usage is low regardless of file size
- Existing files in `tables/` are NOT cleared first — warn user if re-splitting
- Monitor load progress via: `cat ~/rois_tg_live_load/PROGRESS_REPORT.txt`
- Failed tables are logged to: `~/rois_tg_live_load/logs/FAILED.log`
