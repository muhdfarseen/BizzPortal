package com.bizzskill.portal.report.dto;

import java.util.List;

/**
 * A location's report: how its trainees are distributed across the batches, and
 * which assessments have actually been conducted there.
 *
 * <p>Answered for one location at a time, because that is the unit the report is
 * about: "how is this centre doing" rather than every centre at once. The caller's
 * scope is applied first, so a Location Admin asking about a location they are not
 * assigned to is refused rather than quietly shown an empty report.
 *
 * <p>Only the batches that began in the period asked for are counted, by the same
 * rule the filter bar and the dashboard use — so "Q3 2026" means the same batches
 * here as it does on the screens the figures are compared with.
 *
 * @param totals    the location's headline figures, over every batch in the response.
 * @param batches   one row per batch, including a batch holding no trainees: a batch
 *                  that was never reported on is a fact about the location, and
 *                  omitting it would hide exactly what the report is asked to show.
 * @param conducted one row per assessment and date on which it was sat, newest first.
 */
public record LocationReportResponse(
        String locationId,
        String locationName,
        Totals totals,
        List<BatchReport> batches,
        List<AssessmentConducted> conducted) {

    /**
     * The location's headline counters.
     *
     * <p>{@code regular}, {@code remedial}, {@code lap} and {@code cleared} always
     * sum to {@code trainees}: a trainee has at most one open track, and having
     * none is the regular case. {@code cleared} is the trainee who has track
     * history but is on no track now — the "completed" column of the report, kept
     * apart from {@code regular} so a centre can see how many it has taken through
     * remedial support and released, rather than counting them as never having
     * needed it.
     */
    public record Totals(int trainees, int batches, int regular, int remedial, int lap, int cleared) {
    }

    /**
     * One batch's contribution to the location.
     *
     * <p>The four track counters are exhaustive over {@link #trainees}, so the row
     * can be read without arithmetic.
     *
     * @param conducted the assessments this batch has sat, newest first — the batch's
     *                  own sittings, not the location's. A batch can be behind its
     *                  neighbours, and a location-wide total cannot show that.
     */
    public record BatchReport(
            String batchId,
            String batchName,
            String status,
            String startDate,
            String endDate,
            int trainees,
            int regular,
            int remedial,
            int lap,
            int cleared,
            List<AssessmentConducted> conducted) {
    }

    /**
     * One assessment conducted on one date by one batch.
     *
     * <p>Flattened to a date row rather than grouped per assessment so the report
     * answers the question it is asked — <em>which</em> assessments, and <em>when</em>
     * — in one table, with the count of trainees each sitting covered.
     *
     * <p>The batch is named on the row rather than left to the table it sits in,
     * because two batches sit the same exam on the same day and a date alone cannot
     * say whose marks the count covers. The same rows serve both of the report's
     * tables: grouped under their batch, and read straight down as the location's
     * chronology.
     *
     * @param traineeCount how many distinct trainees of this batch have a result for
     *                     this assessment on this date.
     */
    public record AssessmentConducted(
            String batchId,
            String batchName,
            String assessmentId,
            String assessmentName,
            String conductedOn,
            int traineeCount) {
    }
}
