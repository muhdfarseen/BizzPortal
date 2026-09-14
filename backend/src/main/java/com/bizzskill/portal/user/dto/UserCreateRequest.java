package com.bizzskill.portal.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Create payload for a portal account.
 *
 * @param employeeId the employee number, digits only — the same identity the
 *                   portal uses. Not the username: the username is derived, so an
 *                   administrator cannot invent an identity that does not exist in
 *                   the organisation's records.
 * @param role       the role code, e.g. {@code location-admin}.
 * @param locationIds locations to assign. Required when the role's scope is not
 *                   {@code all}, checked in the service because it depends on the
 *                   role being looked up.
 * @param batchIds   batches to assign. Required when the scope is
 *                   {@code assigned-batches}, and each must sit inside one of the
 *                   assigned locations.
 * @param password   optional. When omitted a strong temporary password is generated
 *                   and returned once in the response, so account creation never
 *                   silently falls back to a guessable default.
 */
public record UserCreateRequest(
        @NotBlank(message = "Enter an Employee ID.")
        @Pattern(regexp = "\\d{1,19}", message = "The Employee ID must be numeric.")
        String employeeId,

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
        String status,

        @Size(min = 8, max = 100, message = "Use at least 8 characters.")
        String password) {
}
