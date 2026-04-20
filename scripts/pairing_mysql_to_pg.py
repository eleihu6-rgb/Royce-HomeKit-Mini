#!/usr/bin/env python3
"""
将 MySQL 的 pairing 相关表导入 PostgreSQL：

  - pairing              -> pairing
  - pairing_composition    -> pairing_composition
  - pairing_duty + pairing_duty_node + pairing_duty_segment -> pairing_segment

pairing_segment 行以 pairing_duty_segment 为主，按 pairing_duty_id 分组后按序确定
「同一 Duty 内第一个 / 最后一个航段」；pairing_duty_node 中满足命名的列仅在首段
写入 PICKUP/BRIEF 类时间、在末段写入 DEBRIEF/DROPOFF 类时间（列名与 PG 一致时直接取值）。

用法（与 mysql_to_pg_sync 相同的环境变量 / .env）：

  python scripts/pairing_mysql_to_pg.py
  python scripts/pairing_mysql_to_pg.py --dry-run

依赖：pip install -r scripts/requirements-mysql-pg-migrate.txt
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Sequence

# 与 mysql_to_pg_sync 同目录，直接 import
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import mysql_to_pg_sync as mps  # noqa: E402
from psycopg2 import sql  # noqa: E402
from psycopg2.extras import execute_values  # noqa: E402


def _lower_map(cols: Sequence[str]) -> dict[str, str]:
    return {c.lower(): c for c in cols}


def _pg_col_time_bucket(pl: str) -> str | None:
    """PG pairing_segment 列名是否视为首段/末段时间列（与 node 对齐用）。"""
    if "debrief" in pl or "dropoff" in pl or "drop_off" in pl:
        return "last"
    if "pickup" in pl or "pick_up" in pl:
        return "first"
    if "brief" in pl:
        return "first"
    return None


def _pick_segment_order_column(seg_cols: list[str]) -> str:
    lm = _lower_map(seg_cols)
    for cand in (
        "segment_seq",
        "seq",
        "leg_sequence",
        "sort_order",
        "leg_no",
        "sequence",
        "duty_segment_seq",
    ):
        if cand in lm:
            return lm[cand]
    return lm.get("id", seg_cols[0])


def _pick_duty_fk_on_segment(seg_cols: list[str]) -> str:
    lm = _lower_map(seg_cols)
    for cand in ("pairing_duty_id", "duty_id", "pairingduty_id"):
        if cand in lm:
            return lm[cand]
    raise SystemExit(
        "pairing_duty_segment 上未找到 pairing_duty_id / duty_id 类外键列，无法关联 Duty。"
    )


def _pick_node_duty_fk(node_cols: list[str]) -> str:
    lm = _lower_map(node_cols)
    for cand in ("pairing_duty_id", "duty_id", "pairingduty_id"):
        if cand in lm:
            return lm[cand]
    raise SystemExit(
        "pairing_duty_node 上未找到 pairing_duty_id / duty_id 类外键列，无法关联 Duty。"
    )


def _duty_pk_column(duty_cols: list[str]) -> str:
    lm = _lower_map(duty_cols)
    if "id" in lm:
        return lm["id"]
    raise SystemExit("pairing_duty 表未找到 id 主键列。")


def _fetch_all_dict(cur) -> list[dict[str, Any]]:
    return list(cur.fetchall())


def sync_pairing_segment_merged(
    mysql_conn,
    pg_conn,
    schema: str,
    batch_size: int,
    dry_run: bool,
) -> int:
    mseg_cols = mps.mysql_column_names(mysql_conn, "pairing_duty_segment")
    mduty_cols = mps.mysql_column_names(mysql_conn, "pairing_duty")
    mnode_cols = mps.mysql_column_names(mysql_conn, "pairing_duty_node")
    pcols = mps.pg_column_names(pg_conn, schema, "pairing_segment")

    seg_fk = _pick_duty_fk_on_segment(mseg_cols)
    node_fk = _pick_node_duty_fk(mnode_cols)
    duty_pk = _duty_pk_column(mduty_cols)
    order_col = _pick_segment_order_column(mseg_cols)

    seg_lm = _lower_map(mseg_cols)
    duty_lm = _lower_map(mduty_cols)
    node_lm = _lower_map(mnode_cols)

    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM `pairing_duty`")
        duties = {row[duty_pk]: row for row in _fetch_all_dict(cur)}

        cur.execute("SELECT * FROM `pairing_duty_node`")
        nodes_by_duty: dict[Any, dict[str, Any]] = {}
        for row in _fetch_all_dict(cur):
            dk = row.get(node_lm[node_fk.lower()])
            if dk is not None:
                nodes_by_duty[dk] = row

        order_sql = f"`{seg_fk}` ASC, `{order_col}` ASC"
        if "id" in seg_lm:
            order_sql += ", `id` ASC"
        cur.execute(f"SELECT * FROM `pairing_duty_segment` ORDER BY {order_sql}")
        segments = _fetch_all_dict(cur)

    by_duty: dict[Any, list[dict[str, Any]]] = {}
    for s in segments:
        dk = s.get(seg_lm[seg_fk.lower()])
        if dk is None:
            continue
        by_duty.setdefault(dk, []).append(s)

    qualified = sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier("pairing_segment"))
    cols_sql = sql.SQL(", ").join(sql.Identifier(c) for c in pcols)
    insert_sql = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(qualified, cols_sql)

    def build_row(seg: dict[str, Any], duty: dict[str, Any] | None, node: dict[str, Any] | None, is_first: bool, is_last: bool) -> tuple:
        out: list[Any] = []
        for pc in pcols:
            pl = pc.lower()
            v: Any = None
            if pl in seg_lm:
                v = seg.get(seg_lm[pl])
            elif duty and pl in duty_lm:
                v = duty.get(duty_lm[pl])
            bucket = _pg_col_time_bucket(pl)
            if node and bucket == "first" and is_first and pl in node_lm:
                nv = node.get(node_lm[pl])
                if nv is not None:
                    v = nv
            if node and bucket == "last" and is_last and pl in node_lm:
                nv = node.get(node_lm[pl])
                if nv is not None:
                    v = nv
            out.append(mps._value_for_pg_cell(pc, v))
        return tuple(out)

    rows_out: list[tuple] = []
    for duty_id, segs in by_duty.items():
        duty = duties.get(duty_id)
        node = nodes_by_duty.get(duty_id)
        n = len(segs)
        for i, seg in enumerate(segs):
            is_first = n == 1 or i == 0
            is_last = n == 1 or i == n - 1
            rows_out.append(build_row(seg, duty, node, is_first, is_last))

    print(
        f"pairing_segment 合并：duty 行 {len(duties)}，node 覆盖 {len(nodes_by_duty)} 个 duty，"
        f"segment 源行 {len(segments)}，写出 {len(rows_out)} 行（按 duty 内 {order_col!r} 排序）。",
        flush=True,
    )
    if dry_run:
        return 0

    total = 0
    with pg_conn.cursor() as pcur:
        for i in range(0, len(rows_out), batch_size):
            chunk = rows_out[i : i + batch_size]
            execute_values(pcur, insert_sql.as_string(pg_conn), chunk, page_size=len(chunk))
            total += len(chunk)
    pg_conn.commit()
    return total


def _sync_simple_table(
    mysql_conn,
    pg_conn,
    schema: str,
    mysql_table: str,
    pg_table: str,
    batch_size: int,
    dry_run: bool,
) -> int:
    mcols = mps.mysql_column_names(mysql_conn, mysql_table)
    pcols_all = mps.pg_column_names(pg_conn, schema, pg_table)
    aliases = dict(mps.DEFAULT_MYSQL_TO_PG_LOWER)
    transform_row = None

    if mysql_table == "pairing":
        aliases.update(mps.PAIRING_MYSQL_EXTRA_ALIASES)
        skip_id = mps.pg_identity_always_columns(pg_conn, schema, pg_table)
        pcols = [c for c in pcols_all if c not in skip_id]
        print(
            "\n说明：仅 MySQL pairing.id → PG interface_id（忽略 MySQL 原 interface_id 列）；PG id 自增（省略: "
            + ", ".join(sorted(skip_id))
            + "）。",
            flush=True,
        )
    else:
        pcols = pcols_all

    if mysql_table == "pairing_composition":
        iface_map = mps.load_pairing_interface_to_pg_id(pg_conn, schema)
        if not iface_map and not dry_run:
            print(
                "警告：PG pairing 中无 interface_id，pairing_id 将无法映射。请先导入 pairing。",
                file=sys.stderr,
            )
        transform_row = lambda r, m=iface_map: mps.remap_pairing_composition_pairing_id(r, m or {})

    ok, reason, keys = mps.resolve_mysql_keys_per_pg_column(mcols, pcols, aliases)
    print(f"\n=== {mysql_table} -> {pg_table} ===", flush=True)
    print(f"MySQL 列数: {len(mcols)}, PG 列数: {len(pcols)}", flush=True)
    if not ok:
        raise SystemExit(f"结构检查未通过：{reason}")
    print(reason, flush=True)
    n_m = mps.count_mysql(mysql_conn, mysql_table)
    n_p_before = mps.count_pg(pg_conn, schema, pg_table)
    print(f"MySQL 行数: {n_m}；PG 导入前行数: {n_p_before}", flush=True)
    if dry_run:
        print("dry-run：跳过写入。", flush=True)
        return 0
    inserted = mps.copy_table(
        mysql_conn,
        pg_conn,
        schema,
        mysql_table,
        pcols,
        keys,
        batch_size=batch_size,
        dry_run=False,
        transform_row=transform_row,
    )
    n_p_after = mps.count_pg(pg_conn, schema, pg_table)
    print(f"本表写入约 {inserted} 行；PG 导入后行数: {n_p_after}", flush=True)
    return inserted


def main(argv: list[str] | None = None) -> int:
    if mps.load_dotenv:
        mps.load_dotenv()

    parser = argparse.ArgumentParser(description="MySQL pairing 表导入 PostgreSQL（含 segment 合并）")
    parser.add_argument("--dry-run", action="store_true", help="只检查结构并统计，不写 PG")
    parser.add_argument("--batch-size", type=int, default=500, help="批量 INSERT 行数")
    args = parser.parse_args(argv)

    mysql_cfg = mps.load_mysql_config()
    pg_cfg, pg_schema = mps.load_pg_config()

    mysql_conn = mps.mysql_connect(mysql_cfg)
    pg_conn = mps.pg_connect(pg_cfg)
    try:
        _sync_simple_table(mysql_conn, pg_conn, pg_schema, "pairing", "pairing", args.batch_size, args.dry_run)
        _sync_simple_table(
            mysql_conn, pg_conn, pg_schema, "pairing_composition", "pairing_composition", args.batch_size, args.dry_run
        )
        if not args.dry_run:
            sync_pairing_segment_merged(mysql_conn, pg_conn, pg_schema, args.batch_size, dry_run=False)
        else:
            sync_pairing_segment_merged(mysql_conn, pg_conn, pg_schema, args.batch_size, dry_run=True)
    finally:
        mysql_conn.close()
        pg_conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
