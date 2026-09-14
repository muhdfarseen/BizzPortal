package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * One band of the mapping as submitted by the Configuration screen.
 *
 * <p>Field-level constraints are declared with bean validation, while the rules
 * that span fields — {@code min <= max}, and no duplicate levels — are checked in
 * {@code CefrMappingService}, because they cannot be expressed here.
 */
public record CefrBandRequest(
        @NotBlank(message = "Enter a level.")
        @Size(max = 30, message = "Use 30 characters or fewer.")
        String level,

        @NotNull(message = "Enter the lowest score.")
        @Min(value = 0, message = "The lowest score cannot be negative.")
        Integer min,

        @NotNull(message = "Enter the highest score.")
        @Min(value = 0, message = "The highest score cannot be negative.")
        Integer max,

        @NotBlank(message = "Pick a badge colour.")
        @Size(max = 30, message = "Use 30 characters or fewer.")
        String color) {
}
