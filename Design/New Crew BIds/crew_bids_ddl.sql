-- ============================================================
--  Crew Bids — DDL + seed data
--  Engine  : MySQL 8.0+
--  Created : 2026-03-10
--  Load    : mysql -u <user> -p <database> < crew_bids_ddl.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION';

DROP TABLE IF EXISTS crew_bids;
DROP TABLE IF EXISTS bid_properties;
DROP TABLE IF EXISTS bid_actions;

SET FOREIGN_KEY_CHECKS = 1;


-- ─────────────────────────────────────────────────────────────
--  bid_actions
-- ─────────────────────────────────────────────────────────────

CREATE TABLE bid_actions (
    id    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name  VARCHAR(20)      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO bid_actions (id, name) VALUES
(1, 'Award'),
(2, 'Avoid');


-- ─────────────────────────────────────────────────────────────
--  bid_properties
-- ─────────────────────────────────────────────────────────────

CREATE TABLE bid_properties (
    id                 SMALLINT UNSIGNED    NOT NULL AUTO_INCREMENT,
    bid_type           ENUM('Pairing','Reserve','DaysOff','Line') NOT NULL,
    property_template  VARCHAR(200)         NOT NULL,
    validation_json    JSON                 NOT NULL,
    notes              VARCHAR(300)         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_template (property_template)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ordered by usage frequency (Dec 2025 import data)
INSERT INTO bid_properties (id, bid_type, property_template, validation_json, notes) VALUES
( 1, 'Pairing', 'Landing In A',                              '{"A":"list:airport"}',                          'A = comma-separated IATA airports'),
( 2, 'Pairing', 'Pairing Number In A',                       '{"A":"list:pairing"}',                          'A = comma-separated pairing IDs'),
( 3, 'Pairing', 'Pairing Check-In Time',                     '{"A":"time","B":"time"}',                       NULL),
( 4, 'Pairing', 'Pairing Total Credit',                      '{"A":"time","B":"time"}',                       NULL),
( 5, 'Reserve', 'Short Call Type A',                         '{"A":"enum:short_call"}',                       'A = one of: CRAM CRPM PRAM PRMM PRPM RESA RESB'),
( 6, 'Pairing', 'TAFB',                                      '{"A":"time","B":"time"}',                       NULL),
( 7, 'DaysOff', 'Prefer Off A',                              '{"A":"list:date_or_dow","B":"time","C":"time"}', 'A=dates or days | B,C=time window (operator=Between)'),
( 8, 'Pairing', 'Duty Legs',                                 '{"A":"int","B":"int"}',                         NULL),
( 9, 'Pairing', 'Average Daily Credit',                      '{"A":"time","B":"time"}',                       NULL),
(10, 'Line',    'Clear Schedule and Start Next Bid Group',   '{}',                                            NULL),
(11, 'Pairing', 'Total Legs In Pairing',                     '{"A":"int","B":"int"}',                         NULL),
(12, 'DaysOff', 'Min A Consecutive Days Off',                '{"A":"int","B":"date","C":"date"}',              'A=min N days | operator=Between: B=start_date C=end_date (window in which N days must fall)'),
(13, 'Pairing', 'Pairing Check-Out Time',                    '{"A":"time","B":"time"}',                       NULL),
(14, 'DaysOff', 'Min Consecutive Days Off A',                '{"A":"int"}',                                   NULL),
(15, 'DaysOff', 'Max Consecutive Days On A',                 '{"A":"int"}',                                   NULL),
(16, 'Pairing', 'Pairing Length',                            '{"A":"int","B":"int"}',                         NULL),
(17, 'Line',    'Max Credit Window',                         '{}',                                            NULL),
(18, 'Line',    'Min Credit Window',                         '{}',                                            NULL),
(19, 'Pairing', 'Layover In A',                              '{"A":"list:airport"}',                          NULL),
(20, 'Line',    'No Same Day Pairings',                      '{}',                                            NULL),
(21, 'DaysOff', 'Min A Days Off Pattern B to C Days On',     '{"A":"int","B":"int","C":"int"}',               'A=min days off | B=min days on C=max days on (always operator=Between)'),
(22, 'Pairing', 'Layover Duration',                          '{"A":"time","B":"time"}',                       NULL),
(23, 'Pairing', 'Enroute Check-In Time',                     '{"A":"time","B":"time"}',                       NULL),
(24, 'Line',    'Waive No Same Day Duty Starts',             '{}',                                            NULL),
(25, 'Pairing', 'Any Leg Is Redeye',                         '{}',                                            'No param; Counting Deadhead variant noted at import'),
(26, 'Pairing', 'Any Flight Number A',                       '{"A":"list:flight"}',                           'A = comma-separated flight numbers e.g. 0600,0518'),
(27, 'Pairing', 'Leg With Employee Number A',                '{"A":"list:crew_id"}',                          'A = comma-separated employee numbers'),
(28, 'Pairing', 'Total Legs In First Duty',                  '{"A":"int","B":"int"}',                         NULL),
(29, 'Pairing', 'Deadhead Legs',                             '{"A":"int","B":"int"}',                         NULL),
(30, 'Pairing', 'Duty Duration',                             '{"A":"time","B":"time"}',                       NULL),
(31, 'Pairing', 'Duty Start Time',                           '{"A":"time","B":"time"}',                       'Time the duty starts'),
(32, 'Pairing', 'Departing On A',                            '{"A":"list:date_or_dow"}',                      'A = dates or day-of-week names'),
(33, 'Pairing', 'Average Daily Block Time',                  '{"A":"time","B":"time"}',                       NULL),
(34, 'Pairing', 'Credit Per Time Away From Base',            '{"A":"percent"}',                               'A = percentage e.g. 70, or time value e.g. 007:00'),
(35, 'Line',    'Forget Line A',                             '{"A":"int"}',                                   'A = line number to forget'),
(36, 'Pairing', 'Pairing Total Block Time',                  '{"A":"time","B":"time"}',                       NULL),
(37, 'Pairing', 'Duty On A',                                 '{"A":"list:date_or_dow"}',                      'Date/DOW the duty falls on; operator=Between for date range'),
(38, 'Pairing', 'Enroute Check-Out Time',                    '{"A":"time","B":"time"}',                       NULL),
(39, 'Line',    'Min Base Layover A',                        '{"A":"duration"}',                              'A = HHH:MM e.g. 013:00'),
(40, 'Pairing', 'Deadhead Day',                              '{}',                                            'Pairing contains a deadhead day'),
(41, 'Pairing', 'Sit Duration',                              '{"A":"time","B":"time"}',                       NULL),
(42, 'Pairing', 'Total Legs In Last Duty',                   '{"A":"int","B":"int"}',                         NULL),
(43, 'DaysOff', 'Shared Days Off With Employee A Min B Days','{"A":"crew_id","B":"int"}',                     'A=employee ID  B=minimum days'),
-- count = 0 in Dec 2025 data (defined, not yet used)
(44, 'Pairing', 'Duty In A',                                 '{"A":"list:airport"}',                          NULL),
(45, 'Pairing', 'Duty Legs Including Deadhead',              '{"A":"int","B":"int"}',                         NULL),
(46, 'Pairing', 'Average Pairing Credit',                    '{"A":"time","B":"time"}',                       NULL),
(47, 'Reserve', 'Reserve Day On A',                          '{"A":"list:date"}',                             'A = comma-separated dates'),
(48, 'DaysOff', 'Max Consecutive Days Off A',                '{"A":"int"}',                                   NULL),
(49, 'Pairing', 'Layover On A',                              '{"A":"list:date_or_dow"}',                      'Layover On date or DOW; operator=Between for date range');


-- ─────────────────────────────────────────────────────────────
--  crew_bids
-- ─────────────────────────────────────────────────────────────

CREATE TABLE crew_bids (
    id                 BIGINT UNSIGNED      NOT NULL AUTO_INCREMENT,
    crew_id            MEDIUMINT UNSIGNED   NOT NULL,
    bid_context        ENUM('Default','Current') NOT NULL,
    period             VARCHAR(20)          NOT NULL DEFAULT 'Dec 2025',
    layer              TINYINT UNSIGNED     NOT NULL,
    property_group_id  INT UNSIGNED         NOT NULL,
    node_id            TINYINT UNSIGNED     NOT NULL DEFAULT 1,
    and_or_or          ENUM('AND','OR')     NULL,
    action_id          TINYINT UNSIGNED     NULL,
    property_id        SMALLINT UNSIGNED    NOT NULL,
    operator           ENUM('>','<','>=','<=','=','Between') NULL,
    param_a            TEXT                 NULL,
    param_b            TEXT                 NULL,
    param_c            TEXT                 NULL,
    limit_n            TINYINT UNSIGNED     NULL     COMMENT 'Limit N: max pairings to award',
    all_or_nothing     TINYINT(1)           NULL     COMMENT '1 = All or Nothing modifier on Prefer Off',
    minimum_n          TINYINT UNSIGNED     NULL     COMMENT 'Minimum N: used with Prefer Off Weekends Minimum N',
    PRIMARY KEY (id),
    UNIQUE KEY  uk_group_node  (property_group_id, node_id),
    FOREIGN KEY fk_action      (action_id)   REFERENCES bid_actions(id),
    FOREIGN KEY fk_property    (property_id) REFERENCES bid_properties(id),
    INDEX idx_crew_context     (crew_id, bid_context),
    INDEX idx_period           (period),
    INDEX idx_layer            (crew_id, bid_context, period, layer),
    INDEX idx_group            (property_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- crew_bids rows are loaded separately via import script (Dec_2025_Bids_Data.xlsx)
