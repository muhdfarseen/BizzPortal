package com.bizzskill.portal.dashboard.dto;

import java.util.List;

/**
 * The figures the dashboard home page renders.
 *
 * <p>Computed server-side rather than assembled in the browser from a trainee
 * list, because the dashboard is the first thing a user sees: if it disagrees with
 * the assessment tables, the numbers people quote in meetings are the wrong ones.
 * One query path means one answer.
 *
 * <p>The counts are filtered by the same location/batch/learning-group selection
 * the rest of the portal uses, and always narrowed to the caller's scope first.
 *
 * @param totals    the headline counters for the current selection.
 * @param locations the per-location breakdown behind them.
 */
public record DashboardSummaryResponse(Totals totals, List<LocationBreakdown> locations) {

    /**
     * Headline counters.
     *
     * <p>{@code regular}, {@code remedial} and {@code lap} always sum to
     * {@code trainees}: a trainee is on at most one track, and being on none is the
     * regular case. Deriving {@code regular} this way rather than counting it keeps
     * that invariant true by construction instead of by agreement.
     */
    public record Totals(int trainees, int batches, int regular, int remedial, int lap) {
    }

    /**
     * One location's contribution.
     *
     * @param totalBatch   how many batches at this location are in the selection.
     * @param totalTrainee how many trainees they hold.
     */
    public record LocationBreakdown(
            String locationId,
            String locationName,
            int totalBatch,
            int totalTrainee,
            int remedialCount,
            int lapCount) {
    }
}
