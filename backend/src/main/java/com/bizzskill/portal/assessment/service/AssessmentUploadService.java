package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.UploadCommitRequest;
import com.bizzskill.portal.assessment.dto.UploadCommitResponse;
import com.bizzskill.portal.assessment.entity.AppAssessment;
import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.repository.AppAssessmentRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.BusinessRuleException;
import com.bizzskill.portal.common.error.NotFoundException;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The bulk score upload: the downloadable template, and the commit.
 *
 * <p>Parsing and previewing happen in the browser, where the file already is. The
 * server's side is authoritative validation and the write, and it re-checks
 * everything the preview checked — an employee in the group, a score within the
 * assessment's range, no duplicate rows — because a client-side check is a
 * convenience for the user, not a constraint on the data.
 *
 * <p>A commit is all-or-nothing. Applying the good rows and reporting the bad ones
 * would leave the roster half-updated, and the user has no way to tell which half;
 * refusing the whole sheet means they fix it and upload again, and the roster is
 * only ever in a state they asked for.
 */
@Service
@Transactional(readOnly = true)
public class AssessmentUploadService {

    private static final Logger log = LoggerFactory.getLogger(AssessmentUploadService.class);

    /** Column headers, matching the frontend's template exactly. */
    private static final String[] TEMPLATE_HEADERS = {"Emp ID", "Name", "Score"};

    private final TraineeScopeService scope;
    private final AppAssessmentRepository assessments;
    private final AssessmentResultWriter resultWriter;
    private final AppAssessmentResultRepository results;
    private final CefrMappingService cefrMapping;

    public AssessmentUploadService(
            TraineeScopeService scope,
            AppAssessmentRepository assessments,
            AssessmentResultWriter resultWriter,
            AppAssessmentResultRepository results,
            CefrMappingService cefrMapping) {
        this.scope = scope;
        this.assessments = assessments;
        this.resultWriter = resultWriter;
        this.results = results;
        this.cefrMapping = cefrMapping;
    }

    /**
     * The sheet to fill in: the group's trainees with their current scores.
     *
     * <p>Prefilled from the roster rather than blank, so an administrator correcting
     * two marks does not have to retype the whole list — and so the employee numbers
     * are guaranteed to be ones the server will accept.
     */
    public String templateCsv(
            PortalPrincipal caller, String locationId, Long batchId, Long lgId, String examId) {

        AppAssessment assessment = requireActiveAssessment(examId);
        List<Participant> trainees = scope.find(caller, locationId, batchId, lgId);

        Map<Long, Integer> currentScores = currentScores(trainees, assessment.getIntAssessmentId());

        StringBuilder csv = new StringBuilder();
        appendRow(csv, TEMPLATE_HEADERS);
        for (Participant trainee : trainees) {
            Integer score = currentScores.get(trainee.getIntEmployeeId());
            appendRow(csv, new String[] {
                    String.valueOf(trainee.getIntEmployeeId()),
                    trainee.getTxtParticipantName(),
                    score == null ? "" : String.valueOf(score),
            });
        }
        return csv.toString();
    }

