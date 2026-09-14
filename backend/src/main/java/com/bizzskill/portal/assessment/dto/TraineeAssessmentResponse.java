package com.bizzskill.portal.assessment.dto;

import java.util.Map;

/**
 * A trainee's row in the assessment table.
 *
 * <p>The shape mirrors the frontend's {@code TraineeAssessment} exactly, including
 * two decisions that are easy to get wrong:
 *
 * <ul>
 *   <li>{@code results} is keyed by assessment id and <em>omits</em> exams with no
 *       recorded score. The client distinguishes "no result" by the key being
 *       absent, so sending a null entry would render an empty cell that looks
 *       entered.
 *   <li>{@code status}, {@code startDate}, {@code closeDate} and {@code remark} are
 *       null when not applicable, and the API's {@code non_null} Jackson setting
 *       drops them from the JSON — so a trainee on no track has no {@code status}
 *       key at all, which is how the client represents {@code none}.
 * </ul>
 *
 * @param employeeId as a string, matching the client's opaque-id handling.
 * @param results    derived CEFR level per assessment, keyed by assessment id.
 * @param status     {@code remedial} or {@code lap}; absent means none.
 */
public record TraineeAssessmentResponse(
        String employeeId,
        String name,
        Map<String, TraineeResultResponse> results,
        String status,
        String startDate,
        String closeDate,
        String remark) {
}
