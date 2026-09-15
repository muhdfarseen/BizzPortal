-- =============================================================================
-- V5 — Faculty may change a trainee's status, singly and in bulk
-- =============================================================================
--
-- V4 renamed the LAP/Remedial permissions to Trainee status and left Faculty
-- holding only the read half. Faculty are the people who sit with the cohort and
-- decide who needs remedial support, so they now hold the write half too: the
-- row-by-row Change status action and the bulk sheet upload both check
-- `trainee-status.manage`, and one permission covering both is what keeps the
-- two paths from drifting apart.
--
-- A separate `trainee-status.upload` code was considered and rejected: it would
-- have let Faculty write statuses through a sheet while being unable to correct a
-- single one on screen, which is a distinction without a difference.
--
-- The grant is an update in place rather than a new permission, so nothing that
-- already points at `trainee-status.manage` — the controller annotations, the
-- frontend guards, the JWT authorities — needs to change.
-- =============================================================================

-- ── Faculty (4) gains trainee-status.manage (5) ─────────────────────────────
-- ON CONFLICT so this is a no-op against a database where the grant already
-- exists, rather than an error that would fail the whole migration.
INSERT INTO app_role_permission (introle_id, intpermission_id)
VALUES (4, 5)
ON CONFLICT (introle_id, intpermission_id) DO NOTHING;

-- ── The copy that describes the role and the permission ─────────────────────
-- Both said "cannot manage tracks", which stopped being true here.
UPDATE app_role
   SET txtdescription = 'Access to the assigned batches only. Records results, and changes trainee status one at a time or in bulk from a sheet.'
 WHERE txtrole_code = 'faculty';

UPDATE app_permission
   SET txtdescription = 'Change a trainee''s status — one at a time, or in bulk from a sheet'
 WHERE txtpermission_code = 'trainee-status.manage';
