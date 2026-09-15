package com.bizzskill.portal.assessment.web;

import com.bizzskill.portal.assessment.dto.TraineeStatusRequest;
import com.bizzskill.portal.assessment.dto.TraineeAssessmentResponse;
import com.bizzskill.portal.assessment.dto.TraineeLookupRequest;
import com.bizzskill.portal.assessment.dto.TraineeLookupResponse;
import com.bizzskill.portal.assessment.dto.TraineeResultsRequest;
import com.bizzskill.portal.assessment.service.AssessmentRosterService;
import com.bizzskill.portal.assessment.service.TraineeStatusService;
import com.bizzskill.portal.common.enums.StatusFilter;
import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.common.web.PageResponse;
import com.bizzskill.portal.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;


/**
 * The assessment table: rosters, score entry, and trainee status changes.
 *
 * <p>The three endpoints are guarded by three different permissions, because they
 * are genuinely different capabilities: a Faculty member scores trainees they are
 * assigned, but deciding that someone is not progressing is a management decision
 * held by {@code trainee-status.manage}.
 */
@RestController
@RequestMapping("/api/assessments")
public class AssessmentsController {

    private final AssessmentRosterService roster;
    private final TraineeStatusService traineeStatus;
    private final CurrentUser currentUser;

    public AssessmentsController(
            AssessmentRosterService roster, TraineeStatusService traineeStatus, CurrentUser currentUser) {
        this.roster = roster;
        this.traineeStatus = traineeStatus;
        this.currentUser = currentUser;
    }

    /**
     * One page of a filtered group's trainees.
     *
     * <p>The three group parameters are optional and narrow in that order: a learning
     * group is more specific than a batch, which is more specific than a location.
     * Whatever is sent is additionally narrowed to the caller's own scope, so an
     * out-of-scope group is refused rather than silently emptied.
     *
     * <p>{@code search} and {@code status} narrow in the database alongside the page,
     * so they filter the whole group rather than the page the client happens to be
     * holding. A client that filtered a single page would report "no matches" for a
     * trainee sitting on another page, which is worse than being slow.
     *
     * @param page   zero-based page index; defaults to the first page.
     * @param size   rows per page; defaults to {@code PageQuery.DEFAULT_SIZE} and is
     *               capped at {@code PageQuery.MAX_SIZE}.
     * @param search free text matched against the name or employee number.
     * @param status keeps only trainees on the given tab: regular, remedial, lap,
     *               cleared, or other (discontinued, purged or resigned).
     * @param sort   orders the pages; unknown keys are refused rather than passed on.
     */
    @GetMapping("/trainees")
    @PreAuthorize("hasAuthority('assessments.view')")
    public PageResponse<TraineeAssessmentResponse> trainees(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String direction) {
        return roster.roster(
                currentUser.require(),
                locationId,
                batchId,
                lgId,
                PageQuery.of(page, size, search),
                StatusFilter.parse(status),
                sort,
                direction);
    }

    /**
     * Resolves the employee numbers named in an uploaded sheet against one group.
     *
     * <p>Sits here rather than on the upload controller because it is a roster read:
     * it applies the same scope and the same group filter as {@code /trainees}, and
     * differs only in being told which numbers to look at.
     */
    @PostMapping("/trainees/lookup")
    @PreAuthorize("hasAuthority('assessments.view')")
    public TraineeLookupResponse lookup(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId,
            @Valid @RequestBody TraineeLookupRequest request) {
        return roster.lookup(
                currentUser.require(), locationId, batchId, lgId, request.employeeIds());
    }

    /**
     * Records scores for one trainee.
     *
     * <p>Addressed by employee number, and the caller must be able to see that
     * trainee — knowing an employee number is not permission to score them.
     */
    @PatchMapping("/trainees/{employeeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('assessments.edit')")
    public void saveResults(
            @PathVariable Long employeeId, @Valid @RequestBody TraineeResultsRequest request) {
        roster.saveResults(currentUser.require(), employeeId, request);
    }

    /**
     * Changes the status a trainee holds.
     *
     * <p>Addressed by employee number, and the caller must be able to see that
     * trainee — knowing an employee number is not permission to decide their
     * standing on the programme.
     */
    @PatchMapping("/trainees/{employeeId}/trainee-status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('trainee-status.manage')")
    public void saveTraineeStatus(
            @PathVariable Long employeeId, @Valid @RequestBody TraineeStatusRequest request) {
        traineeStatus.save(currentUser.require(), employeeId, request);
    }
}