    /**
     * Writes a sheet's scores.
     *
     * @throws RequestValidationException listing every bad row, so the user fixes
     *         the sheet once rather than discovering problems one at a time.
     */
    @Transactional
    public UploadCommitResponse commit(PortalPrincipal caller, UploadCommitRequest request) {
        AppAssessment assessment = requireActiveAssessment(request.examId());

        // Re-resolved from the caller's scope: the sheet's group is a claim, and
        // this is where it is checked.
        List<Participant> roster = scope.find(
                caller, request.locationId(), request.batchId(), request.lgId());

        Map<Long, Participant> byEmployeeId = roster.stream()
                .filter(participant -> participant.getIntEmployeeId() != null)
                .collect(Collectors.toMap(
                        Participant::getIntEmployeeId, Function.identity(), (first, second) -> first));

        List<FieldViolation> violations = new ArrayList<>();
        Map<Long, Integer> pending = new LinkedHashMap<>();
        Set<Long> seen = new LinkedHashSet<>();

        for (int index = 0; index < request.rows().size(); index++) {
            UploadCommitRequest.UploadRow row = request.rows().get(index);
            String field = "rows[" + index + "].";
            Long employeeId = parseEmployeeId(row.employeeId(), field, violations);
            if (employeeId == null) {
                continue;
            }

            if (!byEmployeeId.containsKey(employeeId)) {
                violations.add(new FieldViolation(
                        field + "employeeId",
                        employeeId + " is not in the group this sheet was generated for."));
                continue;
            }
            if (!seen.add(employeeId)) {
                violations.add(new FieldViolation(
                        field + "employeeId", employeeId + " appears more than once in the sheet."));
                continue;
            }

            Integer score = row.score();
            if (score < 0 || score > assessment.getIntMaxScore()) {
                violations.add(new FieldViolation(
                        field + "score",
                        "A score for '" + assessment.getTxtAssessmentName() + "' must be between 0 and "
                                + assessment.getIntMaxScore() + "."));
                continue;
            }

            pending.put(employeeId, score);
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        List<AppCefrBand> bands = cefrMapping.orderedBands();
        String actor = caller.username();
        for (Map.Entry<Long, Integer> entry : pending.entrySet()) {
            resultWriter.write(
                    entry.getKey(), assessment.getIntAssessmentId(), entry.getValue(), bands, request.assessedOn(), actor);
        }

        log.info("Uploaded {} score(s) for assessment {} by {}",
                pending.size(), assessment.getTxtAssessmentName(), actor);

        return new UploadCommitResponse(pending.size());
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private AppAssessment requireActiveAssessment(String examId) {
        Long id;
        try {
            id = Long.valueOf(examId);
        } catch (NumberFormatException ex) {
            throw new RequestValidationException(List.of(
                    new FieldViolation("examId", "'" + examId + "' is not a valid assessment id.")));
        }

        AppAssessment assessment = assessments.findById(id)
                .orElseThrow(() -> NotFoundException.of("assessment", id));

        if (assessment.getTxtStatus() != Status.ACTIVE) {
            throw new BusinessRuleException(
                    "'" + assessment.getTxtAssessmentName()
                            + "' is inactive and can no longer be scored against.");
        }
        return assessment;
    }

    private Long parseEmployeeId(String raw, String field, List<FieldViolation> violations) {
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException ex) {
            violations.add(new FieldViolation(
                    field + "employeeId", "'" + raw + "' is not a valid Employee ID."));
            return null;
        }
    }

    /** Scores already recorded for this assessment, so the template can show them. */
    private Map<Long, Integer> currentScores(List<Participant> trainees, Long assessmentId) {
        if (trainees.isEmpty()) {
            return Map.of();
        }
        List<Long> employeeIds = trainees.stream()
                .map(Participant::getIntEmployeeId)
                .filter(Objects::nonNull)
                .toList();

        return results.findByIntEmployeeIdIn(employeeIds).stream()
                .filter(result -> assessmentId.equals(result.getIntAssessmentId()))
                .filter(result -> result.getIntScore() != null)
                .collect(Collectors.toMap(
                        AppAssessmentResult::getIntEmployeeId,
                        AppAssessmentResult::getIntScore,
                        (first, second) -> first));
    }

    /**
     * Appends a CSV row, quoting any cell that needs it.
     *
     * <p>A trainee named {@code Nair, Aarav} would otherwise split into two columns
     * and shift every later value — the kind of corruption that is only noticed
     * after the sheet is uploaded.
     */
    private void appendRow(StringBuilder csv, String[] cells) {
        for (int index = 0; index < cells.length; index++) {
            if (index > 0) {
                csv.append(',');
            }
            csv.append(csvCell(cells[index]));
        }
        csv.append('\n');
    }

    private String csvCell(String value) {
        String text = value == null ? "" : value;
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return '"' + text.replace("\"", "\"\"") + '"';
        }
        return text;
    }
}
