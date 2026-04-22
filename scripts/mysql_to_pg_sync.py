#!/usr/bin/env python3
"""
从 MySQL 读取指定表数据，在列可对齐（同名或默认别名映射）时按 PG 列顺序批量写入 PostgreSQL。

用法（建议把连接信息放在 .env 或环境变量里，勿提交真实密码到 git）：

  pip install -r scripts/requirements-mysql-pg-migrate.txt

  # 仅校验两边表结构是否一致，并打印行数
  python scripts/mysql_to_pg_sync.py --dry-run

  # 实际导入（先 flight，再 flight_composition）；仅追加 INSERT，不会在 PG 上 TRUNCATE
  python scripts/mysql_to_pg_sync.py

如需空表后全量导入，请在 PostgreSQL 侧自行对目标表执行 TRUNCATE（或等价清理）后再运行本脚本。

环境变量（也可用 .env，本仓库已忽略 .env）：

  MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASSWORD MYSQL_DATABASE
  PG_HOST PG_PORT PG_USER PG_PASSWORD PG_DATABASE
  可选：PG_SCHEMA（默认 public；若表建在业务 schema 下须显式指定，例如 f8）

  MYSQL_JDBC_URL / PG_JDBC_URL 可选，形如 jdbc:mysql://host:port/db 与 jdbc:postgresql://host:port/db

对 PG 列名在 PG_NULL_AS_ZERO_LOWER 集合内的字段：MySQL 为 NULL 时写入 0；其余列保留 NULL。

表 pairing：仅将 MySQL 主键 id 写入 PG interface_id（MySQL 表上若另有 interface_id 列可忽略，不导入）；
PG id 为自增。导入 pairing_composition 时：用 MySQL pairing_id 与 PG pairing.interface_id 匹配，将 pairing_id
改写为对应行的 PG pairing.id。
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
from dataclasses import dataclass
from collections.abc import Callable, Mapping
from typing import Any, Sequence

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    print("缺少依赖：pip install pymysql", file=sys.stderr)
    raise

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_values
except ImportError:
    print("缺少依赖：pip install psycopg2-binary", file=sys.stderr)
    raise

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]


DEFAULT_TABLES: tuple[str, ...] = ("flight", "flight_composition")

# MySQL 列名（小写）→ PostgreSQL 列名（小写）。用于两侧命名不一致时的默认映射。
DEFAULT_MYSQL_TO_PG_LOWER: dict[str, str] = {
    "created_dt": "created_at",
    "last_modified": "updated_at",
    "modified_by": "updated_by",
    # pairing：MySQL 常见为 label，PG 为 pairing_label（仅当两表均存在对应列时启用）
    "label": "pairing_label",
    # fleet：MySQL 常见为 cc_rest_facility，PG 为 restfacility
    "cc_rest_facility": "restfacility",
}

# 仅表 pairing：MySQL 主键 id → PG.interface_id；原 MySQL interface_id 列不参与（别名优先于同名映射）
PAIRING_MYSQL_EXTRA_ALIASES: dict[str, str] = {"id": "interface_id"}

# MySQL 无对应列时，写入 PG 固定整数 0（占位，避免结构检查失败）
PG_FILL_ZERO_IF_MISSING_LOWER: frozenset[str] = frozenset(
    {
        "duty_count",
        "seg_count",
        # PG crew_base 等表常见仅 PG 侧有的外键/接口列，MySQL 源无同名列时占位 0（可按业务改为导入前 SQL 填充）
        "interface_base_id",
        "interface_fleet_id",
        # PG crew_entitlement 等表常见布尔/标记列，MySQL 无同名列时占位 0
        "freezed",
    }
)

# MySQL 值为 NULL 且目标 PG 列名在此集合内时写 0；其它列仍写 NULL（避免违反 CHECK 等）
PG_NULL_AS_ZERO_LOWER: frozenset[str] = frozenset(
    {"duty_count", "seg_count", "is_deleted", "vr_add", "voyage_status", "restfacility"}
)

# resolve 返回的 mysql_keys_per_pg 中占位符：不从 MySQL 行字典按列名取值
_FILL_ZERO_SENTINEL = "__FILL_ZERO__"
_FILL_NOW_SENTINEL = "__FILL_NOW_UTC__"
_FILL_SYSTEM_SENTINEL = "__FILL_SYSTEM__"
PG_SYNTH_TIME_LOWER = frozenset({"created_at", "updated_at", "update_at"})
PG_SYNTH_BY_LOWER = frozenset({"created_by", "updated_by", "update_by"})
PG_SYNTH_BY_VALUE = "system"


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    user: str
    password: str
    database: str


def _parse_jdbc_mysql(url: str) -> tuple[str, int, str] | None:
    m = re.match(r"jdbc:mysql://([^:/]+)(?::(\d+))?/([^?]+)", url.strip(), re.I)
    if not m:
        return None
    host, port_s, db = m.group(1), m.group(2), m.group(3)
    port = int(port_s) if port_s else 3306
    return host, port, db


def _parse_jdbc_postgres(url: str) -> tuple[str, int, str] | None:
    m = re.match(r"jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?]+)", url.strip(), re.I)
    if not m:
        return None
    host, port_s, db = m.group(1), m.group(2), m.group(3)
    port = int(port_s) if port_s else 5432
    return host, port, db


def load_mysql_config() -> DbConfig:
    jdbc = os.environ.get("MYSQL_JDBC_URL", "").strip()
    if jdbc:
        parsed = _parse_jdbc_mysql(jdbc)
        if not parsed:
            raise SystemExit(f"无法解析 MYSQL_JDBC_URL: {jdbc!r}")
        host, port, database = parsed
    else:
        host = os.environ.get("MYSQL_HOST", "").strip()
        port = int(os.environ.get("MYSQL_PORT", "3306"))
        database = os.environ.get("MYSQL_DATABASE", "").strip()
    user = os.environ.get("MYSQL_USER", "").strip()
    password = os.environ.get("MYSQL_PASSWORD", "")
    if not all([host, database, user]):
        raise SystemExit(
            "请设置 MySQL 连接：MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE "
            "或 MYSQL_JDBC_URL + MYSQL_USER + MYSQL_PASSWORD"
        )
    if jdbc:
        return DbConfig(host=host, port=port, user=user, password=password, database=database)
    return DbConfig(host=host, port=port, user=user, password=password, database=database)


def load_pg_config() -> tuple[DbConfig, str]:
    jdbc = os.environ.get("PG_JDBC_URL", "").strip()
    schema = os.environ.get("PG_SCHEMA", "public").strip() or "public"
    if jdbc:
        parsed = _parse_jdbc_postgres(jdbc)
        if not parsed:
            raise SystemExit(f"无法解析 PG_JDBC_URL: {jdbc!r}")
        host, port, database = parsed
    else:
        host = os.environ.get("PG_HOST", "").strip()
        port = int(os.environ.get("PG_PORT", "5432"))
        database = os.environ.get("PG_DATABASE", "").strip()
    user = os.environ.get("PG_USER", "").strip()
    password = os.environ.get("PG_PASSWORD", "")
    if not all([host, database, user]):
        raise SystemExit(
            "请设置 PG：PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE "
            "或 PG_JDBC_URL + PG_USER + PG_PASSWORD，可选 PG_SCHEMA（默认 public）"
        )
    if jdbc:
        return DbConfig(host=host, port=port, user=user, password=password, database=database), schema
    return DbConfig(host=host, port=port, user=user, password=password, database=database), schema


def mysql_connect(cfg: DbConfig):
    return pymysql.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        database=cfg.database,
        charset="utf8mb4",
        cursorclass=DictCursor,
    )


def pg_connect(cfg: DbConfig):
    return psycopg2.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        dbname=cfg.database,
    )


def mysql_column_names(conn, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
            """,
            (table,),
        )
        rows = cur.fetchall()
    return [r["COLUMN_NAME"] for r in rows]


