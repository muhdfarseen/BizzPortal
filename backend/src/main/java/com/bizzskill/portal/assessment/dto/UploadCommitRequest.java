package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;
import java.util.List;

/**
 * A validated sheet being committed.
 *
 * <p>The browser has already parsed and previewed the file; this is the server's
 * chance to check the same things for itself. It does not trust the client's
 * verdict, because the preview is a convenience and the commit is the write.
 *
 * @param examId     the assessment every row is scored against. One assessment per
 *                   upload, so a sheet can never mix columns.
 * @param assessedOn the date the exam was conducted, recorded against every row.
 *                   One date for the sheet, because a group sits the same paper on
 *                   the same day; it travels with the request rather than being
 *                   taken from the clock, since a sheet is routinely uploaded after
 *                   the fact.
 * @param locationId the group the sheet was generated for. Re-resolved on the
 *                   server and checked against the caller's scope, so a sheet
 *                   cannot be used to write outside the group it came from.
 * @param rows       the accepted rows.
 */
public record UploadCommitRequest(
        @NotBlank(message = "Choose an assessment.")
        @Pattern(regexp = "\\d{1,19}", message = "Choose an assessment.")
        String examId,

        @NotNull(message = "Choose the date the exam was conducted.")
        LocalDate assessedOn,

        String locationId,

        Long batchId,

        Long lgId,

        @NotEmpty(message = "The sheet has no rows to upload.")
        List<UploadRow> rows) {

    /**
     * One sheet row.
     *
     * @param employeeId the employee number as written in the sheet.
     * @param score      the score; validated against the assessment's maximum.
     */
    public record UploadRow(
            @NotBlank(message = "Enter an Employee ID.")
            String employeeId,

            @NotNull(message = "Enter a score.")
            Integer score) {
    }
}
