# `validation_json` Rules — Crew Portal UI

**Source:** `bid_properties-definition-2026-03-16-063939.xlsx`
**Generated:** 2026-03-16

---

## 1. Overview

The `validation_json` column defines how the crew portal UI renders the parameter input field(s) for each bid property. Every bid property that requires a crew-supplied value carries a `validation_json` object that tells the UI:

- What **type** of data to expect (airport code, time, integer, date, etc.)
- What **format** string to enforce and display as a placeholder
- What **label** text to show above or beside each input
- How many **inputs** to render (one or two, based on the `operator` column)
- Whether the input should accept **multiple values** (a list / tag input)
- For `enum` types, the exact **option list** to populate a dropdown

`validation_json` works in tandem with the `operator` column. The operator tells the system *how* to compare the crew-supplied value against schedule data; `validation_json` tells the UI *how to collect* that value. Properties that need no input at all carry an empty object `{}`.

---

## 2. Two Schema Shapes

### Shape A — Flat object (single-type slot, operator-driven input count)

Used when all inputs share the same type. The number of visible inputs is determined at runtime by whichever operator the crew selects.

```json
{
  "type": "...",
  "format": "...",       // optional — display/validation format hint
  "label": "...",        // label for single-input operators (=, >, <, >=, <=, In)
  "label_from": "...",   // first input label when operator = Between
  "label_to": "...",     // second input label when operator = Between
  "multi": true,         // optional — input accepts a list of values (used with In)
  "min": 0,              // optional — minimum numeric value (inclusive)
  "options": [...]       // only present when type = enum
}
```

**UI rendering rules for Shape A:**

| Operator selected | Inputs shown | Labels used |
|---|---|---|
| `Between` | 2 inputs side by side | `label_from` (left) + `label_to` (right) |
| `In` | 1 multi-value input | `label` |
| `=`, `>`, `<`, `>=`, `<=` | 1 input | `label` |

- If `multi: true` is present and the operator is not `Between`, always render as a multi-value (tag / comma-separated) input.
- When the `operator` array contains **both** `Between` and single operators, the UI must dynamically switch between one-input and two-input modes as the crew changes their operator selection from the dropdown.

### Shape B — Named slots A / B / C (fixed multi-slot)

Used when a property requires inputs of **different types**. All slots are always rendered, regardless of the operator.

```json
{
  "A": { "type": "...", "format": "...", "label": "...", "multi": true },
  "B": { "type": "...", "format": "...", "label": "..." },
  "C": { "type": "...", "format": "...", "label": "..." }
}
```

**UI rendering rules for Shape B:**

- Always render **all** defined slots (A, B, C) regardless of operator.
- Each slot is an independent input with its own type, format, and label.
- Slot C is optional — some Shape B properties only define A and B.
- Used when different parameters have fundamentally different types (e.g., a date/DOW list plus two time-of-day inputs).

### How to detect which shape

| Top-level keys in the JSON object | Shape | Meaning |
|---|---|---|
| `"type"` present | **Shape A** | Single-type, operator-driven input count |
| `"A"` / `"B"` / `"C"` present | **Shape B** | Fixed multi-slot, always render all slots |
| `{}` (empty) | **Flag** | No parameter input needed |

---

## 3. All Type Definitions

