package com.bizzskill.portal.assessment.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A request to resolve employee numbers against one group, for a bulk upload preview.
 *
 * <p>A {@code POST} rather than a {@code GET} because the ids are a sheet's worth of
 * numbers: a few hundred of them would push a query string past the URI length that
 * servers and proxies accept, and silently truncating the list would drop trainees
 * from the preview without saying so.
 *
 * @param employeeIds the numbers named in the uploaded sheet. Capped so one request
 *                    cannot ask the database for an unbounded set.
 */
public record TraineeLookupRequest(
        @NotEmpty(message = "Provide at least one employee number.") @Size(
                        max = 5000,
                        message = "Look up at most 5000 employee numbers at a time.")
                List<Long> employeeIds) {
}
