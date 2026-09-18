package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.TraineeAssessmentResponse;
import com.bizzskill.portal.assessment.dto.TraineeLookupResponse;
import com.bizzskill.portal.assessment.dto.TraineeResultResponse;
import com.bizzskill.portal.assessment.dto.TraineeResultsRequest;
import com.bizzskill.portal.assessment.entity.AppAssessment;
import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.assessment.repository.AppAssessmentRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import com.bizzskill.portal.assessment.repository.AppLapRemedialRepository;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.enums.TrackFilter;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.common.web.PageResponse;
import com.bizzskill.portal.common.web.SortQuery;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The assessment table: reading a group's roster, and recording scores.
 *
 * <p>The roster is built from six queries regardless of size — participants,
 * results, open tracks, closed tracks and the CEFR mapping are each fetched in
 * bulk and joined in memory. Loading results per trainee would be the classic
 * N+1 that turns a 200-row roster into 200 round trips.
 */
@Service
@Transactional(readOnly = true)
public class AssessmentRosterService {

    /**
     * The order pages are cut from.
     *
     * <p>Name first, which is the order the table shows. The employee number breaks
     * ties, because two trainees can share a name and a page boundary between equal
     * keys may otherwise return one of them twice and never return the other.
     */
    private static final Sort ROSTER_TIE_BREAKERS = Sort.by(
            Sort.Order.asc("txtParticipantName"), Sort.Order.asc("intEmployeeId"));

    /** Sort keys the roster accepts, mapped to entity properties. */
    private static final Map<String, String> ROSTER_SORTABLE =
            Map.of("name", "txtParticipantName", "employeeId", "intEmployeeId");

    private final TraineeScopeService scope;
    private final AppAssessmentRepository assessments;
    private final AppAssessmentResultRepository results;
    private final AssessmentResultWriter resultWriter;
    private final AppLapRemedialRepository lapRemedial;
    private final CefrMappingService cefrMapping;

    public AssessmentRosterService(
            TraineeScopeService scope,
            AppAssessmentRepository assessments,
            AppAssessmentResultRepository results,
            AssessmentResultWriter resultWriter,
            AppLapRemedialRepository lapRemedial,
            CefrMappingService cefrMapping) {
        this.scope = scope;
        this.assessments = assessments;
        this.results = results;
        this.resultWriter = resultWriter;
        this.lapRemedial = lapRemedial;
        this.cefrMapping = cefrMapping;
    }

    /**
     * One page of a filtered group's roster, with each trainee's results and track.
     *
     * <p>Paged in the database, not in memory: the scope, search and track filters
     * are all part of the query that selects the page, so a group of ten thousand
     * costs the same as a group of ten. Only the page's employee ids are then used
     * to fetch results and tracks, so the per-page work stays proportional to the
     * page rather than to the group.
     */
    public PageResponse<TraineeAssessmentResponse> roster(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            PageQuery paging,
            TrackFilter track,
            String sort,
            String direction) {

        Sort order = SortQuery.resolve(sort, direction, ROSTER_SORTABLE, ROSTER_TIE_BREAKERS);

        Page<Participant> page =
                scope.page(caller, locationId, batchId, lgId, paging, track, order);

        List<Participant> trainees = page.getContent();
        if (trainees.isEmpty()) {
            return PageResponse.of(List.of(), page.getNumber(), page.getSize(), page.getTotalElements());
        }

        List<Long> employeeIds = trainees.stream().map(Participant::getIntEmployeeId).toList();

        Map<Long, List<AppAssessmentResult>> resultsByEmployee =
                results.findByIntEmployeeIdIn(employeeIds).stream()
                        .collect(Collectors.groupingBy(AppAssessmentResult::getIntEmployeeId));

        // Newest first, so the first open row and the first closed row are the
        // current track and the most recently closed one.
        Map<Long, List<AppLapRemedial>> tracksByEmployee =
                lapRemedial.findByIntEmployeeIdInOrderByDateStartDateDesc(employeeIds).stream()
                        .collect(Collectors.groupingBy(AppLapRemedial::getIntEmployeeId));

        // Loaded once and reused for every score on the roster.
        List<AppCefrBand> bands = cefrMapping.orderedBands();

        List<TraineeAssessmentResponse> rows = trainees.stream()
                .map(trainee -> toRow(
                        trainee,
                        resultsByEmployee.getOrDefault(trainee.getIntEmployeeId(), List.of()),
                        tracksByEmployee.getOrDefault(trainee.getIntEmployeeId(), List.of()),
                        bands))
                .toList();

        return PageResponse.of(rows, page.getNumber(), page.getSize(), page.getTotalElements());
    }

    /**
     * Resolves the employee numbers a sheet names against one group.
     *
     * <p>Lets the upload preview judge the sheet without downloading the group. The
     * preview needs two things — which of the sheet's numbers are really in the group,
     * and how many trainees the sheet left out — so this answers exactly those: the
     * matching trainees, and a count. Results and CEFR levels, which are the bulk of a
     * roster response, are left out because the preview scores nothing with them.
     *
     * <p>Runs two queries, and the count is a count: how many numbers were sent does
     * not change the cost of either.
     */
    public TraineeLookupResponse lookup(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            List<Long> employeeIds) {

        List<TraineeLookupResponse.TraineeRef> found =
                scope.findWithin(caller, locationId, batchId, lgId, employeeIds).stream()
                        .filter(participant -> participant.getIntEmployeeId() != null)
                        .map(participant -> new TraineeLookupResponse.TraineeRef(
                                String.valueOf(participant.getIntEmployeeId()),
                                participant.getTxtParticipantName()))
                        .toList();

        return new TraineeLookupResponse(
                scope.count(caller, locationId, batchId, lgId), found);
    }