| type | Meaning | UI control | Format string | Validation rule | Example value |
|---|---|---|---|---|---|
| `airport` | IATA airport code | Text input | `IATA` (3-letter) | Exactly 3 uppercase letters, no digits | `YVR` |
| `pairing` | Pairing ID | Text input | alphanumeric | Letters and digits, e.g. T450 or K4501 | `T450` |
| `credit` | Elapsed credit time | Time input | `HH:MM` | Hours 00–99, colon, minutes 00–59 | `09:30` |
| `duration` | Long elapsed duration | Time input | `HHH:MM` | Hours 000–999, colon, minutes 00–59; pad with leading zeros | `024:30` |
| `time_of_day` | Clock time of day | Time input | `HH:MM` | Hours 00–23, colon, minutes 00–59 | `14:00` |
| `int` | Integer count | Number input | integer | Whole number ≥ `min` if `min` is set | `2` |
| `percent_or_time` | Credit rate — either a percentage or a duration | Text input | `NN or HHH:MM` | A plain integer (e.g. `85`) OR a valid `HHH:MM` duration (e.g. `001:30`) | `85` or `001:30` |
| `date` | Calendar date | Date picker | `MM/DD/YYYY` | Valid calendar date with two-digit month and day, four-digit year | `12/25/2025` |
| `date_or_dow` | Calendar date or named day-of-week | Combo input | `MM/DD/YYYY` or DOW name | Valid `MM/DD/YYYY` date **or** one of: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`, `Weekends`, `Weekdays` | `Monday` or `05/15/2025` |
| `enum` | Fixed list of options | Dropdown | — | Must be exactly one of the values in the `options` array | `CRAM` |
| `crew_id` | Employee ID number | Text input | numeric | Digits only | `1032` |
| `flight` | Flight number | Text input | `4-digit` | Always 4 digits; pad with a leading zero if needed (520 → `0520`) | `0520` |

---

## 4. Format Enforcement Rules (for UI)

### `HH:MM` — `credit` and `time_of_day` types

- Two-digit hours, a literal colon, two-digit minutes.
- For `credit`: hours may be **00–99** (credit can exceed 23 hours).
- For `time_of_day`: hours must be **00–23** (clock time, never exceeds midnight).
- Minutes are always **00–59**.
- Regex: `^\d{2}:\d{2}$` with range checks applied per type.
- Display placeholder: `HH:MM`

### `HHH:MM` — `duration` type

- Three-digit hours (000–999), a literal colon, two-digit minutes (00–59).
- Must be zero-padded: duration of 24 hours 30 minutes → `024:30`.
- Regex: `^\d{3}:\d{2}$` with minutes range check.
- Display placeholder: `HHH:MM`

### `IATA` — `airport` type

- Exactly 3 uppercase ASCII letters (A–Z), no digits or punctuation.
- Auto-uppercase on input. Reject if length ≠ 3 or if any character is not A–Z.
- Display placeholder: `e.g. YVR`

### `4-digit` — `flight` type

- Always exactly 4 digits. Auto-pad with a leading zero when the crew enters a 3-digit flight number (e.g. `520` → `0520`).
- Reject anything that is not 1–4 digits, or that cannot be represented as a 4-digit zero-padded number.
- Display placeholder: `e.g. 0520`

### `MM/DD/YYYY` — `date` type

- Two-digit month (01–12), forward slash, two-digit day (01–31), forward slash, four-digit year.
- Validate as a real calendar date (e.g. reject `02/30/2025`).
- Display placeholder: `MM/DD/YYYY`

### `NN or HHH:MM` — `percent_or_time` type

- Accept either a plain integer string (e.g. `85`, `100`) representing a percentage, **or** a `HHH:MM` duration string.
- Parse: if the value contains `:`, validate as `HHH:MM`; otherwise validate as a non-negative integer.
- Display placeholder: `e.g. 85 or 001:30`

### `MM/DD/YYYY or DOW` — `date_or_dow` type

- Accept either a valid `MM/DD/YYYY` date string, or one of the 9 named tokens: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`, `Weekends`, `Weekdays`.
- Matching for named tokens should be case-insensitive but store/display in title case.
- Display placeholder: `Date or Day of Week`

---

## 5. The `operator` Column Interaction

### Decision table — Shape A

| Operator selected by crew | Number of inputs shown | Labels used |
|---|---|---|
| `=` | 1 | `label` |
| `>` | 1 | `label` |
| `<` | 1 | `label` |
| `>=` | 1 | `label` |
| `<=` | 1 | `label` |
| `Between` | 2 (side by side) | `label_from` (left input) + `label_to` (right input) |
| `In` | 1 multi-value input | `label` |

### Dynamic switching

When the `operator` array for a property contains **both** `Between` **and** one or more single-value operators (e.g. `["<", "=", ">", "Between"]`), the UI must:

1. Display a dropdown for the crew to choose the operator.
2. When `Between` is chosen: replace the single input with two side-by-side inputs labeled `label_from` and `label_to`.
3. When any other operator is chosen: show a single input labeled `label`.
4. Clear both inputs whenever the operator changes to avoid stale values.

All three labels (`label`, `label_from`, `label_to`) are always present in the `validation_json` for properties that support `Between` — the UI simply shows the appropriate ones at any given moment.

---

## 6. The `award_or_avoid` and `any_or_every` Columns

These columns control UI toggles that appear **before** the property input row. They interact with `validation_json` but are not part of it.

### `award_or_avoid`

| Value | UI behavior |
|---|---|
| `["award", "avoid"]` | Show an **Award / Avoid** toggle; crew selects one before setting parameters |
| `["award"]` | Fixed to "Award"; no toggle shown |
| `["avoid"]` | Fixed to "Avoid"; no toggle shown |
| `null` | Not applicable to this property (e.g. DaysOff, Line properties) |

