package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A LAP / Remedial track change for one trainee.
 *
 * @param status    {@code none}, {@code remedial} or {@code lap}. {@code none}
 *                  closes the open track.
 * @param remark    reason for the change, shown in the Remedial and LAP tables.
 * @param startDate ISO date the trainee started the track; defaults to today.
 * @param closeDate ISO date the track was closed; defaults to today when closing.
 */
public record LapRemedialRequest(
        @NotBlank(message = "Choose a track.")
        @Pattern(regexp = "none|remedial|lap", message = "Choose none, remedial or lap.")
        String status,

        @Size(max = 300, message = "Use 300 characters or fewer.")
        String remark,

        @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}", message = "Use the date format yyyy-MM-dd.")
        String startDate,

        @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}", message = "Use the date format yyyy-MM-dd.")
        String closeDate) {
}
