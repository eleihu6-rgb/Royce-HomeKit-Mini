#!/usr/bin/env python3
"""
Fix failed SQL table files where CREATE TABLE has more columns than the INSERT data.
Strategy: Add explicit column list to INSERT statement using first N columns from schema.
"""

import os
import re
import sys

FAILED_DIR = os.path.expanduser("~/rois_tg_live_load/tables/failed")
FIXED_DIR = os.path.expanduser("~/rois_tg_live_load/tables/fixed")
os.makedirs(FIXED_DIR, exist_ok=True)


def extract_columns(sql):
    """Extract column names from CREATE TABLE statement."""
    columns = []
    in_create = False
    for line in sql.splitlines():
        stripped = line.strip()
        if re.match(r'CREATE TABLE', stripped, re.IGNORECASE):
            in_create = True
            continue
        if not in_create:
            continue
        # Stop at closing paren + ENGINE
        if stripped.startswith(')') and 'ENGINE' in stripped:
            break
        # Skip key definitions
        if re.match(r'(PRIMARY KEY|UNIQUE KEY|KEY|INDEX|CONSTRAINT)', stripped, re.IGNORECASE):
            continue
        # Extract column name (backtick-quoted identifier at start of line)
        m = re.match(r'`([^`]+)`', stripped)
        if m:
            columns.append(m.group(1))
    return columns


def count_values_in_row(row_str):
    """
    Count comma-separated values in a row like (val1, val2, 'str,with,comma', NULL).
    Handles: quoted strings, NULL, numbers, nested single-row parens.
    Returns count of top-level values.
    """
    # Strip surrounding parens
    row_str = row_str.strip()
    if row_str.startswith('('):
        row_str = row_str[1:]
    if row_str.endswith(')') or row_str.endswith('),') or row_str.endswith(');'):
        row_str = row_str.rstrip(';').rstrip(',').rstrip(')')

    count = 1
    in_string = False
    escape_next = False
    quote_char = None

    for ch in row_str:
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if in_string:
            if ch == quote_char:
                in_string = False
        else:
            if ch in ("'", '"'):
                in_string = True
                quote_char = ch
            elif ch == ',':
                count += 1

    return count


def find_first_data_row(lines, insert_line_idx):
    """Find the first actual data row after INSERT INTO ... VALUES."""
    for i in range(insert_line_idx + 1, min(insert_line_idx + 20, len(lines))):
        line = lines[i].strip()
        if line.startswith('('):
            return line
    return None


def fix_file(filepath, filename):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
        lines = content.splitlines()

    # Extract columns from CREATE TABLE
    columns = extract_columns(content)
    if not columns:
        print(f"  [SKIP] {filename}: Could not parse CREATE TABLE columns")
        return False

    schema_col_count = len(columns)

    # Find the INSERT INTO ... VALUES line
    insert_line_idx = None
    table_name = None
    for i, line in enumerate(lines):
        m = re.match(r"INSERT INTO `([^`]+)` VALUES", line.strip())
        if m:
            insert_line_idx = i
            table_name = m.group(1)
            break

    if insert_line_idx is None:
        print(f"  [SKIP] {filename}: No INSERT statement found (table may be empty)")
        # Copy as-is to fixed dir so it can be retried
        import shutil
        shutil.copy2(filepath, os.path.join(FIXED_DIR, filename))
        return True

    # Find first data row and count values
    first_row = find_first_data_row(lines, insert_line_idx)
    if first_row is None:
        print(f"  [SKIP] {filename}: Could not find first data row")
        return False

    data_col_count = count_values_in_row(first_row)

    if data_col_count == schema_col_count:
        print(f"  [OK] {filename}: col counts match ({schema_col_count}) — no fix needed")
        import shutil
        shutil.copy2(filepath, os.path.join(FIXED_DIR, filename))
        return True

    if data_col_count > schema_col_count:
        print(f"  [WARN] {filename}: data has MORE cols ({data_col_count}) than schema ({schema_col_count}) — skipping")
        return False

    # data_col_count < schema_col_count — fix needed
    data_columns = columns[:data_col_count]
    col_list = ', '.join(f'`{c}`' for c in data_columns)
    new_insert = f"INSERT INTO `{table_name}` ({col_list}) VALUES"

    print(f"  [FIX] {filename}: schema={schema_col_count}, data={data_col_count} → adding explicit {data_col_count}-col list")

    # Replace the INSERT line
    new_lines = lines[:]
    new_lines[insert_line_idx] = new_insert

    out_path = os.path.join(FIXED_DIR, filename)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines) + '\n')

    return True


def main():
    failed_files = sorted(os.listdir(FAILED_DIR))
    print(f"Found {len(failed_files)} failed files to process\n")

    success = 0
    skipped = 0
    errors = 0

    for filename in failed_files:
        filepath = os.path.join(FAILED_DIR, filename)
        if not os.path.isfile(filepath):
            continue
        print(f"{filename}:")
        try:
            ok = fix_file(filepath, filename)
            if ok:
                success += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  [ERROR] {filename}: {e}")
            errors += 1

    print(f"\nDone: {success} fixed/copied, {skipped} skipped, {errors} errors")
    print(f"Fixed files are in: {FIXED_DIR}")


if __name__ == '__main__':
    main()