### `any_or_every`

| Value | UI behavior |
|---|---|
| `["any", "every"]` | Show an **Any / Every** toggle before the property keyword |
| `["any"]` | Fixed to "Any"; no toggle shown, but the word "Any" appears in the property label |
| `["every"]` | Fixed to "Every"; no toggle shown |
| `null` | Not applicable (non-iterative property — no any/every concept) |

---

## 7. Fixed-Slot Properties (Shape B Details)

The following properties use Shape B. All slots are always rendered.

### 201 — Prefer Off (DaysOff)

```json
{
  "A": { "type": "date_or_dow", "label": "Dates / Days", "multi": true },
  "B": { "type": "time_of_day", "format": "HH:MM", "label": "Window From" },
  "C": { "type": "time_of_day", "format": "HH:MM", "label": "Window To" }
}
```

- **Slot A** — Multi-value date/DOW input: crew enters one or more dates or named days (e.g. `Monday`, `12/25/2025`).
- **Slot B** — Window start time in `HH:MM` (clock time, 00–23).
- **Slot C** — Window end time in `HH:MM` (clock time, 00–23).
- Operator `["In", "Between"]` applies to Slot A; B and C are always shown.

### 204 — Min Consecutive Days Off In Window (DaysOff)

```json
{
  "A": { "type": "int", "label": "Min Days", "min": 1 },
  "B": { "type": "date", "format": "MM/DD/YYYY", "label": "Window Start" },
  "C": { "type": "date", "format": "MM/DD/YYYY", "label": "Window End" }
}
```

- **Slot A** — Minimum number of consecutive days off (integer ≥ 1).
- **Slot B** — Window start date in `MM/DD/YYYY`.
- **Slot C** — Window end date in `MM/DD/YYYY`.

### 205 — Days Off / Days On Pattern (DaysOff)

```json
{
  "A": { "type": "int", "label": "Min Days Off", "min": 1 },
  "B": { "type": "int", "label": "Min Days On", "min": 1 },
  "C": { "type": "int", "label": "Max Days On", "min": 1 }
}
```

- **Slot A** — Minimum days off in the pattern (integer ≥ 1).
- **Slot B** — Minimum days on in the pattern (integer ≥ 1).
- **Slot C** — Maximum days on in the pattern (integer ≥ 1).
- Despite having operator `["Between"]`, this is Shape B — all three integer inputs are always shown, not split into from/to.

### 206 — Shared Days Off With Employee (DaysOff)

```json
{
  "A": { "type": "crew_id", "label": "Employee Number" },
  "B": { "type": "int", "label": "Min Shared Days", "min": 1 }
}
```

- **Slot A** — Employee ID (digits only) to share days off with.
- **Slot B** — Minimum number of shared days off (integer ≥ 1).
- Only two slots (A and B); no Slot C for this property.

---

## 8. Boolean / Flag Properties (Empty `{}`)

Properties with `validation_json = {}` require **no parameter input** from the crew. Simply selecting the property constitutes the complete bid condition. No input fields are rendered.

| id | Property | bid_type | Note |
|---|---|---|---|
| 117 | Any Leg Is Redeye | Pairing | Selecting this property is the full condition |
| 128 | Deadhead Day | Pairing | Selecting this property is the full condition |
| 401 | Max Credit Window | Line | System-level flag; no crew parameter |
| 402 | Min Credit Window | Line | System-level flag; no crew parameter |
| 403 | Clear Schedule and Start Next Bid Group | Line | System-level flag; no crew parameter |
| 404 | No Same Day Pairings | Line | System-level flag; no crew parameter |
| 405 | Waive No Same Day Duty Starts | Line | System-level flag; no crew parameter |

---

## 9. Complete Property Reference Table

All 45 data rows from the Excel file. The `validation_json summary` column gives a concise human-readable description of what the UI collects.