def pg_column_names(conn, schema: str, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [r[0] for r in cur.fetchall()]


def pg_identity_always_columns(conn, schema: str, table: str) -> frozenset[str]:
    """PG 中 GENERATED ALWAYS AS IDENTITY 的列名（插入时必须省略，由库生成）。"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.attname::text
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
            JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = %s
              AND c.relname = %s
              AND a.attnum > 0
              AND NOT a.attisdropped
              AND a.attidentity = 'a'
            """,
            (schema, table),
        )
        return frozenset(r[0] for r in cur.fetchall())


def pg_numeric_precision_by_column(conn, schema: str, table: str) -> dict[str, tuple[int, int]]:
    """PG 上 data_type=numeric 的列 -> (precision, scale)，键为小写列名。"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
              AND data_type = 'numeric'
              AND numeric_precision IS NOT NULL
              AND numeric_scale IS NOT NULL
            """,
            (schema, table),
        )
        out: dict[str, tuple[int, int]] = {}
        for name, prec, scale in cur.fetchall():
            if prec is not None and scale is not None:
                out[str(name).lower()] = (int(prec), int(scale))
        return out


def _clamp_numeric_to_pg(value: Any, precision: int, scale: int) -> Any:
    """将值限制在 DECIMAL(precision, scale) 可表示范围内，避免 numeric field overflow。"""
    if value is None:
        return None
    from decimal import Decimal, InvalidOperation

    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return value
    max_val = Decimal(10) ** (precision - scale) - Decimal(10) ** Decimal(-scale)
    min_val = -max_val
    if d > max_val:
        return max_val
    if d < min_val:
        return min_val
    return d


