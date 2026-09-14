package com.bizzskill.portal.assessment.dto;

import com.bizzskill.portal.assessment.entity.AppAssessment;

/**
 * An assessment as the client sees it.
 *
 * <p>Carries both the configuration fields (`description`) and the assessment
 * fields (`maxScore`) because the Configuration screen edits the first and the
 * results table needs the second; splitting them would mean two calls for one
 * screen.
 *
 * @param id          numeric id rendered as a string, matching the client's
 *                    opaque-id handling elsewhere.
 * @param name        column header in the results table, e.g. {@code Pre Assessment}.
 * @param maxScore    highest achievable score; drives score validation.
 * @param status      {@code active} or {@code inactive}.
 */
public record AssessmentResponse(
        String id,
        String name,
        String description,
        Integer maxScore,
        Integer sortOrder,
        String status) {

    public static AssessmentResponse from(AppAssessment assessment) {
        return new AssessmentResponse(
                String.valueOf(assessment.getIntAssessmentId()),
                assessment.getTxtAssessmentName(),
                assessment.getTxtDescription(),
                assessment.getIntMaxScore(),
                assessment.getIntSortOrder(),
                assessment.getTxtStatus().name().toLowerCase());
    }
}
