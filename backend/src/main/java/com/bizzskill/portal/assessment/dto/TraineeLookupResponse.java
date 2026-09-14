package com.bizzskill.portal.assessment.dto;

import java.util.List;

/**
 * The group's answer to a {@link TraineeLookupRequest}.
 *
 * <p>Carries two things the upload preview needs and nothing else:
 *
 * <ul>
 *   <li>{@code trainees} — only the requested numbers that are actually in the
 *       group, so the preview can flag a number from the sheet that is not.
 *       Returned as name plus number because the preview also warns when the name
 *       in the file disagrees with the roster's.
 *   <li>{@code groupSize} — how many trainees the group holds in total, so the
 *       preview can report how many the sheet left out. A count, not the rows: the
 *       whole point is to avoid sending them.
 * </ul>
 *
 * <p>Deliberately not {@code TraineeAssessmentResponse}: the preview judges the
 * sheet, not the scores, so sending every trainee's results and CEFR levels would
 * be the expensive part of the roster for no benefit.
 *
 * @param groupSize trainees in the group, before the requested ids are applied.
 * @param trainees  the requested ids that are in the group.
 */
public record TraineeLookupResponse(long groupSize, List<TraineeRef> trainees) {

    /** One trainee, by the two fields the preview compares the sheet against. */
    public record TraineeRef(String employeeId, String name) {
    }
}