def resolve_mysql_keys_per_pg_column(
    mysql_cols: Sequence[str],
    pg_cols: Sequence[str],
    mysql_to_pg_lower: dict[str, str],
) -> tuple[bool, str, list[str]]:
    """
    为每个 PG 列确定要从 MySQL 读取的列名（与 information_schema 大小写一致）。
    规则：若某条别名在「当前表」上两端列都存在，则该 PG 列取对应 MySQL 列；否则按同名（忽略大小写）匹配。
    允许 MySQL 多出 PG 没有的列（跳过）；PG 列必须都有来源。
    """
    m_low_to_actual = {c.lower(): c for c in mysql_cols}
    p_low_set = {c.lower() for c in pg_cols}

    # 仅当 MySQL 源列与 PG 目标列在本表均存在时才启用该别名，避免其它表因缺列报错。
    effective: dict[str, str] = {}
    for mk, pk in mysql_to_pg_lower.items():
        if mk in m_low_to_actual and pk.lower() in p_low_set:
            effective[mk] = pk

    pg_target_to_mysql_source: dict[str, str] = {}
    for mk, pk in effective.items():
        pt = pk.lower()
        if pt in pg_target_to_mysql_source and pg_target_to_mysql_source[pt] != mk:
            return (
                False,
                f"多个 MySQL 列映射到同一 PG 列 {pk!r}: {pg_target_to_mysql_source[pt]!r} 与 {mk!r}",
                [],
            )
        pg_target_to_mysql_source[pt] = mk

    mysql_keys_per_pg: list[str] = []
    filled_zero_pg: list[str] = []
    filled_now_pg: list[str] = []
    filled_system_pg: list[str] = []
    for pc in pg_cols:
        pl = pc.lower()
        if pl in pg_target_to_mysql_source:
            src_m = pg_target_to_mysql_source[pl]
            mysql_keys_per_pg.append(m_low_to_actual[src_m])
        else:
            if pl not in m_low_to_actual:
                if pl in PG_FILL_ZERO_IF_MISSING_LOWER:
                    mysql_keys_per_pg.append(_FILL_ZERO_SENTINEL)
                    filled_zero_pg.append(pc)
                    continue
                if pl in PG_SYNTH_TIME_LOWER:
                    mysql_keys_per_pg.append(_FILL_NOW_SENTINEL)
                    filled_now_pg.append(pc)
                    continue
                if pl in PG_SYNTH_BY_LOWER:
                    mysql_keys_per_pg.append(_FILL_SYSTEM_SENTINEL)
                    filled_system_pg.append(pc)
                    continue
                return (
                    False,
                    f"PG 列 {pc!r} 在 MySQL 中无同名列，且无别名映射",
                    [],
                )
            mysql_keys_per_pg.append(m_low_to_actual[pl])

    _skip_sentinels = {_FILL_ZERO_SENTINEL, _FILL_NOW_SENTINEL, _FILL_SYSTEM_SENTINEL}
    used_m_low = {k.lower() for k in mysql_keys_per_pg if k not in _skip_sentinels}
    all_m_low = {c.lower() for c in mysql_cols}
    extras = sorted(all_m_low - used_m_low)
    applied = [f"{a}→{b}" for a, b in effective.items()]
    parts = []
    if applied:
        parts.append("已应用别名: " + ", ".join(applied))
    if filled_zero_pg:
        parts.append("MySQL 无对应列已填 0: " + ", ".join(filled_zero_pg))
    if filled_now_pg:
        parts.append("无 MySQL 同源已填 UTC 时间: " + ", ".join(filled_now_pg))
    if filled_system_pg:
        parts.append(f"无 MySQL 同源已填 {PG_SYNTH_BY_VALUE!r}: " + ", ".join(filled_system_pg))
    if extras:
        parts.append("MySQL 多出列（不会写入 PG）: " + ", ".join(extras))
    if not parts:
        parts.append("列名与顺序一致（忽略大小写）。")
    return True, " ".join(parts), mysql_keys_per_pg


def _mysql_value_or_zero(value):
    """兼容旧调用：仅对显式需要 0 的路径保留。"""
    if value is None:
        return 0
    return value


