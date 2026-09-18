package com.bizzskill.portal.dashboard.web;

import com.bizzskill.portal.dashboard.dto.DashboardSummaryResponse;
import com.bizzskill.portal.dashboard.service.DashboardService;
import com.bizzskill.portal.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The dashboard home page's figures.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboard;
    private final CurrentUser currentUser;

    public DashboardController(DashboardService dashboard, CurrentUser currentUser) {
        this.dashboard = dashboard;
        this.currentUser = currentUser;
    }

    /**
     * Headline counters and the per-location breakdown.
     *
     * <p>Accepts the same filter as the assessment table so the dashboard can be
     * narrowed to the group being looked at, plus the period the filter bar leads
     * with: a batch only counts once it began in the requested year and quarter, so
     * "All batches" means the selected period's batches rather than the whole portal.
     * The response is additionally narrowed to the caller's own scope, so the numbers
     * never count groups they cannot open.
     */
    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('dashboard.view')")
    public DashboardSummaryResponse summary(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer quarter) {
        return dashboard.summary(currentUser.require(), locationId, batchId, lgId, year, quarter);
    }
}
