package com.bizzskill.portal.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Sign-in credentials.
 *
 * @param employeeId the Employee ID the user typed, or their username. Both are
 *                   accepted because the portal's trainees know their employee
 *                   number while administrators tend to know their username.
 * @param password   the account password, unmasked for now.
 */
public record LoginRequest(
        @NotBlank(message = "Enter your Employee ID.") String employeeId,
        @NotBlank(message = "Enter your password.") String password) {
}
