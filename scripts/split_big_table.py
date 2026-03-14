#!/usr/bin/env python3
"""
Split a large per-table SQL file into N chunks for sequential loading.

Each chunk gets:
  - Chunk 1: full CREATE TABLE DDL + first batch of INSERTs
  - Chunk 2+: INSERT-only (no DDL, table already exists)

Usage:
  python3 split_big_table.py <tbl_file> [--inserts-per-chunk N]
  Default: 50000 INSERT statements per chunk (each INSERT = 5000 rows = 250M rows/chunk)

Output:
  Creates <tbl_file>_chunk_001, _chunk_002, ... in same directory.
  Original file is NOT deleted.
"""

import os
import sys
import re
import argparse

DEFAULT_INSERTS_PER_CHUNK = 50000  # 50k batched INSERTs × 5000 rows = 250M rows max


def split_table_file(filepath, inserts_per_chunk=DEFAULT_INSERTS_PER_CHUNK):
    dirpath = os.path.dirname(filepath)
    basename = os.path.basename(filepath)

    print(f"Reading {filepath} ({os.path.getsize(filepath) // 1024 // 1024}MB)...")

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    lines = content.splitlines(keepends=True)

    # Split into: header (DDL) and data (INSERTs)
    insert_start = None
    table_name = None
    for i, line in enumerate(lines):
        m = re.match(r"INSERT INTO `([^`]+)`.*VALUES", line.strip())
        if m:
            insert_start = i
            table_name = m.group(1)
            break

    if insert_start is None:
        print("  No INSERT found — nothing to split.")
        return

    ddl_lines = lines[:insert_start]
    data_lines = lines[insert_start:]

    # Collect INSERT blocks: each block = "INSERT INTO ... VALUES\n" + rows + ";\n"
    # In the batched format, structure is:
    #   INSERT INTO `t` VALUES      <- header line
    #   (row1),
    #   (row2),
    #   ...
    #   (rowN);                     <- last row ends with ;
    # OR the batch_split.py format may have one INSERT per batch already.
    # We treat each "INSERT INTO" line as the start of a new insert block.

    insert_blocks = []  # list of lists of lines
    current_block = []

    for line in data_lines:
        if re.match(r"INSERT INTO `", line.strip()) and current_block:
            insert_blocks.append(current_block)
            current_block = [line]
        else:
            current_block.append(line)
    if current_block:
        insert_blocks.append(current_block)

    total_inserts = len(insert_blocks)
    total_chunks = (total_inserts + inserts_per_chunk - 1) // inserts_per_chunk

    print(f"  Table: {table_name}")
    print(f"  Total INSERT blocks: {total_inserts}")
    print(f"  Chunk size: {inserts_per_chunk} inserts")
    print(f"  Will create {total_chunks} chunks")

    if total_chunks <= 1:
        print("  Only 1 chunk needed — no split required.")
        return

    chunk_files = []
    for chunk_idx in range(total_chunks):
        chunk_num = chunk_idx + 1
        chunk_file = os.path.join(dirpath, f"{basename}_chunk_{chunk_num:03d}")
        start = chunk_idx * inserts_per_chunk
        end = min(start + inserts_per_chunk, total_inserts)
        chunk_blocks = insert_blocks[start:end]

        with open(chunk_file, 'w', encoding='utf-8') as f:
            if chunk_idx == 0:
                # First chunk: include full DDL
                f.writelines(ddl_lines)
            else:
                # Subsequent chunks: just a comment header, no DDL
                f.write(f"-- Table: {table_name} (chunk {chunk_num}/{total_chunks})\n")
                f.write(f"-- Rows {start * 5000 + 1} onward\n")
                f.write(f"USE `rois_tg_live_prod`;\n\n")

            for block in chunk_blocks:
                f.writelines(block)

        size_mb = os.path.getsize(chunk_file) // 1024 // 1024
        print(f"  -> {os.path.basename(chunk_file)}: {end - start} inserts ({size_mb}MB)")
        chunk_files.append(chunk_file)

    print(f"\nDone. {total_chunks} chunk files created.")
    print(f"Load order:")
    for cf in chunk_files:
        print(f"  mysql ... < {cf}")
    return chunk_files


def main():
    parser = argparse.ArgumentParser(description="Split large table SQL file into chunks")
    parser.add_argument("filepath", help="Path to tbl_XXXX file")
    parser.add_argument("--inserts-per-chunk", type=int, default=DEFAULT_INSERTS_PER_CHUNK,
                        help=f"INSERT blocks per chunk (default: {DEFAULT_INSERTS_PER_CHUNK})")
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"File not found: {args.filepath}")
        sys.exit(1)

    split_table_file(args.filepath, args.inserts_per_chunk)


if __name__ == '__main__':
    main()
