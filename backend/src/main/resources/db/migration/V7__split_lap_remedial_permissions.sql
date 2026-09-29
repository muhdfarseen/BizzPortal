-- =============================================================================
-- V7 — Split LAP / Remedial management per track
-- =============================================================================
--
-- One coarse 'lap-remedial.manage' cannot express "this faculty member places
-- trainees on Remedial but never on LAP", which the portal needs. It is replaced
-- by two permissions, one per track, and the faculty role is split into variants
-- that carry them.
--
-- View is untouched: 'lap-remedial.view' still reads both tables, so a faculty
-- member with neither manage permission can see the tracks and cannot move
-- anyone. Initiate and Close share a permission per track, because both are the
-- same decision — this person owns that track — and splitting them further would
-- let someone open a track they are not allowed to finish.
--
-- The order below matters: accounts are moved off the coarse permission before
-- it is retired, so nothing is left pointing at a row that no longer exists.

-- 1. The two replacement permissions, in the sort slots the coarse one used to
--    occupy (5 and 6) so the catalogue keeps its order.
INSERT INTO app_permission (txtpermission_code, txtlabel, txtdescription, intsort_order) VALUES
    ('lap-remedial.remedial-manage', 'Manage Remedial',
     'Initiate Remedial for trainees and close completed Remedial tracks', 5),
    ('lap-remedial.lap-manage', 'Manage LAP',
     'Initiate LAP for trainees and close completed LAP tracks', 6);

-- 2. Per-user grants. The role says what a kind of person may do; this says what
--    this person may do, which is what lets two faculty members on the same role
--    own different tracks. Additive only: a grant can add to the role, never
--    take from it, so this can never be used to silently reduce someone's access.
CREATE TABLE app_user_permission (
    intuser_id       bigint NOT NULL,
    intpermission_id bigint NOT NULL,
    CONSTRAINT pk_app_user_permission PRIMARY KEY (intuser_id, intpermission_id),
    -- Cascading so removing an account takes its grants with it, as the
    -- location and batch assignments already do.
    CONSTRAINT fk_aup_user FOREIGN KEY (intuser_id)
        REFERENCES app_user (intuser_id) ON DELETE CASCADE,
    CONSTRAINT fk_aup_permission FOREIGN KEY (intpermission_id)
        REFERENCES app_permission (intpermission_id) ON DELETE CASCADE
);

-- 3. Accounts already holding the coarse permission keep exactly what they had.
--    Done before it is retired below, and as per-user grants rather than a role
--    change, so an administrator who set these up by hand is not overruled.
INSERT INTO app_user_permission (intuser_id, intpermission_id)
SELECT u.intuser_id, p.intpermission_id
  FROM app_user u
  JOIN app_role_permission rp ON rp.introle_id = u.introle_id
 CROSS JOIN app_permission p
 WHERE rp.intpermission_id = (SELECT intpermission_id FROM app_permission
                               WHERE txtpermission_code = 'lap-remedial.manage')
   AND p.txtpermission_code IN ('lap-remedial.remedial-manage', 'lap-remedial.lap-manage')
ON CONFLICT DO NOTHING;

-- 4. Rewrite the roles' grants. The coarse permission becomes the Remedial one
--    wherever it was held, and the LAP one is added alongside it. superadmin is
--    in that list, so it keeps both.
UPDATE app_role_permission
   SET intpermission_id = (SELECT intpermission_id FROM app_permission
                            WHERE txtpermission_code = 'lap-remedial.remedial-manage')
 WHERE intpermission_id = (SELECT intpermission_id FROM app_permission
                            WHERE txtpermission_code = 'lap-remedial.manage');

INSERT INTO app_role_permission (introle_id, intpermission_id)
SELECT r.introle_id, p.intpermission_id
  FROM app_role r, app_permission p
 WHERE p.txtpermission_code = 'lap-remedial.lap-manage'
   AND r.txtrole_code IN ('superadmin', 'program-manager', 'location-admin')
ON CONFLICT DO NOTHING;

-- 5. The base faculty role keeps view only. It held the coarse permission from
--    V6, which step 4 just rewrote into the Remedial one — but an administrator
--    picking plain "Faculty" should get no track authority at all, or they would
--    unknowingly hand out Remedial management. Faculty who need it are given the
--    permission on the account itself, in User Management.
DELETE FROM app_role_permission
 WHERE introle_id = (SELECT introle_id FROM app_role WHERE txtrole_code = 'faculty')
   AND intpermission_id IN (
       SELECT intpermission_id FROM app_permission
        WHERE txtpermission_code IN ('lap-remedial.remedial-manage', 'lap-remedial.lap-manage'));

-- 6. Retire the coarse permission. Every grant has been rewritten above, so
--    nothing is left pointing at it and each account keeps the access it had.
DELETE FROM app_permission WHERE txtpermission_code = 'lap-remedial.manage';

-- 7. Keep the catalogue contiguous now that two rows sit at 5 and 6.
UPDATE app_permission SET intsort_order = 7 WHERE txtpermission_code = 'reports.view';
UPDATE app_permission SET intsort_order = 8 WHERE txtpermission_code = 'users.manage';
UPDATE app_permission SET intsort_order = 9 WHERE txtpermission_code = 'configuration.manage';

-- ── Advance identity sequences past the rows inserted above ─────────────────

SELECT setval(pg_get_serial_sequence('app_permission', 'intpermission_id'),
              (SELECT MAX(intpermission_id) FROM app_permission));