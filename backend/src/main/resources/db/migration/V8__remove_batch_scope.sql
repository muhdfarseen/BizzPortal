-- =============================================================================
-- V8 — Remove batch-level access; scope is per location
-- =============================================================================
--
-- Access was granted per location and per batch, and a user could hold some of a
-- location's batches but not others. That is gone: assigning a location now grants
-- every batch and learning group inside it, so the same person no longer sees a
-- partial roster of a place they have access to.
--
-- The faculty role moves from 'assigned-batches' to 'assigned-locations', which is
-- what it now means, and the batch grant table goes. The check constraint is
-- rebuilt because the old one does not know the new value.

-- 1. Widen the faculty role before dropping the constraint, so no row is ever
--    left holding a scope the constraint would reject.
UPDATE app_role
   SET txtscope = 'assigned-locations'
 WHERE txtscope = 'assigned-batches';

-- 2. Stop allowing the retired scope, now that nothing uses it.
ALTER TABLE app_role DROP CONSTRAINT ck_app_role_scope;
ALTER TABLE app_role
    ADD CONSTRAINT ck_app_role_scope CHECK (txtscope IN ('all', 'assigned-locations'));

-- 3. Drop the per-user batch assignments. A batch is reachable exactly when its
--    location is assigned, which the query layer already derives.
DROP TABLE app_user_batch;