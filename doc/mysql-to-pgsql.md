# MySQL → PostgreSQL 数据导入说明

本文档说明仓库内 MySQL 到 PostgreSQL 的导入脚本、连接配置及列映射规则。连接信息请使用环境变量或本地 `.env`（勿提交密码到 git）。

## 依赖与安装

```bash
pip install -r scripts/requirements-mysql-pg-migrate.txt
```

依赖：`pymysql`、`psycopg2-binary`、`python-dotenv`。

## 脚本一览

| 脚本 | 用途 |
|------|------|
| `scripts/mysql_to_pg_sync.py` | 通用表导入：按 PG 列顺序从 MySQL 读行，`execute_values` 批量写入；支持别名、缺列默认、`pairing` / `pairing_composition` 特例。 |
| `scripts/pairing_mysql_to_pg.py` | `pairing`、`pairing_composition` 与 `pairing_segment` 合并导入（逻辑与主脚本中的 pairing 部分对齐，segment 为 duty+node+segment 合并）。 |

## 连接配置（环境变量）

| 变量 | 说明 |
|------|------|
| `MYSQL_JDBC_URL` | 可选。形如 `jdbc:mysql://host:port/database` |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` | 未使用 JDBC 时填写 |
| `MYSQL_USER` / `MYSQL_PASSWORD` | MySQL 账号 |
| `PG_JDBC_URL` | 可选。形如 `jdbc:postgresql://host:port/database` |
| `PG_HOST` / `PG_PORT` / `PG_DATABASE` | 未使用 JDBC 时填写 |
| `PG_USER` / `PG_PASSWORD` | PostgreSQL 账号 |
| `PG_SCHEMA` | 目标 schema，默认 `public`；业务库常为 `f8` |

也可使用 `python-dotenv` 加载仓库根目录下的 `.env`（`.gitignore` 已忽略）。

## `mysql_to_pg_sync.py` 用法

```bash
# 仅校验列对齐与行数，不写库
python scripts/mysql_to_pg_sync.py --dry-run

# 指定表（逗号分隔）；默认表为 flight,flight_composition
python scripts/mysql_to_pg_sync.py --tables pairing,pairing_composition

# 批量大小（默认 500）
python scripts/mysql_to_pg_sync.py --batch-size 1000
```

写入策略：**追加 INSERT**；脚本**不会**对 PG 执行 `TRUNCATE`。全量重导前请在 PG 侧自行清空目标表。

## 列对齐总规则

1. **同名映射**（忽略大小写）：PG 列名若在 MySQL 中存在同名列，则直接取该列值。
2. **全局别名**（见下表「默认 MySQL → PG 映射」）：仅当 **MySQL 源列与 PG 目标列在当前表均存在** 时启用该条映射。
3. **PG 独有列**：按下列优先级填充，否则报错退出：
   - 在 `PG_FILL_ZERO_IF_MISSING_LOWER` 中 → 固定写入整数 **0**；
   - 在 `PG_SYNTH_TIME_LOWER` 中 → **UTC 当前时间**（按行生成）；
   - 在 `PG_SYNTH_BY_LOWER` 中 → 字符串 **`system`**。
4. **MySQL 多出列**：不写入 PG，仅在日志中提示「MySQL 多出列」。

## 默认 MySQL → PG 列映射（`DEFAULT_MYSQL_TO_PG_LOWER`）

表中为 **MySQL 列名（逻辑小写）→ PG 列名（逻辑小写）**。仅当两边当前表都存在对应列时生效。

| MySQL 列 | PostgreSQL 列 | 说明 |
|----------|-----------------|------|
| `created_dt` | `created_at` | 审计时间 |
| `last_modified` | `updated_at` | 审计时间 |
| `modified_by` | `updated_by` | 审计人 |
| `label` | `pairing_label` | 多用于 `pairing` |
| `cc_rest_facility` | `restfacility` | 多用于 `fleet` |

## 仅 `pairing` 表额外映射（`PAIRING_MYSQL_EXTRA_ALIASES`）

| MySQL 列 | PostgreSQL 列 | 说明 |
|----------|-----------------|------|
| `id` | `interface_id` | **仅写入 MySQL 主键 `id`**；MySQL 上若另有 `interface_id` 列，**不参与导入**（别名优先于同名）。 |
| （省略） | `id`（PG） | PG 上为 **`GENERATED ALWAYS AS IDENTITY` 时，插入语句中省略该列**，由数据库生成新主键。 |

