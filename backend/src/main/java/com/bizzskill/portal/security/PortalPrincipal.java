package com.bizzskill.portal.security;

import com.bizzskill.portal.common.enums.RoleScope;

import java.util.Set;

/**
 * The authenticated caller, as resolved from a verified token.
 *
 * <p>Permission checks are made against this rather than against the role name,
 * so adding a permission to a role in the database immediately grants it, with
 * no code change and no redeployment.
 *
 * @param username    the sign-in name, also the token subject.
 * @param employeeId  the person's employee number, matching the portal's.
 * @param name        display name, used in audit columns.
 * @param roleCode    the role's code, e.g. {@code location-admin}.
 * @param scope       how far the caller's permissions reach.
 * @param permissions permission codes, e.g. {@code assessments.edit}.
 * @param locationIds locations the caller may see; empty means all of them.
 * @param batchIds    batches the caller may see; empty means all in scope.
 */
public record PortalPrincipal(
        String username,
        Long employeeId,
        String name,
        String roleCode,
        RoleScope scope,
        Set<String> permissions,
        Set<String> locationIds,
        Set<Long> batchIds) {

    /** Whether the caller holds this permission code. */
    public boolean has(String permission) {
        return permissions.contains(permission);
    }

    /**
     * Whether the caller is restricted to assigned locations.
     *
     * <p>Asked instead of comparing {@link #scope} directly, so the check reads
     * the same wherever it appears.
     */
    public boolean isLocationRestricted() {
        return scope == RoleScope.ASSIGNED_LOCATIONS || scope == RoleScope.ASSIGNED_BATCHES;
    }

    public boolean isBatchRestricted() {
        return scope == RoleScope.ASSIGNED_BATCHES;
    }
}
