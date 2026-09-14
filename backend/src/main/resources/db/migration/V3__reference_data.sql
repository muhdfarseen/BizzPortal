-- =============================================================================
-- V3 — Reference data
-- =============================================================================
--
-- Roles, permissions and their grants are part of the application's definition:
-- the security code checks permission codes by name, so these rows are required
-- for the service to function at all. The default CEFR mapping and the three
-- assessments are the values the portal ships with and that admins then edit.
--
-- Ids are given explicitly so the grants below can reference them, and each
-- identity sequence is then advanced past the seeded rows so ordinary inserts
-- continue without colliding.
-- =============================================================================

-- ── Permissions ─────────────────────────────────────────────────────────────
-- Codes are the contract with the frontend (see core/models/user.model.ts).

INSERT INTO app_permission (intpermission_id, txtpermission_code, txtlabel, txtdescription, intsort_order) VALUES
    (1, 'dashboard.view',       'Dashboard',                  'View trainee counts, batch totals and the distribution chart', 1),
    (2, 'assessments.view',     'View Assessments',           'Search trainee groups and read their assessment results',      2),
    (3, 'assessments.edit',     'Record Assessment Results',  'Enter and correct trainee scores and CEFR levels',             3),
    (4, 'lap-remedial.view',    'View LAP / Remedial',        'See which trainees are on a LAP or Remedial track',            4),
    (5, 'lap-remedial.manage',  'Manage LAP / Remedial',      'Move trainees onto a track and close the tracks they complete', 5),
    (6, 'reports.view',         'Reports',                    'View and export benchmark and scorecard reports',              6),
    (7, 'users.manage',         'User Management',            'Create, edit and remove portal users and assign their roles',   7),
    (8, 'configuration.manage', 'Exam Configuration',         'Create and edit the exams trainees are assessed against',       8);

-- ── Roles ───────────────────────────────────────────────────────────────────

INSERT INTO app_role (introle_id, txtrole_code, txtrole_name, txtdescription, txtscope, intsort_order) VALUES
    (1, 'superadmin',      'Super Admin',     'Full access to every location, plus user management and exam configuration.', 'all',                 1),
    (2, 'program-manager', 'Program Manager', 'Access to the data of every location. Cannot manage users or exam configuration.', 'all',             2),
    (3, 'location-admin',  'Location Admin',  'Access to the data of the assigned locations only.', 'assigned-locations',                           3),
    (4, 'faculty',         'Faculty',         'Access to the assigned batches only. Records results but cannot manage tracks.', 'assigned-batches', 4);

-- ── Role -> permission grants ───────────────────────────────────────────────
-- Super Admin holds every permission, including users.manage (7) and
-- configuration.manage (8).
INSERT INTO app_role_permission (introle_id, intpermission_id) VALUES
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8);

-- Program Manager and Location Admin hold everything except the two
-- administrative permissions.
INSERT INTO app_role_permission (introle_id, intpermission_id) VALUES
    (2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6),
    (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6);

-- Faculty holds the same set as above but without lap-remedial.manage (5):
-- faculty record results, they do not move trainees between tracks.
INSERT INTO app_role_permission (introle_id, intpermission_id) VALUES
    (4, 1), (4, 2), (4, 3), (4, 4), (4, 6);

-- ── Default CEFR mapping (published Versant scale) ──────────────────────────
-- Ranges intentionally overlap at B2+/C1 (76): the level for a score is the
-- band with the highest intmin_score, so 76 resolves to C1.
INSERT INTO app_cefr_band (txtcefr_level, intmin_score, intmax_score, txtcolor_id, intsort_order) VALUES
    ('Below A1', 10, 22, 'red',         1),
    ('A1',       23, 30, 'red-orange',  2),
    ('A2',       31, 36, 'orange',      3),
    ('A2+',      37, 43, 'orange-amber',4),
    ('B1',       44, 51, 'amber',       5),
    ('B1+',      52, 59, 'yellow-lime', 6),
    ('B2',       60, 67, 'lime',        7),
    ('B2+',      68, 76, 'light-green', 8),
    ('C1',       76, 85, 'green',       9),
    ('C2',       86, 90, 'green-dark',  10);

-- ── Default assessments ─────────────────────────────────────────────────────

INSERT INTO app_assessment (intassessment_id, txtassessment_name, txtdescription, intmax_score, intsort_order) VALUES
    (1, 'Pre Assessment',  'Baseline evaluation taken before training begins.',              90, 1),
    (2, 'Mid Assessment',  'Checkpoint evaluation at the midpoint of the training cycle.',   90, 2),
    (3, 'Post Assessment', 'Final evaluation after training completion.',                    90, 3);

-- ── Bootstrap administrator ─────────────────────────────────────────────────
-- A fresh deployment has no accounts, so one is created here, otherwise nobody
-- could sign in to create the rest.
--
-- !! CHANGE THIS PASSWORD BEFORE THE FIRST PRODUCTION DEPLOYMENT. !!
-- It is stored in plain text at the client's explicit request for now; see
-- PasswordEncoderConfig for how to switch to BCrypt, and the README for the
-- migration steps that go with it.
INSERT INTO app_user (intemployee_id, txtusername, txtname, txtemail, txtpassword, introle_id, txtstatus, txtcreated_by)
VALUES (10294, 'admin', 'System Administrator', 'admin@bizzskill.local', 'Admin@123', 1, 'A', 'flyway');

-- ── Advance identity sequences past the explicit ids ────────────────────────

SELECT setval(pg_get_serial_sequence('app_permission', 'intpermission_id'),
              (SELECT MAX(intpermission_id) FROM app_permission));
SELECT setval(pg_get_serial_sequence('app_role', 'introle_id'),
              (SELECT MAX(introle_id) FROM app_role));
SELECT setval(pg_get_serial_sequence('app_assessment', 'intassessment_id'),
              (SELECT MAX(intassessment_id) FROM app_assessment));
