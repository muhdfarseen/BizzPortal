package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A change of trainee status.
 *
 * <p>{@code status} is the status the trainee will hold afterwards. It is one of
 * the six stored statuses, or {@code regular} to end the current one and hold
 * none — the way a trainee who no longer needs support returns to ordinary
 * progress.
 *
 * @param status        {@code regular}, {@code remedial}, {@code lap},
 *                      {@code cleared}, {@code discontinued}, {@code purged} or
 *                      {@code resigned}.
 * @param remark        why the status is changing. Required: a status change
 *                      without a reason is exactly what an audit cannot explain.
 * @param effectiveDate ISO date the new status takes effect; defaults to today,
 *                      and may be backdated but never predicted.
 */
public record TraineeStatusRequest(
        @NotBlank(message = "Choose a status.")
        @Pattern(
                regexp = "regular|remedial|lap|cleared|discontinued|purged|resigned",
                message = "Choose a valid status.")
        String status,

        @NotBlank(message = "Record why the status is changing.")
        @Size(max = 500, message = "Use 500 characters or fewer.")
        String remark,

        @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}", message = "Use the date format yyyy-MM-dd.")
        String effectiveDate) {
}
