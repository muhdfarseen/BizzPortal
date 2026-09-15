package com.bizzskill.portal.assessment.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A filled-in status sheet being committed.
 *
 * <p>The browser has already parsed and previewed the file; this is the server's
 * chance to check the same things for itself. It does not trust the client's
 * verdict, because the preview is a convenience and the commit is the write.
 *
 * <p>Only the columns the server acts on are here. The employee name, the
 * assessment marks and the trainee's current status travel in the sheet so the
 * person filling it in can see what they are deciding about, but the server reads
 * none of them: a mark in this sheet is a reference for a human, never a value the
 * portal stores. Sending them would invite the client to think they matter.
 *
 * <p>Rows left blank by the person filling the sheet are not sent at all — an
 * untouched row means "no change", and the alternative, sending the trainee's
 * current status as the requested one, would be refused as a change to the status
 * they already hold.
 *
 * @param locationId the group the sheet was generated for. Re-resolved on the
 *                   server and checked against the caller's scope, so a sheet
 *                   cannot be used to write outside the group it came from.
 * @param rows       the rows that actually ask for a change.
 */
public record TraineeStatusUploadRequest(
        String locationId,

        Long batchId,

        Long lgId,

        @NotEmpty(message = "The sheet has no status changes to upload.")
        @Valid
        List<Row> rows) {

    /**
     * One sheet row that asks for a change.
     *
     * <p>Carries the same three fields as {@link TraineeStatusRequest}, plus the
     * employee the change applies to, so a row means exactly what the single-change
     * request means and both paths enforce the same rules.
     *
     * @param employeeId    the employee number as written in the sheet.
     * @param status        the status the trainee will hold afterwards.
     * @param remark        why the status is changing.
     * @param effectiveDate ISO date the new status takes effect; blank means today.
     */
    public record Row(
            @NotBlank(message = "Enter an Employee ID.")
            String employeeId,

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
}
