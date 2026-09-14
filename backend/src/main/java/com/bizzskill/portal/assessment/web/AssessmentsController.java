package com.bizzskill.portal.assessment.web;

import com.bizzskill.portal.assessment.dto.LapRemedialRequest;
import com.bizzskill.portal.assessment.dto.TraineeAssessmentResponse;
import com.bizzskill.portal.assessment.dto.TraineeResultsRequest;
import com.bizzskill.portal.assessment.service.AssessmentRosterService;
import com.bizzskill.portal.assessment.service.LapRemedialService;
import com.bizzskill.portal.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The assessment table: rosters, score entry, and LAP / Remedial moves.
 *
 * <p>The three endpoints are guarded by three different permissions, because they
 * are genuinely different capabilities: a Faculty member scores trainees they are
 * assigned, but moving someone onto a remedial track is a management decision held
 * by {@code lap-remedial.manage}.
 */
@RestController
@RequestMapping("/api/assessments")
public class AssessmentsController {

    private final AssessmentRosterService roster;
    private final LapRemedialService lapRemedial;
    private final CurrentUser currentUser;

    public AssessmentsController(
            AssessmentRosterService roster, LapRemedialService lapRemedial, CurrentUser currentUser) {
        this.roster = roster;
        this.lapRemedial = lapRemedial;
        this.currentUser = currentUser;
    }

    /**
     * The trainees of a filtered group.
     *
     * <p>All three parameters are optional and narrow in that order: a learning
     * group is more specific than a batch, which is more specific than a location.
     * Whatever is sent is additionally narrowed to the caller's own scope, so an
     * out-of-scope group is refused rather than silently emptied.
     */
    @GetMapping("/trainees")
    @PreAuthorize("hasAuthority('assessments.view')")
    public List<TraineeAssessmentResponse> trainees(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId) {
        return roster.roster(currentUser.require(), locationId, batchId, lgId);
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

    /** Moves a trainee between the LAP / Remedial tracks, or closes their track. */
    @PatchMapping("/trainees/{employeeId}/lap-remedial")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('lap-remedial.manage')")
    public void saveLapRemedial(
            @PathVariable Long employeeId, @Valid @RequestBody LapRemedialRequest request) {
        lapRemedial.save(currentUser.require(), employeeId, request);
    }
}