def _value_for_pg_cell(pg_col: str, value):
    pl = pg_col.lower()
    if value is None and pl in PG_NULL_AS_ZERO_LOWER:
        return 0
    return value


def row_tuple_by_mysql_keys(
    row: dict,
    mysql_keys_per_pg: Sequence[str],
    pg_cols: Sequence[str],
    *,
    numeric_bounds: dict[str, tuple[int, int]] | None = None,
) -> tuple:
    lower_to_key = {k.lower(): k for k in row.keys()}
    out: list = []
    for mk, pc in zip(mysql_keys_per_pg, pg_cols, strict=True):
        if mk == _FILL_ZERO_SENTINEL:
            out.append(0)
            continue
        if mk == _FILL_NOW_SENTINEL:
            out.append(dt.datetime.now(dt.timezone.utc))
            continue
        if mk == _FILL_SYSTEM_SENTINEL:
            out.append(PG_SYNTH_BY_VALUE)
            continue
        key = lower_to_key.get(mk.lower())
        if key is None:
            raise KeyError(f"MySQL 行缺少列 {mk!r}")
        v = _value_for_pg_cell(pc, row[key])
        if numeric_bounds:
            nb = numeric_bounds.get(pc.lower())
            if nb is not None:
                v = _clamp_numeric_to_pg(v, nb[0], nb[1])
        out.append(v)
    return tuple(out)


def count_mysql(conn, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM `{table}`")
        return int(cur.fetchone()["c"])


def _pairing_link_lookup_keys(v: Any) -> tuple[Any, ...]:
    """interface_id / pairing_id 在 MySQL 侧常为 Decimal，与 PG int 键不一致，统一可查找键。"""
    keys: list[Any] = [v]
    try:
        iv = int(v)
        if type(v) is not int or v != iv:
            keys.append(iv)
    except (TypeError, ValueError, OverflowError):
        pass
    return tuple(dict.fromkeys(keys))


def load_pairing_interface_to_pg_id(pg_conn, schema: str) -> dict[Any, Any]:
    """PG pairing：interface_id（仅存 MySQL pairing.id）-> 当前 PG pairing.id。"""
    with pg_conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT id, interface_id FROM {}.{} WHERE interface_id IS NOT NULL").format(
                sql.Identifier(schema),
                sql.Identifier("pairing"),
            )
        )
        out: dict[Any, Any] = {}
        for rid, iface in cur.fetchall():
            if iface is None:
                continue
            for k in _pairing_link_lookup_keys(iface):
                out[k] = rid
        return out


def remap_pairing_composition_pairing_id(row: dict[str, Any], iface_to_pg: Mapping[Any, Any]) -> dict[str, Any]:
    """MySQL pairing_composition.pairing_id（原 MySQL pairing.id）→ PG pairing.id（通过 interface_id 关联）。"""
    lk = {k.lower(): k for k in row}
    pk = lk.get("pairing_id")
    if not pk:
        return row
    old = row[pk]
    if old is None:
        return row
    new = None
    for k in _pairing_link_lookup_keys(old):
        new = iface_to_pg.get(k)
        if new is not None:
            break
    if new is None:
        raise KeyError(
            f"MySQL pairing_id={old!r} 在 PG pairing 中无 interface_id 对应行，无法写入 pairing_composition"
        )
    out = dict(row)
    out[pk] = new
    return out


def _crew_row_pg_not_null_defaults(row: dict[str, Any]) -> dict[str, Any]:
    """PG crew.status 为 NOT NULL（smallint）时，对 MySQL 源为 NULL 的行写入占位整数（环境变量 PG_CREW_STATUS_DEFAULT，默认 1）。"""
    lk = {k.lower(): k for k in row}
    out = dict(row)
    sk = lk.get("status")
    if sk is not None and out.get(sk) is None:
        raw = os.environ.get("PG_CREW_STATUS_DEFAULT", "1").strip() or "1"
        try:
            out[sk] = int(raw)
        except ValueError:
            out[sk] = 1
    return out


def count_pg(conn, schema: str, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
                sql.Identifier(schema),
                sql.Identifier(table),
            )
        )
        return int(cur.fetchone()[0])


