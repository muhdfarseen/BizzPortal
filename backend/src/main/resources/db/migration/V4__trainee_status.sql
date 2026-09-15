-- =============================================================================
-- V4 — Trainee status
-- =============================================================================
--
-- The LAP / Remedial module becomes Trainee status. The shape of the table does
-- not change: it was already a table of periods rather than a status column on
-- the participant, so "the trainee's current status" was always the row flagged
-- current and the closed rows were always the history. What changes is the
-- vocabulary — a trainee holds one of six statuses, not one of two tracks — and
-- the names, which are brought in line with what the rows and columns now hold.
--
-- Renamed rather than recreated, so every id, FK and existing row survives.
--
-- `regular` is deliberately not a value: a trainee holding no status is the
-- absence of a current row, exactly as "no LAP / Remedial" was. Storing it would
-- mean a row asserting that nothing is happening, and the partial unique index
-- below could then not distinguish "regular" from "unset".
-- =============================================================================

ALTER TABLE app_lap_remedial RENAME TO app_trainee_status;

ALTER TABLE app_trainee_status RENAME COLUMN intlap_remedial_id TO inttrainee_status_id;
ALTER TABLE app_trainee_status RENAME COLUMN txttrack TO txttrainee_status;
-- `txtstatus` held the row's A/C flag while `txttrack` held the value, which read
-- as though the flag were the status. The value column now says what it holds and
-- the flag is named for what it is: the state of this period.
ALTER TABLE app_trainee_status RENAME COLUMN txtstatus TO txtstate;

ALTER TABLE app_trainee_status RENAME CONSTRAINT pk_app_lap_remedial TO pk_app_trainee_status;
ALTER TABLE app_trainee_status RENAME CONSTRAINT fk_app_lap_assessment TO fk_app_trainee_status_assessment;
ALTER TABLE app_trainee_status RENAME CONSTRAINT ck_app_lap_track TO ck_app_trainee_status_value;
ALTER TABLE app_trainee_status RENAME CONSTRAINT ck_app_lap_status TO ck_app_trainee_status_state;
ALTER TABLE app_trainee_status RENAME CONSTRAINT ck_app_lap_dates TO ck_app_trainee_status_dates;

ALTER INDEX ix_app_lap_employee RENAME TO ix_app_trainee_status_employee;
ALTER INDEX uq_app_lap_open_per_employee RENAME TO uq_app_trainee_status_current_per_employee;

-- Two tracks become six statuses. Terminal statuses are stored exactly like the
-- working ones — they are the trainee's current status, not a closed period — so
-- the current-row index above keeps giving at most one status per trainee.
ALTER TABLE app_trainee_status DROP CONSTRAINT ck_app_trainee_status_value;
ALTER TABLE app_trainee_status ADD CONSTRAINT ck_app_trainee_status_value
    CHECK (txttrainee_status IN ('remedial', 'lap', 'cleared', 'discontinued', 'purged', 'resigned'));

COMMENT ON TABLE app_trainee_status IS
    'The periods during which a trainee held a status. The row with txtstate = ''A'' is the trainee''s current status; the rest are the history.';
COMMENT ON COLUMN app_trainee_status.txttrainee_status IS
    'The status held: remedial, lap, cleared, discontinued, purged or resigned.';
COMMENT ON COLUMN app_trainee_status.txtstate IS
    '''A'' while this is the trainee''s current status, ''C'' once it has been superseded.';
COMMENT ON COLUMN app_trainee_status.datestart_date IS
    'The day the trainee entered this status.';
COMMENT ON COLUMN app_trainee_status.dateclose_date IS
    'The day this status was superseded, which is the day the next one began.';

-- ── Permissions ─────────────────────────────────────────────────────────────
-- Renamed in place rather than re-seeded: the grants in app_role_permission are
-- held by permission id, so the ids must not move. Faculty are deliberately left
-- without `trainee-status.manage`, as they were without `lap-remedial.manage`.

UPDATE app_permission
SET txtpermission_code = 'trainee-status.view',
    txtlabel = 'View Trainee Status',
    txtdescription = 'See the status each trainee currently holds and how they got there'
WHERE txtpermission_code = 'lap-remedial.view';

UPDATE app_permission
SET txtpermission_code = 'trainee-status.manage',
    txtlabel = 'Manage Trainee Status',
    txtdescription = 'Change a trainee''s status and record the reason for the change'
WHERE txtpermission_code = 'lap-remedial.manage';
