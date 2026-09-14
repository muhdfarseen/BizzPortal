package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.TraineeAssessmentResponse;
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
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
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

    /** The roster of a filtered group, with each trainee's results and track. */
    public List<TraineeAssessmentResponse> roster(
            PortalPrincipal caller, String locationId, Long batchId, Long lgId) {

        List<Participant> trainees = scope.find(caller, locationId, batchId, lgId).stream()
                .filter(participant -> participant.getIntEmployeeId() != null)
                .toList();

        if (trainees.isEmpty()) {
            return List.of();
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

        return trainees.stream()
                .map(trainee -> toRow(
                        trainee,
                        resultsByEmployee.getOrDefault(trainee.getIntEmployeeId(), List.of()),
                        tracksByEmployee.getOrDefault(trainee.getIntEmployeeId(), List.of()),
                        bands))
                .toList();
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
            resultWriter.write(trainee.getIntEmployeeId(), entry.getKey(), entry.getValue(), bands, actor);
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