导入 **`pairing_composition`** 时：

1. 从 PG 读取 `SELECT id, interface_id FROM {schema}.pairing WHERE interface_id IS NOT NULL`。
2. 建立 **「interface_id → PG 的 id」** 映射（兼容 MySQL 侧 `Decimal` 与 `int` 键）。
3. 对每行 MySQL 数据，将 **`pairing_id`** 替换为上述映射得到的 **PG `pairing.id`**（原 `pairing_id` 表示 MySQL 中的 pairing 主键）。

**导入顺序**：应先成功导入 `pairing`，再导入 `pairing_composition`。

## PG 缺列固定填 0（`PG_FILL_ZERO_IF_MISSING_LOWER`）

MySQL **无**对应列时，下列 PG 列仍写入 **0**（占位，避免 NOT NULL 失败）：

| PG 列名 |
|---------|
| `duty_count` |
| `seg_count` |

## MySQL 为 NULL 时改写为 0（`PG_NULL_AS_ZERO_LOWER`）

下列 PG 列：若从 MySQL 取到的值为 **NULL**，则写入 **0**（其它列的 NULL 仍按 NULL 写入，以减少 CHECK 约束等问题）：

| PG 列名 |
|---------|
| `duty_count` |
| `seg_count` |
| `is_deleted` |
| `vr_add` |
| `voyage_status` |
| `restfacility` |

## 审计类缺列默认值（合成列）

当 PG 存在下列列名且 MySQL 当前表无同源列、且无上述「填 0」规则时：

| PG 列名模式 | 写入值 |
|-------------|--------|
| `created_at`、`updated_at`、`update_at` | 当前 **UTC** 时间 |
| `created_by`、`updated_by`、`update_by` | 字符串 **`system`** |

## 主键与 `OVERRIDING SYSTEM VALUE`

若某表插入列中包含 PostgreSQL **`GENERATED ALWAYS AS IDENTITY`** 的列（且未对 `pairing` 做省略处理时），`INSERT` 会使用 **`OVERRIDING SYSTEM VALUE`** 以允许写入显式主键。当前 **`pairing`** 通过 **省略 `id` 列** 避免与自增策略冲突。

## `pairing_mysql_to_pg.py` 摘要

- 依次处理：`pairing` → `pairing_composition` → **`pairing_segment` 合并**（MySQL：`pairing_duty`、`pairing_duty_node`、`pairing_duty_segment`）。
- `pairing` / `pairing_composition` 与 `mysql_to_pg_sync.py` 中逻辑对齐（含 `interface_id`、`pairing_id` 映射）。
- `pairing_segment`：以 segment 为主行，按 `pairing_duty_id` 分组、组内排序；首段叠加 node 上 **pickup/brief** 相关列，末段叠加 **debrief/dropoff** 相关列（列名需与 PG 一致）；NULL 等按主脚本中的 `_value_for_pg_cell` 规则处理。

## 运维建议

1. **重导前**：对依赖外键的子表先 `TRUNCATE`，再父表；或使用 `TRUNCATE ... CASCADE`（按你库中约束调整）。
2. **重复执行**：未清空目标表时会产生重复行或主键/唯一约束冲突。
3. **Schema**：非 `public` 时务必设置 `PG_SCHEMA`（例如 `f8`）。

## 与代码的对应关系

| 文档概念 | 代码位置（约） |
|----------|----------------|
| 默认别名 | `DEFAULT_MYSQL_TO_PG_LOWER` |
| pairing 额外别名 | `PAIRING_MYSQL_EXTRA_ALIASES` |
| 缺列填 0 / 合成列 / NULL→0 | `PG_FILL_ZERO_IF_MISSING_LOWER`、`PG_SYNTH_*`、`PG_NULL_AS_ZERO_LOWER` |
| 列解析 | `resolve_mysql_keys_per_pg_column` |
| 行组装与插入 | `row_tuple_by_mysql_keys`、`copy_table` |
| pairing 映射加载与改写 | `load_pairing_interface_to_pg_id`、`remap_pairing_composition_pairing_id`、`_pairing_link_lookup_keys` |

修改映射时请以 **`scripts/mysql_to_pg_sync.py`** 为准，并同步更新本文档。
