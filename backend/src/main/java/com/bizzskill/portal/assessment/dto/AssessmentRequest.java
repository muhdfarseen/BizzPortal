package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for an assessment.
 *
 * @param name        column header, e.g. {@code Pre Assessment}. Must be unique,
 *                    which the service checks case-insensitively.
 * @param description shown on the Configuration screen.
 * @param maxScore    highest achievable score. Bounded at 1000 rather than left
 *                    open: a mistyped maximum silently makes every real score
 *                    valid, which is worse than rejecting the input.
 * @param sortOrder   column order; defaults to last when omitted.
 */
public record AssessmentRequest(
        @NotBlank(message = "Enter an assessment name.")
        @Size(max = 60, message = "Use 60 characters or fewer.")
        String name,

        @Size(max = 300, message = "Use 300 characters or fewer.")
        String description,

        @NotNull(message = "Enter the maximum score.")
        @Min(value = 1, message = "The maximum score must be at least 1.")
        @Max(value = 1000, message = "The maximum score must be 1000 or less.")
        Integer maxScore,

        @Min(value = 0, message = "The order cannot be negative.")
        Integer sortOrder,

        /**
         * Optional lifecycle state. Deactivating retires an assessment without
         * deleting it, which is the only option once results reference it.
         * Omitted means "leave unchanged" on update, and active on create.
         */
        @Pattern(regexp = "active|inactive", message = "Choose active or inactive.")
        String status) {
}
