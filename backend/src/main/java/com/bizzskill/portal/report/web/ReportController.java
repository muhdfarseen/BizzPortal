package com.bizzskill.portal.report.web;

import com.bizzskill.portal.report.dto.LocationReportResponse;
import com.bizzskill.portal.report.dto.TraineeReportResponse;
import com.bizzskill.portal.report.dto.TraineeReportResponse.TraineeOption;
import com.bizzskill.portal.report.service.ReportService;
import com.bizzskill.portal.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The reports page's reads.
 *
 * <p>Three endpoints, two reports: the search that points the trainee report at
 * somebody, the trainee report itself, and the location report. All three are
 * guarded by {@code reports.view} — the same permission the tab is shown under —
 * so a role cannot reach a report it has no tab for.
 *
 * <p>Both reports are computed server-side rather than assembled in the browser
 * from lists the client already holds. A report is a claim about the whole
 * organisation, not about the page on screen: deriving it client-side from one
 * page of a paged endpoint is how a report comes to understate a centre's numbers.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reports;
    private final CurrentUser currentUser;

    public ReportController(ReportService reports, CurrentUser currentUser) {
        this.reports = reports;
        this.currentUser = currentUser;
    }

    /**
     * The trainees a report search box matches, already narrowed to the caller's scope.
     *
     * <p>Points the trainee report at a person by name or employee number, so the
     * report does not depend on the user having an employee number to hand. Sends
     * only the matches, never the roster behind them.
     */
    @GetMapping("/trainees")
    @PreAuthorize("hasAuthority('reports.view')")
    public List<TraineeOption> searchTrainees(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer size) {
        return reports.searchTrainees(currentUser.require(), search, size);
    }

    /**
     * One trainee's report: their record, their exam timeline and their LAP /
     * Remedial timeline.
     *
     * <p>Addressed by employee number, and the caller must be able to see that
     * trainee — knowing an employee number is not permission to read their record.
     */
    @GetMapping("/trainees/{employeeId}")
    @PreAuthorize("hasAuthority('reports.view')")
    public TraineeReportResponse traineeReport(@PathVariable Long employeeId) {
        return reports.traineeReport(currentUser.require(), employeeId);
    }

    /**
     * One location's report: its batches and their trainee counts per track, the
     * assessments each batch has sat, and the assessments conducted there with
     * their dates.
     *
     * <p>The location is a required parameter: this report is about a place, and
     * there is no meaningful "all locations" version of a per-location breakdown.
     *
     * <p>The period is the same optional pair the dashboard takes, and narrows the
     * same thing: a batch only counts once it began in the requested year and
     * quarter. The report page always sends it, so "all batches" there means the
     * period's batches rather than every batch there has ever been.
     */
    @GetMapping("/location")
    @PreAuthorize("hasAuthority('reports.view')")
    public LocationReportResponse locationReport(
            @RequestParam String locationId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer quarter) {
        return reports.locationReport(currentUser.require(), locationId, year, quarter);
    }
}
