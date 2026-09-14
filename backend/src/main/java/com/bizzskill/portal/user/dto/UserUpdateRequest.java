package com.bizzskill.portal.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Update payload for a portal account.
 *
 * <p>The employee number is absent by design: it is the account's identity and
 * comes from the organisation, so it is not something an administrator edits. It
 * arrives in the path instead.
 *
 * <p>There is no password field either. Changing a credential is a separate
 * concern with different authorisation needs (a user changing their own password
 * should not need {@code users.manage}), and bundling it here would make an
 * ordinary role change capable of silently resetting someone's password.
 */
public record UserUpdateRequest(
        @NotBlank(message = "Enter a name.")
        @Size(max = 200, message = "Use 200 characters or fewer.")
        String name,

        @Email(message = "Enter a valid email address.")
        @Size(max = 200, message = "Use 200 characters or fewer.")
        String email,

        @NotBlank(message = "Choose a role.")
        String role,

        List<String> locationIds,

        List<Long> batchIds,

        @Pattern(regexp = "active|inactive", message = "Choose active or inactive.")
        String status) {
}
