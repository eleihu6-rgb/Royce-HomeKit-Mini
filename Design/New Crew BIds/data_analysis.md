# Dec_2025_Bids_Data.xlsx — Analysis Report
Generated: 2026-03-10

## Overview

| Item | Count |
|------|-------|
| Total rows | 14,240 |
| Distinct bid strings | 4,699 |
| Bid group type: Pairing | 12,234 |
| Bid group type: Reserve | 2,006 |

---

## 1. Missing Properties  — 11 new templates needed

These condition types appear in the data but are NOT in `bid_properties` (ids 1–29).

| # | Condition | Rows | Sample |
|---|-----------|-----:|-------|
| A | Pairing Check-Out Time | 159 | `Avoid Pairings If Pairing Check-Out Time Between 06:00 And 10:00` |
| B | Any Duty On *(date)* | 351 | `Avoid Pairings If Any Duty On Dec 15, 2025` |
| C | Any Duty On Time *(clock)* | 13 | `Avoid Pairings If Any Duty On Time < 08:00` |
| D | Any Duty On Date Between | — | `Avoid Pairings If Any Duty On Date Between Dec 11, 2025 And Dec 16, 2025` |
| E | Total Legs In Pairing | 229 | `Avoid Pairings If Total Legs In Pairing > 2 legs` |
| F | Total Legs In First Duty | — | `Avoid Pairings If Total Legs In First Duty > 3 legs` |
| G | Total Legs In Last Duty | — | `Avoid Pairings If Total Legs In Last Duty > 3 legs` |
| H | Average Daily Credit | 238 | `Avoid Pairings If Average Daily Credit < 005:00` |
| I | Any Flight Number | 65 | `Avoid Pairings If Any Flight Number 0600` |
| J | Any Leg Is Redeye | 38 | `Avoid Pairings If Any Leg Is Redeye (Counting Deadhead Legs)` |
| K | Credit Per Time Away From Base | 8 | `Award Pairings If Credit Per Time Away From Base > 75%` |

> **Note B vs C**: "Any Duty On Dec 15" = *which date* the duty falls on.
> "Any Duty On Time < 08:00" = *what time* the duty starts. Two separate properties.
>
> **Note D**: "Any Duty On Date Between X And Y" may map to same property as B with operator=Between.
>
> **Note H**: Confirm whether "Average Daily Credit" = existing id=10 "Avg Credit" or a different metric.
>
> **Note K**: param type is **percent** (e.g. 70%) — new validation_json token `"percent"` needed.

**One more spotted in samples:**
- `Any Enroute Check-In Time` (seen in Redeye samples) — needs count check.

---

## 2. Modifiers — columns or flags needed

| Modifier | Rows | Current schema | Action needed |
|----------|-----:|---------------|---------------|
| `Else Start Next Bid Group` | 542 | removed — handled by other function | ✓ skip on import |
| `Limit N` | 36 | not in schema | add `limit_n TINYINT NULL` to `crew_bids` |
| `All or Nothing` | 46 | not in schema | add `all_or_nothing TINYINT(1) NULL` to `crew_bids` |
| `Minimum N` *(Prefer Off Weekends Minimum 3)* | 69 | not in schema | add `minimum_n TINYINT NULL` to `crew_bids` |
| `Through` *(Prefer Off Friday Through Sunday)* | 17 | same as date range | normalise to param_a on import, no schema change |
| `Followed By Pairings If …` | 1 | not in schema | **MVP: skip** (1 row only) |

---

## 3. Naming clarifications needed

| Issue | Detail |
|-------|--------|
| `Pairing Total Credit` vs `Total Credit` | Both appear in data. Likely the same — map both to id=11 `Total Credit` on import. Confirm. |
| `Average Daily Credit` vs `Avg Credit` (id=10) | May be different metrics. "Average Credit" per pairing vs "Average Daily Credit". Confirm before merging. |
| `Any Duty On` vs `Departing On` | Different scope: `Departing On` = pairing departure date. `Any Duty On` = any duty within the pairing falling on a date. Keep separate. |

---

## 4. Recommended schema additions

```sql
-- New bid_properties rows (ids 30–42 suggested)
(30, 'Pairing', 'Pairing Check-Out Time',              '{"A":"time","B":"time"}',   NULL),
(31, 'Pairing', 'Duty On',                              '{"A":"list:date_or_dow"}',  'A = dates or day names; operator=Between uses param_a/param_b'),
(32, 'Pairing', 'Duty On Time',                         '{"A":"time","B":"time"}',   'Time the duty starts'),
(33, 'Pairing', 'Total Legs In Pairing',                '{"A":"int","B":"int"}',     NULL),
(34, 'Pairing', 'Total Legs In First Duty',             '{"A":"int","B":"int"}',     NULL),
(35, 'Pairing', 'Total Legs In Last Duty',              '{"A":"int","B":"int"}',     NULL),
(36, 'Pairing', 'Average Daily Credit',                 '{"A":"time","B":"time"}',   'Confirm vs id=10 Avg Credit'),
(37, 'Pairing', 'Any Flight Number',                    '{"A":"list:flight"}',       'A = comma-separated flight numbers'),
(38, 'Pairing', 'Any Leg Is Redeye',                    '{}',                        'No param; Counting Deadhead variant handled by operator'),
(39, 'Pairing', 'Credit Per Time Away From Base',       '{"A":"percent"}',           'A = percentage e.g. 70'),

-- New crew_bids columns
ALTER TABLE crew_bids
    ADD COLUMN limit_n        TINYINT UNSIGNED NULL COMMENT 'Limit N: max pairings to award',
    ADD COLUMN all_or_nothing TINYINT(1)       NULL COMMENT '1 = All or Nothing modifier on Prefer Off',
    ADD COLUMN minimum_n      TINYINT UNSIGNED NULL COMMENT 'Minimum N: used with Prefer Off Weekends Minimum N';
```

---

## 5. Import skip list

These rows are structural markers, not conditions — skip during import:

- `Pairing Bid Group`
- `Reserve Bid Group`

---

## 6. Open questions before writing import script

1. Is `Average Daily Credit` the same metric as `Avg Credit` (id=10)?
2. Is `Pairing Total Credit` the same as `Total Credit` (id=11)?
3. `Any Leg Is Redeye (Counting Deadhead Legs)` — is "Counting Deadhead" a variant (separate property) or a param?
4. `Any Duty On Date Between` — treat as `Duty On` with operator=Between, or a separate property?
5. `Credit Per Time Away From Base > 007:00` — is `007:00` a duration or `75%` a percent? Both appear. Two different sub-types?
6. Confirm: `Followed By Pairings` (1 row) — skip for MVP?
