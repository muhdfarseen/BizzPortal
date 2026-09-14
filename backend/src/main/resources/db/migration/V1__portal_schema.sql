-- =============================================================================
-- V1 — Portal-owned tables (LOCATION, BATCH, LEARNING_GROUP, PARTICIPANT)
-- =============================================================================
--
-- These four tables are OWNED BY THE EXISTING TECHNICAL ASSESSMENT PORTAL. This
-- application reads them and never writes to them, so their structure is
-- reproduced here exactly as supplied by the portal DBA and must not be
-- "improved": no columns are renamed, added or dropped, and no cross-table
-- foreign keys are declared (the portal does not declare them, and adding them
-- would make a portal data load fail on rows that predate our deployment).
--
-- Every statement is IF NOT EXISTS, so where the portal already owns these
-- tables this migration is a no-op and Flyway simply records it as applied.
-- That is what allows the same artifact to run against a developer database and
-- against the production portal database.
--
-- Oracle -> PostgreSQL type mapping applied consistently across this file:
--
--   Oracle NUMBER(22)   -> bigint        (surrogate keys and id references)
--   Oracle VARCHAR2(n)  -> varchar(n)
--   Oracle CHAR(1)      -> varchar(1)    (status flags; avoids CHAR blank padding)
--   Oracle DATE         -> date          (these columns are date-only, not timestamps)
--
-- Indexes are additive and safe: they speed up the reads this application makes
-- without altering the tables' logical structure.
-- =============================================================================

CREATE TABLE IF NOT EXISTS location (
    txtlocation_id   varchar(4)  NOT NULL,
    txtlocation_name varchar(25) NOT NULL,
    CONSTRAINT pk_location PRIMARY KEY (txtlocation_id)
);

CREATE TABLE IF NOT EXISTS batch (
    intbatch_id          bigint       NOT NULL,
    txtstatus            varchar(1),
    txtbatch_type        varchar(45),
    txtremarks           varchar(200),
    txtpremapped         varchar(10),
    intprogramtype_id    bigint,
    intbatching_number   bigint,
    txtbatch_name        varchar(45),
    datebatch_start_date date,
    datebatch_end_date   date,
    txtilp_location_id   varchar(3),
    intduration          bigint,
    intjoining_number    bigint,
    CONSTRAINT pk_batch PRIMARY KEY (intbatch_id)
);

CREATE TABLE IF NOT EXISTS learning_group (
    intlg_id       bigint      NOT NULL,
    txtlg_name     varchar(45),
    txtstatus      varchar(1),
    txtlg_type     varchar(45),
    dateend_date   date,
    datestart_date date,
    intstream_id   bigint,
    intbatch_id    bigint,
    txtlocation_id varchar(10),
    CONSTRAINT pk_learning_group PRIMARY KEY (intlg_id)
);

CREATE TABLE IF NOT EXISTS participant (
    intparticipant_id   bigint       NOT NULL,
    txtreference_id     varchar(45),
    txtrecruit_branch   varchar(45),
    dateilp_date        date,
    txtphase_id         varchar(5),
    intstatus_id        bigint,
    intbatch_id         bigint,
    intlg_id            bigint,
    txtparticipant_name varchar(200),
    intemployee_id      bigint,
    intstream_id        bigint,
    CONSTRAINT pk_participant PRIMARY KEY (intparticipant_id)
);

-- Indexes for the access paths this application uses: the filter bar walks
-- location -> batch -> LG -> participant, and the upload matches on employee id.
CREATE INDEX IF NOT EXISTS ix_batch_location ON batch (txtilp_location_id);
CREATE INDEX IF NOT EXISTS ix_learning_group_batch ON learning_group (intbatch_id);
CREATE INDEX IF NOT EXISTS ix_learning_group_location ON learning_group (txtlocation_id);
CREATE INDEX IF NOT EXISTS ix_participant_batch ON participant (intbatch_id);
CREATE INDEX IF NOT EXISTS ix_participant_lg ON participant (intlg_id);
CREATE INDEX IF NOT EXISTS ix_participant_employee ON participant (intemployee_id);
