package com.bizzskill.portal.report.dto;

import java.util.List;

/**
 * One trainee's report: who they are, where they are, and the two timelines the
 * report page renders — their exams and their LAP / Remedial history.
 *
 * <p>The timelines are answered whole here rather than through the paged
 * endpoints. A trainee has a handful of exams and track placements, so the page
 * can show the complete history in one response; paging it would hide the very
 * thing the report exists to show.
 *
 * <p>Nulls mean "not applicable or not recorded", and the API's {@code non_null}
 * Jackson setting drops them from the JSON — a trainee on no track has no
 * {@code currentTrack} key at all, which is how the client reads "none".
 *
 * @param employeeId the employee number, as a string to match the client's ids.
 * @param exams      every configured assessment, in the order it was sat; an exam
 *                   with no result yet is present with no score or date, so the
 *                   report says what is still outstanding rather than hiding it.
 * @param tracks     the trainee's LAP / Remedial placements, newest first.
 */
public record TraineeReportResponse(
        String employeeId,
        String name,
        String referenceId,
        String recruitBranch,
        String ilpDate,
        String phase,
        String batchId,
        String batchName,
        String batchStartDate,
        String batchEndDate,
        String lgId,
        String lgName,
        String locationId,
        String locationName,
        String currentTrack,
        String currentTrackSince,
        List<ExamTimeline> exams,
        List<TrackTimeline> tracks) {

    /**
     * One entry on the trainee's exam timeline.
     *
     * <p>{@code cefr} is derived from the score under the <em>current</em> CEFR
     * mapping, exactly as the assessment table derives it, so a report and the
     * grid it was opened from never disagree about a level.
     *
     * @param assessedOn ISO date the exam was sat, or absent while it is pending.
     */
    public record ExamTimeline(
            String assessmentId,
            String assessmentName,
            int maxScore,
            Integer score,
            String cefr,
            String assessedOn) {
    }

    /**
     * One entry on the trainee's LAP / Remedial timeline: a placement, and how it
     * ended.
     *
     * <p>Placements are returned as events rather than as a single current status,
     * which is what makes the timeline a history: a trainee who was on Remedial,
     * moved to LAP and was then cleared has three entries here, not one.
     *
     * @param status     {@code open} while the trainee is on the track, {@code closed} once it ended.
     * @param closeDate  ISO date the placement was closed; absent while it is open.
     * @param assessmentName the exam whose result prompted the placement, when one did.
     */
    public record TrackTimeline(
            String track,
            String status,
            String startDate,
            String closeDate,
            String remark,
            String assessmentName) {
    }

    /**
     * A trainee the report page can be pointed at — the answer to its search box.
     *
     * <p>Carries the batch so two trainees with the same name can be told apart,
     * and so the person choosing can see the choice is the one they meant.
     */
    public record TraineeOption(String employeeId, String name, String batchName) {
    }
}
