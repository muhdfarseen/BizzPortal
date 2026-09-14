package com.bizzskill.portal.user.dto;

import com.bizzskill.portal.user.entity.AppPermission;

/**
 * One permission and what it grants, for the screens that list them.
 *
 * @param id the permission code, which is what a token carries and what
 *           {@code @PreAuthorize} checks.
 */
public record PermissionResponse(String id, String label, String description) {

    public static PermissionResponse from(AppPermission permission) {
        return new PermissionResponse(
                permission.getTxtPermissionCode(),
                permission.getTxtLabel(),
                permission.getTxtDescription());
    }
}