    /**
     * Records one or more scores for a trainee.
     *
     * <p>Each change is written to the audit table with the value it replaced, so a
     * score can be traced to who changed it and when — the audit row is inserted in
     * the same transaction as the change, so the two cannot disagree.
     *
     * <p>A null score removes the result rather than storing a null, because the
     * client represents "not assessed" by the absence of the key.
     */
    @Transactional
    public void saveResults(
            PortalPrincipal caller, Long employeeId, TraineeResultsRequest request) {

        Participant trainee = scope.requireVisible(caller, employeeId);

        if (request.results() == null || request.results().isEmpty()) {
            throw new RequestValidationException(List.of(
                    new FieldViolation("results", "Provide at least one score to save.")));
        }

        Map<Long, AppAssessment> byId = assessments.findAllByOrderByIntSortOrderAsc().stream()
                .collect(Collectors.toMap(AppAssessment::getIntAssessmentId, Function.identity()));

        List<AppCefrBand> bands = cefrMapping.orderedBands();
        List<FieldViolation> violations = new ArrayList<>();

        // Resolved before anything is written, so a bad id in the payload cannot
        // leave a partial save behind.
        Map<Long, Integer> pending = new LinkedHashMap<>();
        for (Map.Entry<String, TraineeResultsRequest.ScoreEntry> entry : request.results().entrySet()) {
            Long assessmentId = parseAssessmentId(entry.getKey(), violations);
            if (assessmentId == null) {
                continue;
            }

            AppAssessment assessment = byId.get(assessmentId);
            if (assessment == null) {
                violations.add(new FieldViolation(
                        "results." + entry.getKey(),
                        "There is no assessment with id " + entry.getKey() + "."));
                continue;
            }

            Integer score = entry.getValue() == null ? null : entry.getValue().score();
            if (score != null && (score < 0 || score > assessment.getIntMaxScore())) {
                violations.add(new FieldViolation(
                        "results." + entry.getKey(),
                        "A score for '" + assessment.getTxtAssessmentName() + "' must be between 0 and "
                                + assessment.getIntMaxScore() + "."));
                continue;
            }

            pending.put(assessmentId, score);
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        String actor = caller.username();
        for (Map.Entry<Long, Integer> entry : pending.entrySet()) {
            resultWriter.write(trainee.getIntEmployeeId(), entry.getKey(), entry.getValue(), bands, null, actor);
        }
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private Long parseAssessmentId(String raw, List<FieldViolation> violations) {
        try {
            return Long.valueOf(raw);
        } catch (NumberFormatException ex) {
            violations.add(new FieldViolation(
                    "results." + raw, "'" + raw + "' is not a valid assessment id."));
            return null;
        }
    }

    private TraineeAssessmentResponse toRow(
            Participant trainee,
            List<AppAssessmentResult> traineeResults,
            List<AppLapRemedial> tracks,
            List<AppCefrBand> bands) {

        Map<String, TraineeResultResponse> resultsByExam = new LinkedHashMap<>();
        for (AppAssessmentResult result : traineeResults) {
            if (result.getIntScore() == null) {
                continue;
            }
            resultsByExam.put(
                    String.valueOf(result.getIntAssessmentId()),
                    new TraineeResultResponse(
                            result.getIntScore(),
                            CefrMappingService.levelFor(result.getIntScore(), bands)));
        }

        AppLapRemedial open = tracks.stream()
                .filter(track -> track.getTxtStatus() == LapStatus.OPEN)
                .findFirst()
                .orElse(null);
        AppLapRemedial lastClosed = tracks.stream()
                .filter(track -> track.getTxtStatus() == LapStatus.CLOSED)
                .findFirst()
                .orElse(null);

        // Mirrors the client: on a track, the start date and the reason; otherwise
        // the close date of the track that was closed and its reason.
        if (open != null) {
            return new TraineeAssessmentResponse(
                    String.valueOf(trainee.getIntEmployeeId()),
                    trainee.getTxtParticipantName(),
                    resultsByExam,
                    toStatus(open.getTxtTrack()),
                    iso(open.getDateStartDate()),
                    null,
                    open.getTxtRemark());
        }

        return new TraineeAssessmentResponse(
                String.valueOf(trainee.getIntEmployeeId()),
                trainee.getTxtParticipantName(),
                resultsByExam,
                null,
                null,
                lastClosed == null ? null : iso(lastClosed.getDateCloseDate()),
                lastClosed == null ? null : lastClosed.getTxtRemark());
    }

    private String toStatus(LapTrack track) {
        return track == LapTrack.LAP ? "lap" : "remedial";
    }

    private String iso(LocalDate date) {
        return date == null ? null : date.toString();
    }
}
