package com.bizzskill.portal.assessment.dto;

import java.util.List;

/**
 * The group's answer to a {@link TraineeLookupRequest} for a status sheet.
 *
 * <p>The status preview has to judge each row against what the trainee holds now —
 * a row asking for the status they already have, or asking to end a status they do
 * not hold, or dating the change before the status it replaces began. The sheet
 * carries a "Current Status" column, but it is reference text the user can edit or
 * delete, so the preview is answered from the database instead.
 *
 * <p>{@code status} is the code rather than the label — {@code lap}, not "LAP" —
 * because the preview compares it with what the row asks for. {@code startDate} is
 * the day the current status began, which is the earliest date a change may be
 * dated. Both are null for a trainee who holds no status, which is exactly what
 * makes them regular.
 *
 * @param trainees the requested ids that are in the group, with what each holds.
 */
public record TraineeStatusLookupResponse(List<TraineeStatusRef> trainees) {

    /** One trainee, with the status the preview judges their row against. */
    public record TraineeStatusRef(
            String employeeId, String name, String status, String startDate) {
    }
}