| id | Remastered Property | bid_type | operator | validation_json summary |
|---|---|---|---|---|
| 101 | Any Landing In Airport | Pairing | `["In"]` | airport list (multi) |
| 102 | Pairing Number | Pairing | `["In"]` | pairing ID list (multi) |
| 103 | Pairing Check-In Time | Pairing | `["<","=",">","Between"]` | time_of_day HH:MM — label: "Check-In Time" \| Between: "From" / "To" |
| 104 | Any/Every Layover In Airport | Pairing | `["In"]` | airport list (multi) |
| 105 | Pairing Total Credit | Pairing | `["<","=",">","Between"]` | credit HH:MM — label: "Credit" \| Between: "Min Credit" / "Max Credit" |
| 106 | Departing On | Pairing | `["Between","In"]` | date_or_dow (multi) — label: "Date / Day" \| Between: "From Date" / "To Date" |
| 107 | Any/Every Duty Legs | Pairing | `["<","=",">"]` | int ≥ 1 — label: "Legs" |
| 108 | Total Legs In Pairing | Pairing | `["<","=",">"]` | int ≥ 1 — label: "Legs" |
| 109 | Average Daily Credit | Pairing | `["<","=",">","Between"]` | credit HH:MM — label: "Credit" \| Between: "Min Credit" / "Max Credit" |
| 110 | Any/Every Duty On Date / Day | Pairing | `["Between","In"]` | date_or_dow (multi) — label: "Date / Day" \| Between: "From Date" / "To Date" |
| 111 | Pairing Check-Out Time | Pairing | `["<","=",">","Between"]` | time_of_day HH:MM — label: "Check-Out Time" \| Between: "From" / "To" |
| 112 | Pairing Length | Pairing | `["<","=",">","Between"]` | int ≥ 1 — label: "Days" \| Between: "Min Days" / "Max Days" |
| 113 | TAFB | Pairing | `["<",">","Between"]` | duration HHH:MM — label: "TAFB" \| Between: "Min TAFB" / "Max TAFB" |
| 114 | Any Enroute Check-In Time | Pairing | `["<","=",">","Between"]` | time_of_day HH:MM — label: "Check-In Time" \| Between: "From" / "To" |
| 115 | Any/Every Leg With Employee Number | Pairing | `["In"]` | crew_id list (multi) — label: "Employee Numbers" |
| 116 | Any Flight Number | Pairing | `["In"]` | flight 4-digit list (multi) — label: "Flight Numbers" |
| 117 | Any Leg Is Redeye | Pairing | `null` | (flag — no param) |
| 118 | Any/Every Duty Duration | Pairing | `["<",">","Between"]` | duration HHH:MM — label: "Duration" \| Between: "Min Duration" / "Max Duration" |
| 119 | Any/Every Layover Duration | Pairing | `["<",">","Between"]` | duration HHH:MM — label: "Duration" \| Between: "Min Duration" / "Max Duration" |
| 120 | Any Duty On Time | Pairing | `["<","=",">","Between"]` | time_of_day HH:MM — label: "Time" \| Between: "From" / "To" |
| 121 | Average Daily Block Time | Pairing | `["<",">"]` | credit HH:MM — label: "Block Time" (no Between) |
| 122 | Deadhead Legs | Pairing | `["<","=",">","Between"]` | int ≥ 0 — label: "Legs" \| Between: "Min Legs" / "Max Legs" |
| 123 | Any/Every Layover On Date / Day | Pairing | `["Between","In"]` | date_or_dow (multi) — label: "Date / Day" \| Between: "From Date" / "To Date" |
| 124 | Total Legs In First Duty | Pairing | `["<",">"]` | int ≥ 1 — label: "Legs" (no Between) |
| 125 | Credit Per Time Away From Base | Pairing | `["<",">"]` | percent_or_time (NN or HHH:MM) — label: "Credit Rate" |
| 126 | Any Enroute Check-Out Time | Pairing | `["<",">","Between"]` | time_of_day HH:MM — label: "Check-Out Time" \| Between: "From" / "To" |
| 127 | Pairing Total Block Time | Pairing | `["=",">","Between"]` | credit HH:MM — label: "Block Time" \| Between: "Min Block Time" / "Max Block Time" |
| 128 | Deadhead Day | Pairing | `null` | (flag — no param) |
| 129 | Any/Every Sit Length | Pairing | `["<",">","Between"]` | duration HHH:MM — label: "Sit Length" \| Between: "Min Sit Length" / "Max Sit Length" |
| 130 | Total Legs In Last Duty | Pairing | `[">"]` | int ≥ 1 — label: "Legs" |
| 201 | Prefer Off | DaysOff | `["In","Between"]` | A: date/DOW (multi) "Dates / Days" — B: time_of_day "Window From" — C: time_of_day "Window To" |
| 202 | Max Consecutive Days On | DaysOff | `null` | int ≥ 1 — label: "Max Days" |
| 203 | Min Consecutive Days Off | DaysOff | `null` | int ≥ 1 — label: "Min Days" |
| 204 | Min Consecutive Days Off In Window | DaysOff | `["In","Between"]` | A: int ≥ 1 "Min Days" — B: date "Window Start" — C: date "Window End" |
| 205 | Days Off / Days On Pattern | DaysOff | `["Between"]` | A: int "Min Days Off" — B: int "Min Days On" — C: int "Max Days On" |
| 206 | Shared Days Off With Employee | DaysOff | `["In"]` | A: crew_id "Employee Number" — B: int ≥ 1 "Min Shared Days" |
| 301 | Short Call Type | Reserve | `["In"]` | enum dropdown — options: CRAM, CRPM, PRAM, PRMM, PRPM, RESA, RESB |
| 302 | Reserve Day On | Reserve | `["In"]` | date MM/DD/YYYY list (multi) — label: "Dates" |
| 401 | Max Credit Window | Line | `null` | (flag — no param) |
| 402 | Min Credit Window | Line | `null` | (flag — no param) |
| 403 | Clear Schedule and Start Next Bid Group | Line | `null` | (flag — no param) |
| 404 | No Same Day Pairings | Line | `null` | (flag — no param) |
| 405 | Waive No Same Day Duty Starts | Line | `null` | (flag — no param) |
| 406 | Forget Line | Line | `["In"]` | int ≥ 1 — label: "Line Number" |
| 407 | Min Base Layover | Line | `["In"]` | duration HHH:MM — label: "Min Duration" |

