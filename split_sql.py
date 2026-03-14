#!/usr/bin/env python3
"""
split_sql.py — SQL File Splitter
Splits a large MySQL dump into per-table files ready for parallel import.

Usage:
  python3 split_sql.py <sql_file> [--out-dir DIR] [--workers N]

Each output file is named:  tbl_NNNN_<table_name>
and is placed in --out-dir (default: ~/rois_tg_live_load/tables/)

Logic mirrors the existing worker.sh / import_table.sh approach so
run_import.sh can pick up the files immediately after splitting.
"""

import os, sys, re, argparse, time

TABLES_DIR_DEFAULT = os.path.expanduser('~/rois_tg_live_load/tables')
SPLIT_MARKER = '-- Table structure for '

def split_sql(sql_path, out_dir, verbose=True):
    os.makedirs(out_dir, exist_ok=True)

    total_size  = os.path.getsize(sql_path)
    tables_written = 0
    current_table  = None
    current_lines  = []
    preamble_lines = []          # header before first table
    idx            = 0

    def flush(table_name, lines, file_idx):
        if not lines:
            return
        fname  = f'tbl_{file_idx:04d}_{table_name}'
        fpath  = os.path.join(out_dir, fname)
        with open(fpath, 'w', encoding='utf-8', errors='replace') as f:
            f.writelines(lines)
        size = os.path.getsize(fpath)
        if verbose:
            print(f'  [{file_idx:04d}] {table_name:50s}  {size/1024:.1f} KB')

    t0 = time.time()
    if verbose:
        print(f'Splitting: {sql_path}')
        print(f'Output:    {out_dir}')
        print(f'Size:      {total_size/1024/1024/1024:.2f} GB')
        print()

    with open(sql_path, 'r', encoding='utf-8', errors='replace') as f:
        bytes_read = 0
        for line in f:
            bytes_read += len(line.encode('utf-8', errors='replace'))

            if line.startswith(SPLIT_MARKER):
                # Flush previous table
                if current_table is not None:
                    flush(current_table, current_lines, idx)
                    tables_written += 1
                    idx += 1
                else:
                    # Save preamble as tbl_0000
                    if preamble_lines:
                        flush('_preamble', preamble_lines, 0)
                        idx = 1

                table_name  = line[len(SPLIT_MARKER):].strip().lstrip('`').rstrip('`').rstrip()
                current_table = re.sub(r'[^\w]', '_', table_name)
                current_lines = [line]

                if verbose and tables_written % 50 == 0 and tables_written > 0:
                    pct = bytes_read / total_size * 100
                    elapsed = time.time() - t0
                    print(f'  ... {tables_written} tables, {pct:.1f}% ({elapsed:.0f}s)')
            else:
                if current_table is not None:
                    current_lines.append(line)
                else:
                    preamble_lines.append(line)

    # Flush last table
    if current_table is not None:
        flush(current_table, current_lines, idx)
        tables_written += 1

    elapsed = time.time() - t0
    print()
    print(f'Done. {tables_written} table files written to {out_dir}')
    print(f'Time: {elapsed:.1f}s')
    print(f'Run:  bash ~/rois_tg_live_load/run_import.sh   to start loading.')
    return tables_written


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Split a large MySQL dump into per-table files.')
    parser.add_argument('sql_file',           help='Path to the .sql dump file')
    parser.add_argument('--out-dir', default=TABLES_DIR_DEFAULT,
                        help=f'Output directory (default: {TABLES_DIR_DEFAULT})')
    parser.add_argument('--quiet', action='store_true', help='Suppress per-table output')
    args = parser.parse_args()

    if not os.path.isfile(args.sql_file):
        print(f'ERROR: File not found: {args.sql_file}', file=sys.stderr)
        sys.exit(1)

    n = split_sql(args.sql_file, args.out_dir, verbose=not args.quiet)
    sys.exit(0 if n > 0 else 1)
