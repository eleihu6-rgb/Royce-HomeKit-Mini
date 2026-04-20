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
import datetime as dt
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


_MERGE_NODE_SLOTS = 3

# MySQL pairing_duty 列（小写）→ PG pairing_segment 上 duty_* 列（小写）
_DUTY_MYSQL_TO_PG: tuple[tuple[str, str], ...] = (
    ("str_arp", "duty_str_arp"),
    ("end_arp", "duty_end_arp"),
    ("act_str_dt_utc", "duty_act_str_dt_utc"),
    ("act_end_dt_utc", "duty_act_end_dt_utc"),
    ("hotel_id", "duty_hotel_id"),
    ("assignment", "duty_assignment"),
    ("brief_min", "duty_brief_min"),
    ("debrief_min", "duty_debrief_min"),
    ("min_rest_min", "duty_sch_rest_min"),
    ("act_rest_min", "duty_act_rest_min"),
    ("plan_flight_min", "duty_sch_flt_min"),
    ("plan_fdp_min", "duty_sch_fdp_min"),
    ("act_flight_min", "duty_act_flt_min"),
    ("act_fdp_min", "duty_act_fdp_min"),
    ("actual_duty_minutes", "duty_act_duty_min"),
    ("credited_minutes", "duty_act_credited_minutes"),
    ("sch_credited_minutes", "duty_sch_credited_minutes"),
    ("sch_fm_credited_minutes", "duty_sch_fm_credited_minutes"),
    ("fm_credited_minutes", "duty_act_fm_credited_minutes"),
    ("ref_tz", "duty_ref_tz"),
    ("etr_tz", "duty_etr_tz"),
    ("acc_state", "duty_acc_state"),
    ("layover_nits", "duty_layover_nits"),
    ("fdp_discretion_min", "duty_fdp_discretion_min"),
    ("max_fdp_min", "duty_max_fdp_min"),
    ("wp_adjustment", "duty_wp_adjustment"),
    ("pln_wp_min", "duty_sch_wp_min"),
    ("act_wp_min", "duty_act_wp_min"),
    ("act_dp_min", "duty_act_dp_min"),
    ("training_add_time", "duty_training_add_time"),
    ("is_manual_modify", "duty_is_manual_modify"),
    ("is_manual_max_fdp", "duty_is_manual_max_fdp"),
    ("discretion_type", "duty_discretion_type"),
    ("comments", "duty_comments"),
)


def _ensure_utc(val: Any) -> Any:
    if isinstance(val, dt.datetime) and val.tzinfo is None:
        return val.replace(tzinfo=dt.timezone.utc)
    return val