---

## Appendix A — Shape B Slot Summary

| id | Property | Slot A | Slot B | Slot C |
|---|---|---|---|---|
| 201 | Prefer Off | date_or_dow (multi) — "Dates / Days" | time_of_day HH:MM — "Window From" | time_of_day HH:MM — "Window To" |
| 204 | Min Consecutive Days Off In Window | int ≥ 1 — "Min Days" | date MM/DD/YYYY — "Window Start" | date MM/DD/YYYY — "Window End" |
| 205 | Days Off / Days On Pattern | int ≥ 1 — "Min Days Off" | int ≥ 1 — "Min Days On" | int ≥ 1 — "Max Days On" |
| 206 | Shared Days Off With Employee | crew_id — "Employee Number" | int ≥ 1 — "Min Shared Days" | *(none)* |

---

## Appendix B — Properties That Support `Between` (Dynamic 1↔2 Input Switch)

These properties have `Between` in their operator array alongside at least one single-value operator. The UI must support dynamic switching.

| id | Property | Single-operator label | Between label_from | Between label_to |
|---|---|---|---|---|
| 103 | Pairing Check-In Time | Check-In Time | From | To |
| 105 | Pairing Total Credit | Credit | Min Credit | Max Credit |
| 109 | Average Daily Credit | Credit | Min Credit | Max Credit |
| 111 | Pairing Check-Out Time | Check-Out Time | From | To |
| 112 | Pairing Length | Days | Min Days | Max Days |
| 113 | TAFB | TAFB | Min TAFB | Max TAFB |
| 114 | Any Enroute Check-In Time | Check-In Time | From | To |
| 118 | Any/Every Duty Duration | Duration | Min Duration | Max Duration |
| 119 | Any/Every Layover Duration | Duration | Min Duration | Max Duration |
| 120 | Any Duty On Time | Time | From | To |
| 122 | Deadhead Legs | Legs | Min Legs | Max Legs |
| 126 | Any Enroute Check-Out Time | Check-Out Time | From | To |
| 127 | Pairing Total Block Time | Block Time | Min Block Time | Max Block Time |
| 129 | Any/Every Sit Length | Sit Length | Min Sit Length | Max Sit Length |

*Properties 106, 110, 123 have `["Between","In"]` only — no single-value operators, so no 1↔2 switch is needed between `Between` and a plain comparator. However the UI should still handle switching between `Between` (2-input) and `In` (1-multi-value input) modes for these.*

---

## Appendix C — `multi: true` Properties

When `multi: true` is set, the input should render as a tag input or comma-separated list field, allowing the crew to supply multiple values in a single slot.

| id | Property | type | label |
|---|---|---|---|
| 101 | Any Landing In Airport | airport | Airports |
| 102 | Pairing Number | pairing | Pairing IDs |
| 104 | Any/Every Layover In Airport | airport | Airports |
| 106 | Departing On | date_or_dow | Date / Day |
| 110 | Any/Every Duty On Date / Day | date_or_dow | Date / Day |
| 115 | Any/Every Leg With Employee Number | crew_id | Employee Numbers |
| 116 | Any Flight Number | flight | Flight Numbers |
| 123 | Any/Every Layover On Date / Day | date_or_dow | Date / Day |
| 201 (slot A) | Prefer Off | date_or_dow | Dates / Days |
| 302 | Reserve Day On | date | Dates |
