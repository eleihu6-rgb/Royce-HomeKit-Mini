-- ============================================================
--  Crew Bids Database Design
--  Engine : MySQL 8.0+
--  Updated: 2026-03-10  (v5 — action extracted to bid_actions)
-- ============================================================
--
--  THREE-TABLE DESIGN
--  ─────────────────────────────────────────────────────────
--  Table 1  bid_actions    — Award / Avoid lookup
--  Table 2  bid_properties — condition templates (29 rows, no duplicates)
--  Table 3  crew_bids      — one row per condition node per rule
--
--  WHY EXTRACT THE ACTION?
--  ─────────────────────────────────────────────────────────
--  Previously bid_properties stored 13 "Award Pairings If…" and
--  13 "Avoid Pairings If…" rows — the same 13 condition types
--  duplicated for each action.  Extracting Award/Avoid to a tiny
--  lookup table collapses those 26 rows into 13, and makes the
--  action composable without touching templates.
--
--  Award vs Avoid only applies to Pairing rules.
--  Reserve, DaysOff, and Line rules always operate as "award"
--  (the crew is requesting something, never avoiding it).
--  action_id is therefore:
--    • REQUIRED on node_id=1 when bid_type='Pairing'
--    • NULL on all other rows
--
--  SIDE EFFECT — Condition templates removed
--  ─────────────────────────────────────────────────────────
--  The previous design had a parallel set of "Condition"
--  templates (ids 50-62) for chained nodes (node_id ≥ 2).
--  Those were just copies of the Pairing templates without the
--  action prefix.  Now that Pairing templates carry no action
--  prefix themselves, they serve both roles:
--    node_id=1  →  Pairing template + action_id
--    node_id≥2  →  Pairing template + no action_id  (and_or_or only)
--  bid_type='Condition' is therefore eliminated.
--
--  RESULT
--  ─────────────────────────────────────────────────────────
--    bid_properties : 55 rows → 29  (no duplicates, no Condition rows)
--    crew_bids      : gains one action_id column
-- ============================================================


-- ─────────────────────────────────────────────────────────────
--  TABLE 1 : bid_actions
-- ─────────────────────────────────────────────────────────────
--  Applies to Pairing rules only.
--  All other bid types implicitly act as "Award".
-- ─────────────────────────────────────────────────────────────

