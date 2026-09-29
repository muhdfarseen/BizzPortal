package com.bizzskill.portal.user.dto;

import com.bizzskill.portal.user.entity.AppPermission;
import com.bizzskill.portal.user.entity.AppUser;

import java.time.Instant;
import java.util.List;

/**
 * A user account as the client sees it.
 *
 * <p>There is deliberately no password field of any kind — not even a hash — so
 * no code path can accidentally serialise a credential. This is the reason the
 * entity is never returned directly from a controller.
 *
 * @param employeeId        the employee number, which is the account's public key.
 * @param role              the role code, e.g. {@code super-admin}.
 * @param scope             how far the role reaches.
 * @param requiresLocations whether this role must have at least one location.
 * @param permissions       permission codes, so the UI can hide what it cannot do.
 */
public record PortalUserResponse(
        String employeeId,
        String username,
        String name,
        String email,
        String role,
        String roleName,
        String scope,
        boolean requiresLocations,
        List<String> locationIds,
        List<String> permissions,
        String status,
        Instant createdAt,
        Instant lastLogin) {

    /** Projects an account onto its API representation. */
    public static PortalUserResponse from(AppUser user) {
        var role = user.getRole();
        return new PortalUserResponse(
                String.valueOf(user.getIntEmployeeId()),
                user.getTxtUsername(),
                user.getTxtName(),
                user.getTxtEmail(),
                role.getTxtRoleCode(),
                role.getTxtRoleName(),
                role.getTxtScope().getCode(),
                role.getTxtScope().requiresLocations(),
                List.copyOf(user.getLocationIds()),
                // The union, so the client hides an action the token would refuse.
                user.effectivePermissionCodes().stream().sorted().toList(),
                user.getTxtStatus().name().toLowerCase(),
                user.getDateCreatedOn(),
                user.getDateLastLogin());
    }
}
