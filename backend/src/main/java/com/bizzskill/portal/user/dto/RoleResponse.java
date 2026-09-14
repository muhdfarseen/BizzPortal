package com.bizzskill.portal.user.dto;

import com.bizzskill.portal.user.entity.AppPermission;
import com.bizzskill.portal.user.entity.AppRole;

import java.util.List;

/**
 * A role and what it may do.
 *
 * <p>Field names mirror the frontend's {@code RoleDefinition}, so the User
 * Management screen can render its role cards and permission lists straight from
 * this response instead of duplicating the matrix in TypeScript.
 *
 * <p>{@code requiresLocations} and {@code requiresBatches} are derived from the
 * scope rather than stored: a role restricted to assigned locations obviously
 * needs at least one, and storing that separately would allow the two to disagree.
 */
public record RoleResponse(
        String id,
        String label,
        String description,
        String scope,
        boolean requiresLocations,
        boolean requiresBatches,
        List<String> permissions) {

    public static RoleResponse from(AppRole role) {
        return new RoleResponse(
                role.getTxtRoleCode(),
                role.getTxtRoleName(),
                role.getTxtDescription(),
                role.getTxtScope().getCode(),
                role.getTxtScope().requiresLocations(),
                role.getTxtScope().requiresBatches(),
                role.getPermissions().stream()
                        .map(AppPermission::getTxtPermissionCode)
                        .sorted()
                        .toList());
    }
}