CREATE TABLE bid_actions (
    id    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name  VARCHAR(20)      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Award / Avoid lookup; used by Pairing rules only';

INSERT INTO bid_actions (id, name) VALUES
(1, 'Award'),
(2, 'Avoid');


-- ─────────────────────────────────────────────────────────────
--  TABLE 2 : bid_properties
-- ─────────────────────────────────────────────────────────────
--
--  bid_type values:
--    'Pairing'  — condition templates for Pairing rules
--                 Used for node_id=1 (with action_id) AND node_id≥2 (without).
--    'Reserve'  — Award Reserve Day On
--    'DaysOff'  — Prefer Off, Set Condition *Days*
--    'Line'     — Set Condition (other), Waive, Clear, Forget
--
--  validation_json type tokens:
--    "time"             HH:MM  (e.g. "020:00")
--    "duration"         HHH:MM (e.g. "013:00")
--    "int"              plain integer
--    "date"             "Dec 17, 2025" style string
--    "list:airport"     comma-separated IATA codes
--    "list:pairing"     comma-separated pairing IDs
--    "list:date"        comma-separated dates
--    "list:date_or_dow" dates OR day names (Mon/Fri/Weekend…)
--    "enum:short_call"  one of: CRAM CRPM PRAM PRMM PRPM RESA RESB
--    "crew_id"          employee number
--
--  When operator = 'Between':
--    param_a = lower bound
--    param_b = upper bound
--    param_c = optional 3rd value (e.g. Consecutive Days + date range)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE bid_properties (
    id                 SMALLINT UNSIGNED    NOT NULL AUTO_INCREMENT,
    bid_type           ENUM('Pairing','Reserve','DaysOff','Line') NOT NULL,
    property_template  VARCHAR(200)         NOT NULL  COMMENT 'Condition description only — no action verb',
    validation_json    JSON                 NOT NULL  COMMENT 'Expected type per param slot',
    notes              VARCHAR(300)         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_template (property_template)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='29 condition templates. Action (Award/Avoid) is in bid_actions, not here.';


-- ─────────────────────────────────────────────────────────────
--  SEED DATA  (29 rows, no Award/Avoid duplication)
-- ─────────────────────────────────────────────────────────────

INSERT INTO bid_properties (id, bid_type, property_template, validation_json, notes) VALUES

-- ── Pairing conditions  (ids 1-13)  ──────────────────────────
--  Used for both node_id=1 (+ action_id) and node_id≥2 (and_or_or only).
--  operator drives > / < / >= / <= / = / Between comparisons.
--  NULL operator means the preposition is fixed (In, On).

( 1, 'Pairing', 'Any Landing In',
      '{"A":"list:airport"}',
      'A = comma-separated IATA airports'),

( 2, 'Pairing', 'Any Duty In',
      '{"A":"list:airport"}',
      NULL),

( 3, 'Pairing', 'Any Layover In',
      '{"A":"list:airport"}',
      NULL),

( 4, 'Pairing', 'Pairing Number In',
      '{"A":"list:pairing"}',
      'A = comma-separated pairing IDs, e.g. E4102,E4105'),

( 5, 'Pairing', 'Departing On',
      '{"A":"list:date_or_dow"}',
      'A = dates or day-of-week names'),

( 6, 'Pairing', 'Any Duty Duration',
      '{"A":"time","B":"time"}',
      'operator: >/</>=/<=/=  A=value  |  Between  A=lower B=upper'),

( 7, 'Pairing', 'Any Duty Legs',
      '{"A":"int","B":"int"}',
      'operator: >/</=/>=/<=/Between'),

( 8, 'Pairing', 'Any Duty Legs Counting Deadhead',
      '{"A":"int","B":"int"}',
      NULL),

( 9, 'Pairing', 'TAFB',
      '{"A":"time","B":"time"}',
      'operator: >/</>=/<=/=/Between  A=value (B=upper when Between)'),

(10, 'Pairing', 'Average Credit',
      '{"A":"time","B":"time"}',
      NULL),

(11, 'Pairing', 'Total Credit',
      '{"A":"time","B":"time"}',
      NULL),

(12, 'Pairing', 'Pairing Length',
      '{"A":"int","B":"int"}',
      NULL),

(13, 'Pairing', 'Pairing Check-In Time',
      '{"A":"time","B":"time"}',
      NULL),

-- ── Reserve  (id 14)  ────────────────────────────────────────
(14, 'Reserve', 'Award Reserve Day On',
      '{"A":"list:date"}',
      'A = comma-separated dates; implicitly Award — no action_id needed'),

-- ── DaysOff  (ids 15-21)  ────────────────────────────────────
(15, 'DaysOff', 'Prefer Off',
      '{"A":"list:date_or_dow","B":"time","C":"time"}',
      'A=dates or days  |  B,C=time window (operator=Between)'),

(16, 'DaysOff', 'Set Condition Consecutive Days Off In A Row',
      '{"A":"int","B":"date","C":"date"}',
      'A=N days  |  operator=Between: B=start date C=end date'),

(17, 'DaysOff', 'Set Condition Minimum Days Off In A Row',
      '{"A":"int"}',
      NULL),

(18, 'DaysOff', 'Set Condition Maximum Days Off In A Row',
      '{"A":"int"}',
      NULL),

(19, 'DaysOff', 'Set Condition Maximum Days On In A Row',
      '{"A":"int"}',
      NULL),

(20, 'DaysOff', 'Set Condition Pattern Days On With Days Off',
      '{"A":"int","B":"int","C":"int"}',
      'operator=Between  A=min days on  B=max days on  C=min days off'),

(21, 'DaysOff', 'Set Condition Days Off Opposite Employee',
      '{"A":"crew_id","B":"int"}',
      'A=employee ID  B=minimum days'),

-- ── Line  (ids 22-29)  ───────────────────────────────────────
(22, 'Line', 'Set Condition Minimum Credit Window',
      '{}',
      'No params — presence of rule is the condition'),

(23, 'Line', 'Set Condition Maximum Credit Window',
      '{}',
      NULL),

(24, 'Line', 'Set Condition Minimum Base Layover',
      '{"A":"duration"}',
      'A = HHH:MM e.g. 013:00'),

(25, 'Line', 'Set Condition No Same Day Pairings',
      '{}',
      NULL),

(26, 'Reserve', 'Set Condition Short Call Type',
      '{"A":"enum:short_call"}',
      'A = one of: CRAM CRPM PRAM PRMM PRPM RESA RESB'),

(27, 'Line', 'Waive No Same Day Duty Starts',
      '{}',
      NULL),

(28, 'Line', 'Clear Schedule and Start Next Bid Group',
      '{}',
      NULL),

(29, 'Line', 'Forget Line',
      '{"A":"int"}',
      'A = line number to forget, e.g. 4');


-- ─────────────────────────────────────────────────────────────
--  TABLE 3 : crew_bids
-- ─────────────────────────────────────────────────────────────
--
--  One row = one condition node within a logical bid rule.
--  All nodes of the same rule share property_group_id.
--
--  COLUMN GUIDE
--  ─────────────────────────────────────────────────────────
--  crew_id           Employee number.
--  bid_context       'Default' = standing bid; 'Current' = period bid.
--  period            Scheduling period, e.g. 'Dec 2025'.
--  layer             Bid group number 1–24 (priority order).
--                    All rules within a layer are evaluated together by the awarding program.
--                    Same value on all nodes of the same rule.
--
--  property_group_id App-assigned integer grouping nodes of one rule.
--                    Set to LAST_INSERT_ID() after inserting node_id=1.
--
--  node_id           1 = action node (Pairing + action_id, or non-Pairing).
--                    2,3,… = additional condition nodes (Pairing templates only,
--                    no action_id, linked via and_or_or).
--
--  and_or_or         NULL for node_id=1 (no predecessor).
--                    'AND' or 'OR' for node_id ≥ 2.
--
--  action_id         → bid_actions.id  (Award=1, Avoid=2)
--                    Required for Pairing node_id=1.
--                    NULL for non-Pairing node_id=1 and all node_id≥2.
--
--  property_id       → bid_properties.id
--
--  operator          NULL for list/preposition templates (In, On).
--                    '>' | '<' | '>=' | '<=' | '=' | 'Between' otherwise.
--
--  param_a           Primary value or lower bound (Between).
--                    Comma-separated list for list-type conditions.
--  param_b           Upper bound when operator=Between; else NULL.
--  param_c           3rd value when needed (e.g. end-date on Consecutive Days).
--
-- ─────────────────────────────────────────────────────────────

CREATE TABLE crew_bids (
    id                 BIGINT UNSIGNED      NOT NULL AUTO_INCREMENT,

    -- Context / positioning  (same on every node of the same rule)
    crew_id            MEDIUMINT UNSIGNED   NOT NULL,
    bid_context        ENUM('Default','Current') NOT NULL,
    period             VARCHAR(20)          NOT NULL DEFAULT 'Dec 2025'
                                                     COMMENT 'e.g. Dec 2025, Jan 2026',
    layer              TINYINT UNSIGNED     NOT NULL COMMENT 'Bid group 1-24; all rules in a layer are evaluated together',

    -- Rule grouping & tree position
    property_group_id  INT UNSIGNED         NOT NULL COMMENT 'Links nodes of one rule; = id of its node_id=1 row',
    node_id            TINYINT UNSIGNED     NOT NULL DEFAULT 1,
    and_or_or          ENUM('AND','OR')     NULL     COMMENT 'NULL for node_id=1; AND|OR for node_id≥2',

    -- Action  (Pairing node_id=1 only; NULL everywhere else)
    action_id          TINYINT UNSIGNED     NULL     COMMENT 'bid_actions.id: 1=Award 2=Avoid; NULL for non-Pairing',

    -- Condition
    property_id        SMALLINT UNSIGNED    NOT NULL,
    operator           ENUM('>','<','>=','<=','=','Between') NULL
                                                     COMMENT 'NULL for list/fixed-preposition templates',
    param_a            TEXT                 NULL,
    param_b            TEXT                 NULL,
    param_c            TEXT                 NULL,

    PRIMARY KEY (id),
    UNIQUE KEY  uk_group_node  (property_group_id, node_id),
    FOREIGN KEY fk_action      (action_id)   REFERENCES bid_actions(id),
    FOREIGN KEY fk_property    (property_id) REFERENCES bid_properties(id),
    INDEX idx_crew_context     (crew_id, bid_context),
    INDEX idx_period           (period),
    INDEX idx_layer            (crew_id, bid_context, period, layer),
    INDEX idx_group            (property_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='One row per condition node. Nodes of the same rule share property_group_id.';


-- ─────────────────────────────────────────────────────────────
--  EXAMPLE ROWS
-- ─────────────────────────────────────────────────────────────
/*

── action_id usage at a glance ───────────────────────────────

  node_id=1, bid_type='Pairing'   → action_id required (1=Award, 2=Avoid)
  node_id=1, bid_type≠'Pairing'   → action_id = NULL  (implicitly Award)
  node_id≥2  (all types)          → action_id = NULL  (condition only)


── Example 1: "Award Pairings If TAFB > 020:00" ──────────────

  grp  node  a_o   action  prop  op   param_a
  100    1   NULL  Award(1)   9  '>'  '020:00'


── Example 2: "Avoid Pairings If Any Layover In SFO, TUS" ────

  grp  node  a_o   action   prop  op    param_a
  101    1   NULL  Avoid(2)    3  NULL  'SFO,TUS'


── Example 3: compound AND rule ──────────────────────────────

  "Award Pairings If Any Duty Duration > 008:00
                  If Any Layover In CUN, MEX, YKF"

  grp  node  a_o   action   prop  op    param_a
  102    1   NULL  Award(1)    6  '>'   '008:00'
  102    2   AND   NULL        3  NULL  'CUN,MEX,YKF'

  ↑ node 2 reuses the same Pairing template (prop=3, "Any Layover In")
    with no action_id — the action is already established by node 1.


── Example 4: user-composed OR rule ──────────────────────────

  "Award Pairings If Any Layover In SFO  OR  TAFB > 020:00"

  grp  node  a_o  action   prop  op    param_a
  103    1   NULL Award(1)    3  NULL  'SFO'
  103    2   OR   NULL        9  '>'   '020:00'


── Example 5: non-Pairing (action_id = NULL) ─────────────────

  "Prefer Off Saturday, Sunday"

  grp  node  a_o  action  prop  op    param_a
  104    1   NULL NULL     15   NULL  'Saturday,Sunday'


── Example 6: "Award Reserve Day On Dec 17, Dec 18" ──────────

  grp  node  a_o  action  prop  op    param_a
  105    1   NULL NULL     14   NULL  'Dec 17, 2025,Dec 18, 2025'


── Example 7: Between + Else Next Group ──────────────────────

  "Set Condition Consecutive Days Off Between 3 [Dec 17–Dec 18]
   Else Start Next Bid Group"

  grp  node  a_o  action  prop  op        param_a  param_b        param_c        else
  106    1   NULL NULL     16  'Between'  '3'    'Dec 17, 2025' 'Dec 18, 2025'    1


── Example 8: three chained conditions ───────────────────────

  "Award Pairings If Any Duty Duration > 008:00
                  If Any Layover In CUN
                  If TAFB < 030:00"

  grp  node  a_o   action   prop  op    param_a
  107    1   NULL  Award(1)    6  '>'   '008:00'
  107    2   AND   NULL        3  NULL  'CUN'
  107    3   AND   NULL        9  '<'   '030:00'

*/


-- ─────────────────────────────────────────────────────────────
--  APP INSERT PATTERN  (pseudo-code)
-- ─────────────────────────────────────────────────────────────
/*
  -- Step 1: insert node_id=1, use a temp property_group_id=0
  INSERT INTO crew_bids
    (crew_id, bid_context, period, layer,
     property_group_id, node_id, and_or_or,
     action_id, property_id, operator, param_a, param_b, param_c)
  VALUES
    (249, 'Current', 'Dec 2025', 1,
     0, 1, NULL,
     1, 6, '>', '008:00', NULL, NULL);

  -- Step 2: promote the new row's id to be its own group id
  SET @grp = LAST_INSERT_ID();
  UPDATE crew_bids SET property_group_id = @grp WHERE id = @grp;

  -- Step 3: insert additional nodes with the same group id
  INSERT INTO crew_bids
    (crew_id, bid_context, period, layer,
     property_group_id, node_id, and_or_or,
     action_id, property_id, operator, param_a, param_b, param_c)
  VALUES
    (249, 'Current', 'Dec 2025', 1,
     @grp, 2, 'AND',
     NULL, 3, NULL, 'CUN,MEX,YKF', NULL, NULL);
*/


-- ─────────────────────────────────────────────────────────────
--  USEFUL QUERIES
-- ─────────────────────────────────────────────────────────────

-- All rules for one crew, ordered by layer / node:
/*
SELECT
    b.layer,
    b.node_id,
    a.name            AS action,
    b.and_or_or,
    p.property_template,
    b.operator,
    b.param_a,
    b.param_b,
    b.param_c
FROM   crew_bids      b
LEFT   JOIN bid_actions    a ON a.id = b.action_id
JOIN   bid_properties p ON p.id = b.property_id
WHERE  b.crew_id     = 247
  AND  b.bid_context = 'Current'
  AND  b.period      = 'Dec 2025'
ORDER  BY b.layer, b.property_group_id, b.node_id;
*/

-- All nodes of a single rule:
/*
SELECT b.node_id, a.name AS action, b.and_or_or,
       p.property_template, b.operator, b.param_a, b.param_b
FROM   crew_bids b
LEFT   JOIN bid_actions    a ON a.id = b.action_id
JOIN   bid_properties      p ON p.id = b.property_id
WHERE  b.property_group_id = 102
ORDER  BY b.node_id;
*/


-- ─────────────────────────────────────────────────────────────
--  SCALE ESTIMATE (Dec 2025 data)
-- ─────────────────────────────────────────────────────────────
/*
  bid_actions    :      2 rows
  bid_properties :     29 rows  (13 Pairing + 1 Reserve + 7 DaysOff + 8 Line)
  crew_bids      : ~15,900 rows  (~14,240 single-node rules + ~10% with extra nodes)
*/


-- ─────────────────────────────────────────────────────────────
--  OPEN ITEMS
-- ─────────────────────────────────────────────────────────────
/*
  TODO: Generate INSERT SQL for crew_bids from Dec_2025_Bids_Data.xlsx
        — parse xlsx, map each row to (crew_id, bid_context, period, layer,
          property_group_id, node_id, and_or_or, action_id, property_id,
          operator, param_a, param_b, param_c), emit INSERT statements.

  1. bid_type mapping — confirm final classification:
       - "Set Condition Maximum Days On In A Row" → DaysOff or Line?
       - "Waive No Same Day Duty Starts"          → Line or Pairing?
       - "Prefer Off"                             → DaysOff or Line?

  2. Prefer Off date normalization — keep "Dec 1, 2025" raw strings
     or convert to YYYY-MM-DD on import?

  3. Condition templates for chained nodes — currently the 13 Pairing
     templates serve double duty (node_id=1 with action, node_id≥2 without).
     Confirm whether any chained condition type exists that is NOT in the
     Pairing list (e.g. "If Reserve Day On" as a secondary condition).
     If yes, add extra templates.

  4. and_or_or semantics — raw data "If … If …" is implicitly AND.
     Confirm whether any OR-chained rules exist in the source data.

  5. node_id=1 constraint — enforce at app level:
       bid_type='Pairing'  → action_id required (NOT NULL)
       bid_type≠'Pairing'  → action_id must be NULL
     A CHECK constraint or trigger can be added if strict DB enforcement needed.

  6. Extend bid_actions if needed — e.g. if a future rule type introduces
     a third action verb, just INSERT a new row; no schema change required.
*/