def _duty_row_to_pg_fields(duty: dict[str, Any], duty_lm: dict[str, str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for mk, pk in _DUTY_MYSQL_TO_PG:
        if mk not in duty_lm:
            continue
        out[pk] = duty.get(duty_lm[mk])
    out["duty_sch_str_dt_utc"] = out.get("duty_act_str_dt_utc")
    out["duty_sch_end_dt_utc"] = out.get("duty_act_end_dt_utc")
    # MySQL 侧大量 acc_state 为 NULL，PG 为 NOT NULL；与常见非空取值一致占位为 D
    if out.get("duty_acc_state") is None:
        out["duty_acc_state"] = "D"
    return out


def _segment_row_to_pg_fields(
    seg: dict[str, Any],
    seg_lm: dict[str, str],
    iface_map: dict[Any, int],
) -> dict[str, Any]:
    by_low: dict[str, Any] = {}
    for low, act in seg_lm.items():
        by_low[low] = seg.get(act)

    out: dict[str, Any] = {}
    for low in (
        "flt_id",
        "flt_dt",
        "duty_seq",
        "seg_seq",
        "airline",
        "flt_num",
        "dep_arp",
        "arv_arp",
        "act_str_dt_utc",
        "act_end_dt_utc",
        "is_deleted",
        "is_long_transit",
    ):
        if low in by_low:
            out[low] = by_low[low]

    if "assignment" in by_low:
        out["seg_assignment"] = by_low["assignment"]
    if "fleet" in by_low:
        out["fleet_seg"] = by_low["fleet"]
    if "wp_mins" in by_low:
        out["wp_mins_seg"] = by_low["wp_mins"]
    if "credited_minutes" in by_low:
        out["act_credited_minutes_seg"] = by_low["credited_minutes"]
    if "fm_credited_minutes" in by_low:
        out["act_fm_credited_minutes_seg"] = by_low["fm_credited_minutes"]
    if "sch_credited_minutes" in by_low:
        out["sch_credited_minutes_seg"] = by_low["sch_credited_minutes"]
    if "sch_fm_credited_minutes" in by_low:
        out["sch_fm_credited_minutes_seg"] = by_low["sch_fm_credited_minutes"]

    ast = out.get("act_str_dt_utc")
    aend = out.get("act_end_dt_utc")
    out["sch_str_dt_utc"] = ast
    out["sch_end_dt_utc"] = aend

    if not out.get("flt_num"):
        out["flt_num"] = ""

    pid = by_low.get("pairing_id")
    resolved: int | None = None
    for k in mps._pairing_link_lookup_keys(pid):
        if k in iface_map:
            resolved = iface_map[k]
            break
    if resolved is not None:
        out["pairing_id"] = resolved
    elif pid is not None:
        try:
            out["pairing_id"] = int(pid)
        except (TypeError, ValueError):
            out["pairing_id"] = pid
    else:
        out["pairing_id"] = None

    if "created_dt" in by_low:
        out["created_at"] = by_low["created_dt"]
    if "last_modified" in by_low:
        out["updated_at"] = by_low["last_modified"]
    if "created_by" in by_low:
        out["created_by"] = by_low["created_by"]
    if "modified_by" in by_low:
        out["updated_by"] = by_low["modified_by"]

    return out


def _flatten_duty_nodes_to_pg(
    node_rows: list[dict[str, Any]],
    node_lm: dict[str, str],
    duty: dict[str, Any] | None,
    duty_lm: dict[str, str],
) -> dict[str, Any]:
    """将 pairing_duty_node 多行折叠为 PG pairing_segment 上 pickup_*/brief_*/debrief_*/dropoff_* 列。"""
    out: dict[str, Any] = {}
    seq_k = node_lm.get("sequence") or node_lm.get("seq")
    id_k = node_lm.get("id")
    gid_k = node_lm.get("group_id")
    node_k = node_lm.get("node")
    ap_k = node_lm.get("airport")
    st_k = node_lm.get("start_utc")
    en_k = node_lm.get("end_utc")

    def _sort_key(r: dict[str, Any]) -> tuple[int, int]:
        s, ii = r.get(seq_k), r.get(id_k)
        try:
            si = int(s) if s is not None else 0
        except (TypeError, ValueError):
            si = 0
        try:
            ij = int(ii) if ii is not None else 0
        except (TypeError, ValueError):
            ij = 0
        return (si, ij)

    rows = sorted(node_rows, key=_sort_key)
    seen_gid: list[Any] = []
    for r in rows:
        gid = r.get(gid_k) if gid_k else None
        if gid is not None and gid not in seen_gid:
            seen_gid.append(gid)
    if not seen_gid:
        seen_gid = [None]
    gid_to_slot = {g: i + 1 for i, g in enumerate(seen_gid[:_MERGE_NODE_SLOTS])}

    for r in rows:
        gid = r.get(gid_k) if gid_k else None
        slot = gid_to_slot.get(gid)
        if slot is None and seen_gid:
            slot = gid_to_slot.get(seen_gid[0], 1)
        if slot is None:
            slot = 1
        slot = min(max(int(slot), 1), _MERGE_NODE_SLOTS)

        kind = str(r.get(node_k) if node_k else "").strip().upper()
        ap = r.get(ap_k) if ap_k else None
        st = r.get(st_k) if st_k else None
        en = r.get(en_k) if en_k else None

        if kind == "PICKUP":
            out.setdefault(f"pickup_{slot}_start_utc", st)
            out.setdefault(f"pickup_{slot}_end_utc", en)
        elif kind == "BRIEF":
            out.setdefault(f"brief_{slot}_airport", ap)
            out.setdefault(f"brief_{slot}_start_utc", st)
            out.setdefault(f"brief_{slot}_end_utc", en)
        elif kind == "DEBRIEF":
            out.setdefault(f"debrief_{slot}_airport", ap)
            out.setdefault(f"debrief_{slot}_start_utc", st)
            out.setdefault(f"debrief_{slot}_end_utc", en)
        elif kind == "DROPOFF":
            out.setdefault(f"dropoff_{slot}_start_utc", st)
            out.setdefault(f"dropoff_{slot}_end_utc", en)

    time_suffixes: dict[str, tuple[str, ...]] = {
        "pickup": ("start_utc", "end_utc"),
        "brief": ("airport", "start_utc", "end_utc"),
        "debrief": ("airport", "start_utc", "end_utc"),
        "dropoff": ("start_utc", "end_utc"),
    }
    for slot in (2, 3):
        for kind, suf_list in time_suffixes.items():
            for suf in suf_list:
                key = f"{kind}_{slot}_{suf}"
                k1 = f"{kind}_1_{suf}"
                if out.get(key) is None and out.get(k1) is not None:
                    out[key] = out[k1]

    if duty:
        ast = duty.get(duty_lm["act_str_dt_utc"]) if "act_str_dt_utc" in duty_lm else None
        aen = duty.get(duty_lm["act_end_dt_utc"]) if "act_end_dt_utc" in duty_lm else None
        sar = duty.get(duty_lm["str_arp"]) if "str_arp" in duty_lm else None
        ear = duty.get(duty_lm["end_arp"]) if "end_arp" in duty_lm else None
        fb_air = sar or ear or ""
        db_air = ear or sar or fb_air
        for slot in (1, 2, 3):
            out.setdefault(f"pickup_{slot}_start_utc", ast)
            out.setdefault(f"pickup_{slot}_end_utc", ast)
            out.setdefault(f"brief_{slot}_airport", fb_air)
            out.setdefault(f"brief_{slot}_start_utc", ast)
            out.setdefault(f"brief_{slot}_end_utc", ast)
            out.setdefault(f"debrief_{slot}_airport", db_air)
            out.setdefault(f"debrief_{slot}_start_utc", aen)
            out.setdefault(f"debrief_{slot}_end_utc", aen)
            out.setdefault(f"dropoff_{slot}_start_utc", aen)
            out.setdefault(f"dropoff_{slot}_end_utc", aen)

    return out


def _tuple_for_pg_row(pcols: Sequence[str], merged: dict[str, Any]) -> tuple[Any, ...]:
    out: list[Any] = []
    for pc in pcols:
        pl = pc.lower()
        v: Any = merged.get(pl)
        v = _ensure_utc(v)
        if v is None and pl in mps.PG_SYNTH_TIME_LOWER:
            v = dt.datetime.now(dt.timezone.utc)
        if v is None and pl in mps.PG_SYNTH_BY_LOWER:
            v = mps.PG_SYNTH_BY_VALUE
        out.append(mps._value_for_pg_cell(pc, v))
    return tuple(out)


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
    pcols_all = mps.pg_column_names(pg_conn, schema, "pairing_segment")
    skip_id = mps.pg_identity_always_columns(pg_conn, schema, "pairing_segment")
    pcols = [c for c in pcols_all if c not in skip_id]
    if skip_id:
        print(
            "说明：pairing_segment 插入时省略 PG GENERATED ALWAYS 列: "
            + ", ".join(sorted(skip_id))
            + "（由库生成）。",
            flush=True,
        )

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
        nodes_by_duty: dict[Any, list[dict[str, Any]]] = {}
        for row in _fetch_all_dict(cur):
            dk = row.get(node_lm[node_fk.lower()])
            if dk is not None:
                nodes_by_duty.setdefault(dk, []).append(row)

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

    iface_map = mps.load_pairing_interface_to_pg_id(pg_conn, schema) or {}

    seg_seq_col = seg_lm.get("seg_seq")

    rows_out: list[tuple[Any, ...]] = []
    for duty_id, segs in by_duty.items():
        duty = duties.get(duty_id)
        node_list = nodes_by_duty.get(duty_id) or []
        duty_pg = _duty_row_to_pg_fields(duty, duty_lm) if duty else {}
        node_pg = _flatten_duty_nodes_to_pg(node_list, node_lm, duty, duty_lm)
        for j, seg in enumerate(segs, start=1):
            seg_use = dict(seg)
            if seg_seq_col:
                # MySQL 侧同一 duty 下偶发重复 seg_seq，PG uq_pair_seg 要求 (pairing_id,duty_seq,seg_seq) 唯一
                seg_use[seg_seq_col] = j
            seg_pg = _segment_row_to_pg_fields(seg_use, seg_lm, iface_map)
            merged: dict[str, Any] = {**duty_pg, **node_pg, **seg_pg}
            rows_out.append(_tuple_for_pg_row(pcols, merged))

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
    parser.add_argument(
        "--only-segment",
        action="store_true",
        help="仅合并导入 pairing_segment（跳过 pairing、pairing_composition）",
    )
    args = parser.parse_args(argv)

    mysql_cfg = mps.load_mysql_config()
    pg_cfg, pg_schema = mps.load_pg_config()

    mysql_conn = mps.mysql_connect(mysql_cfg)
    pg_conn = mps.pg_connect(pg_cfg)
    try:
        if not args.only_segment:
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
