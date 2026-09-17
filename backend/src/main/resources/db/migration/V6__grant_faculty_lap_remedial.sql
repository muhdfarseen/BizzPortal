-- =============================================================================
-- V6 — Grant faculty LAP/Remedial management permission
-- =============================================================================

-- Grant 'lap-remedial.manage' (5) to 'faculty' (4)
INSERT INTO app_role_permission (introle_id, intpermission_id) VALUES (4, 5) ON CONFLICT DO NOTHING;