def copy_table(
    mysql_conn,
    pg_conn,
    schema: str,
    table: str,
    pg_cols: Sequence[str],
    mysql_keys_per_pg: Sequence[str],
    batch_size: int,
    dry_run: bool,
    transform_row: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> int:
    if dry_run:
        return 0
    qualified = sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier(table))
    cols_sql = sql.SQL(", ").join(sql.Identifier(c) for c in pg_cols)
    ident_always = pg_identity_always_columns(pg_conn, schema, table)
    if ident_always.intersection(pg_cols):
        insert_sql = sql.SQL("INSERT INTO {} ({}) OVERRIDING SYSTEM VALUE VALUES %s").format(
            qualified, cols_sql
        )
    else:
        insert_sql = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(qualified, cols_sql)

    numeric_bounds = pg_numeric_precision_by_column(pg_conn, schema, table)
    total = 0
    with mysql_conn.cursor() as mcur, pg_conn.cursor() as pcur:
        mcur.execute(f"SELECT * FROM `{table}`")
        while True:
            batch = mcur.fetchmany(batch_size)
            if not batch:
                break
            rows = [transform_row(r) if transform_row else r for r in batch]
            values = [
                row_tuple_by_mysql_keys(r, mysql_keys_per_pg, pg_cols, numeric_bounds=numeric_bounds)
                for r in rows
            ]
            execute_values(pcur, insert_sql.as_string(pg_conn), values, page_size=batch_size)
            total += len(values)
    pg_conn.commit()
    return total


def main(argv: list[str] | None = None) -> int:
    if load_dotenv:
        load_dotenv()

    parser = argparse.ArgumentParser(description="MySQL -> PostgreSQL 表数据同步（列一致时导入）")
    parser.add_argument(
        "--tables",
        default=",".join(DEFAULT_TABLES),
        help=f"逗号分隔表名，默认 {','.join(DEFAULT_TABLES)}",
    )
    parser.add_argument("--dry-run", action="store_true", help="只比对结构并统计行数，不写 PG")
    parser.add_argument("--batch-size", type=int, default=500, help="每批插入行数")
    args = parser.parse_args(argv)

    tables = tuple(t.strip() for t in args.tables.split(",") if t.strip())
    if not tables:
        print("未指定表名", file=sys.stderr)
        return 2

    mysql_cfg = load_mysql_config()
    pg_cfg, pg_schema = load_pg_config()

    mysql_conn = mysql_connect(mysql_cfg)
    pg_conn = pg_connect(pg_cfg)
    try:
        for table in tables:
            mcols = mysql_column_names(mysql_conn, table)
            pcols_all = pg_column_names(pg_conn, pg_schema, table)
            aliases = dict(DEFAULT_MYSQL_TO_PG_LOWER)
            transform_row: Callable[[dict[str, Any]], dict[str, Any]] | None = None

            if table == "pairing":
                aliases.update(PAIRING_MYSQL_EXTRA_ALIASES)
                skip_id = pg_identity_always_columns(pg_conn, pg_schema, table)
                pcols = [c for c in pcols_all if c not in skip_id]
                print(
                    "\n说明：仅 MySQL pairing.id → PG interface_id（忽略 MySQL 原 interface_id 列）；PG id 自增（插入时省略列: "
                    + ", ".join(sorted(skip_id))
                    + "）。",
                    flush=True,
                )
            else:
                pcols = pcols_all

            if table == "pairing_composition":
                iface_map = load_pairing_interface_to_pg_id(pg_conn, pg_schema)
                if not iface_map and not args.dry_run:
                    print(
                        "警告：PG pairing 中无 interface_id 数据，pairing_id 将无法映射。请先导入 pairing。",
                        file=sys.stderr,
                    )
                transform_row = lambda r, m=iface_map: remap_pairing_composition_pairing_id(r, m or {})
            elif table == "crew":
                transform_row = _crew_row_pg_not_null_defaults

            ok, reason, mysql_keys_per_pg = resolve_mysql_keys_per_pg_column(mcols, pcols, aliases)
            print(f"\n=== 表 {table} ===")
            print(f"MySQL 列数: {len(mcols)}, PG 列数: {len(pcols)}")
            if not ok:
                print(f"结构检查未通过：{reason}", file=sys.stderr)
                return 1
            print(reason)
            n_m = count_mysql(mysql_conn, table)
            n_p_before = count_pg(pg_conn, pg_schema, table)
            print(f"MySQL 行数: {n_m}；PG 导入前行数: {n_p_before}")
            if args.dry_run:
                print("dry-run：跳过写入。")
                continue
            inserted = copy_table(
                mysql_conn,
                pg_conn,
                pg_schema,
                table,
                pcols,
                mysql_keys_per_pg,
                batch_size=args.batch_size,
                dry_run=False,
                transform_row=transform_row,
            )
            n_p_after = count_pg(pg_conn, pg_schema, table)
            print(f"本脚本写入约 {inserted} 行；PG 导入后行数: {n_p_after}")
    finally:
        mysql_conn.close()
        pg_conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
