package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.TraineeStatusLookupResponse;
import com.bizzskill.portal.assessment.dto.TraineeStatusRequest;
import com.bizzskill.portal.assessment.dto.TraineeStatusUploadRequest;
import com.bizzskill.portal.assessment.dto.TraineeStatusUploadResponse;
import com.bizzskill.portal.assessment.entity.AppAssessment;
import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.entity.AppTraineeStatus;
import com.bizzskill.portal.assessment.repository.AppAssessmentRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import com.bizzskill.portal.assessment.repository.AppTraineeStatusRepository;
import com.bizzskill.portal.common.enums.StatusFilter;
import com.bizzskill.portal.common.enums.StatusState;
import com.bizzskill.portal.common.enums.TraineeStatus;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The bulk status sheet: the downloadable template, and the commit.
 *
 * <p>The sheet is the tab the user is looking at, laid out as a file. Its first
 * columns identify the trainee and show the marks that explain the decision — the
 * marks are reference only, read by nobody but the person deciding — and its last
 * three columns are the ones they fill in: the status, the day it takes effect and
 * the reason for it.
 *
 * <p>A row left blank asks for no change and is simply not sent. That is what makes
 * the sheet usable: it lists the whole tab, and a user correcting four trainees
 * should not have to retype the other forty, nor have the forty rejected for
 * "already on Remedial".
 *
 * <p>Whatever the browser previewed, the server validates the sheet again for
 * itself — every employee in the group, no duplicates, a real status, a date that
 * cannot be in the future or before the status it replaces — because the preview is
 * a convenience and the commit is the write. A commit is all-or-nothing: applying
 * the good rows and reporting the bad ones would leave the roster half-updated with
 * no way to tell which half.
 */
@Service
@Transactional(readOnly = true)
public class TraineeStatusUploadService {

    private static final Logger log = LoggerFactory.getLogger(TraineeStatusUploadService.class);

    /** The request value meaning "hold no status", which is the absence of a row. */
    private static final String REGULAR = "regular";

    /** Who the row is about. No user edits these, so they lead the sheet. */
    private static final String[] IDENTITY_HEADERS = {"Emp ID", "Name"};

    /** The status the trainee holds now, between the marks and the editable columns. */
    private static final String CURRENT_STATUS_HEADER = "Current Status";

    /**
     * What the user fills in, in this order at the end of every row.
     *
     * <p>Last, so the columns being typed into sit together at the right-hand edge of
     * the sheet, away from the reference columns that scroll past them.
     */
    private static final String[] EDITABLE_HEADERS = {"New Status", "Effective Date", "Remark"};

    private final TraineeScopeService scope;
    private final AppAssessmentRepository assessments;
    private final AppAssessmentResultRepository results;
    private final AppTraineeStatusRepository statuses;
    private final CefrMappingService cefrMapping;
    private final TraineeStatusService statusChanges;

    public TraineeStatusUploadService(
            TraineeScopeService scope,
            AppAssessmentRepository assessments,
            AppAssessmentResultRepository results,
            AppTraineeStatusRepository statuses,
            CefrMappingService cefrMapping,
            TraineeStatusService statusChanges) {
        this.scope = scope;
        this.assessments = assessments;
        this.results = results;
        this.statuses = statuses;
        this.cefrMapping = cefrMapping;
        this.statusChanges = statusChanges;
    }

    /**
     * The sheet to fill in: one tab's trainees, with the marks that explain them.
     *
     * <p>Prefilled with the trainees rather than left blank, so the employee numbers
     * are ones the server will accept and the user can see who they are deciding
     * about. Only the three columns they are meant to type into are empty.
     *
     * @param status  the tab being downloaded, or null for every trainee in the group.
     * @param examIds the assessments whose marks are shown, in the order requested.
     *                Their names become column headers.
     */
    public String templateCsv(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            StatusFilter status,
            List<String> examIds) {

        List<AppAssessment> exams = requireExams(examIds);
        List<Participant> trainees = scope.find(caller, locationId, batchId, lgId, status);

        StringBuilder csv = new StringBuilder();
        List<String> headers = new ArrayList<>(List.of(IDENTITY_HEADERS));
        exams.forEach(exam -> headers.add(exam.getTxtAssessmentName()));
        headers.add(CURRENT_STATUS_HEADER);
        headers.addAll(List.of(EDITABLE_HEADERS));
        appendRow(csv, headers);

        if (trainees.isEmpty()) {
            return csv.toString();
        }

        List<Long> employeeIds = trainees.stream()
                .map(Participant::getIntEmployeeId)
                // Row-level ids; the join table has them non-null, but a hand-edited
                // database could hold a null, and one null would fail the lookups.
                .filter(java.util.Objects::nonNull)
                .toList();

        Map<Long, Map<Long, AppAssessmentResult>> resultsByEmployee = results
                .findByIntEmployeeIdIn(employeeIds).stream()
                .collect(Collectors.groupingBy(
                        AppAssessmentResult::getIntEmployeeId,
                        Collectors.toMap(
                                AppAssessmentResult::getIntAssessmentId,
                                Function.identity(),
                                (first, second) -> first)));

        // The current period only: the sheet is about the status each trainee holds
        // now, and the history behind it is not what the user is deciding about.
        Map<Long, AppTraineeStatus> currentByEmployee = currentPeriods(employeeIds);

        // Loaded once and reused for every mark, so a sheet of a thousand rows costs
        // one query for the bands rather than one per row.
        List<AppCefrBand> bands = cefrMapping.orderedBands();

        for (Participant trainee : trainees) {
            Long employeeId = trainee.getIntEmployeeId();
            Map<Long, AppAssessmentResult> byExam =
                    resultsByEmployee.getOrDefault(employeeId, Map.of());
            AppTraineeStatus current = currentByEmployee.get(employeeId);

            List<String> cells = new ArrayList<>();
            cells.add(String.valueOf(employeeId));
            cells.add(trainee.getTxtParticipantName());

            for (AppAssessment exam : exams) {
                cells.add(markCell(byExam.get(exam.getIntAssessmentId()), bands));
            }

            cells.add(current == null ? "Regular" : current.getTxtTraineeStatus().getLabel());
            cells.addAll(List.of("", "", ""));
            appendRow(csv, cells);
        }

        return csv.toString();
    }

    /**
     * What the sheet's employees hold now, for judging the sheet before it is sent.
     *
     * <p>Lets the browser preview catch the three mistakes a person actually makes on
     * a status sheet — the status they already hold, ending a status that is not
     * there, and a date before the one they are on began — without the server having
     * to be told about the sheet first. The commit checks all three again regardless;
     * this is so the user finds out before uploading rather than after.
     *
     * <p>Answers only about the numbers asked for, and only those the caller may see,
     * so a preview costs one query no matter how large the group is.
     */
    public TraineeStatusLookupResponse lookup(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            List<Long> employeeIds) {

        if (employeeIds == null || employeeIds.isEmpty()) {
            return new TraineeStatusLookupResponse(List.of());
        }

        List<Participant> found = scope.findWithin(caller, locationId, batchId, lgId, employeeIds);

        Map<Long, AppTraineeStatus> currentByEmployee = currentPeriods(
                found.stream().map(Participant::getIntEmployeeId).toList());

        List<TraineeStatusLookupResponse.TraineeStatusRef> trainees = found.stream()
                .map(trainee -> {
                    AppTraineeStatus current = currentByEmployee.get(trainee.getIntEmployeeId());
                    return new TraineeStatusLookupResponse.TraineeStatusRef(
                            String.valueOf(trainee.getIntEmployeeId()),
                            trainee.getTxtParticipantName(),
                            current == null ? null : current.getTxtTraineeStatus().getCode(),
                            current == null ? null : current.getDateStartDate().toString());
                })
                .toList();

        return new TraineeStatusLookupResponse(trainees);
    }

    /**
     * Applies a sheet's status changes.
     *
     * <p>Every rule the single-change path enforces is enforced here too, and the
     * write goes through that same service rather than around it: a sheet is a way to
     * ask for many changes, not a second implementation of what a change is.
     *
     * @throws RequestValidationException listing every bad row by its position in the
     *         sheet's data, so the user fixes it once rather than one row at a time.
     */
    @Transactional
    public TraineeStatusUploadResponse commit(
            PortalPrincipal caller, TraineeStatusUploadRequest request) {

        List<FieldViolation> violations = new ArrayList<>();
        Map<Long, Integer> rowIndexByEmployee = new LinkedHashMap<>();
        Map<Long, LocalDate> dateByEmployee = new LinkedHashMap<>();

        // ── Which trainee each row is about ────────────────────────────────────
        for (int index = 0; index < request.rows().size(); index++) {
            TraineeStatusUploadRequest.Row row = request.rows().get(index);
            String field = field(index);
            Long employeeId = parseEmployeeId(row.employeeId(), field, violations);
            if (employeeId == null) {
                continue;
            }
            if (rowIndexByEmployee.containsKey(employeeId)) {
                violations.add(new FieldViolation(
                        field + "employeeId",
                        "Employee " + employeeId + " appears more than once in the sheet. "
                                + "A sheet may ask for one change per trainee."));
                continue;
            }
            rowIndexByEmployee.put(employeeId, index);
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        // ── Everything the sheet names must be inside the group it claims ──────
        // Re-resolved from the caller's scope: the sheet's group is a claim, and this
        // is where it is checked. One query for the whole sheet.
        Set<Long> visible = scope
                .findWithin(caller, request.locationId(), request.batchId(), request.lgId(),
                        rowIndexByEmployee.keySet())
                .stream()
                .map(Participant::getIntEmployeeId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        for (Map.Entry<Long, Integer> entry : rowIndexByEmployee.entrySet()) {
            if (!visible.contains(entry.getKey())) {
                violations.add(new FieldViolation(
                        field(entry.getValue()) + "employeeId",
                        entry.getKey() + " is not in the group this sheet was generated for."));
            }
        }

        // ── The status, the date, and whether the change means anything ────────
        Map<Long, AppTraineeStatus> currentByEmployee = currentPeriods(visible);

        for (Map.Entry<Long, Integer> entry : rowIndexByEmployee.entrySet()) {
            Long employeeId = entry.getKey();
            TraineeStatusUploadRequest.Row row = request.rows().get(entry.getValue());
            String field = field(entry.getValue());

            AppTraineeStatus current = currentByEmployee.get(employeeId);
            TraineeStatus target = REGULAR.equals(row.status())
                    ? null
                    : TraineeStatus.fromCode(row.status());

            if (target == null && current == null) {
                violations.add(new FieldViolation(
                        field + "status",
                        "Employee " + employeeId + " is already regular — they hold no status to end."));
                continue;
            }
            if (target != null && current != null && current.getTxtTraineeStatus() == target) {
                violations.add(new FieldViolation(
                        field + "status",
                        "Employee " + employeeId + " already holds " + target.getLabel() + "."));
                continue;
            }

            LocalDate effectiveDate = requireUsableDate(
                    row.effectiveDate(), field + "effectiveDate", violations);
            if (effectiveDate == null) {
                continue;
            }

            if (current != null && effectiveDate.isBefore(current.getDateStartDate())) {
                violations.add(new FieldViolation(
                        field + "effectiveDate",
                        "Employee " + employeeId + " has been on "
                                + current.getTxtTraineeStatus().getLabel() + " since "
                                + current.getDateStartDate() + ". Choose that date or later."));
                continue;
            }

            dateByEmployee.put(employeeId, effectiveDate);
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        // ── Apply ─────────────────────────────────────────────────────────────
        // Through the single-change service, so a sheet and a click on the screen
        // produce byte-for-byte the same rows and the same history.
        String actor = caller.username();
        for (Map.Entry<Long, Integer> entry : rowIndexByEmployee.entrySet()) {
            Long employeeId = entry.getKey();
            TraineeStatusUploadRequest.Row row = request.rows().get(entry.getValue());

            statusChanges.save(caller, employeeId, new TraineeStatusRequest(
                    row.status(),
                    row.remark(),
                    dateByEmployee.get(employeeId).toString()));
        }

        log.info("Applied {} trainee status change(s) from a sheet by {}",
                rowIndexByEmployee.size(), actor);

        return new TraineeStatusUploadResponse(rowIndexByEmployee.size());
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /**
     * The status each of these trainees holds now, keyed by employee number.
     *
     * <p>One query for the whole set. A trainee who holds no status is simply absent
     * from the map, which is what "regular" means.
     */
    private Map<Long, AppTraineeStatus> currentPeriods(Collection<Long> employeeIds) {
        if (employeeIds.isEmpty()) {
            return Map.of();
        }
        return statuses.findByIntEmployeeIdInAndTxtState(employeeIds, StatusState.CURRENT).stream()
                .collect(Collectors.toMap(
                        AppTraineeStatus::getIntEmployeeId,
                        Function.identity(),
                        (first, second) -> first));
    }

    /**
     * How a row is addressed in an error, counted from the first data row.
     *
     * <p>One-based, because the sheet's header is row 1 and the user sees the same
     * numbers in whichever reader opened the file.
     */
    private String field(int index) {
        return "rows[" + (index + 1) + "].";
    }

    /**
     * The mark columns' cells: the score and the level it maps to, as one value.
     *
     * <p>One column per assessment rather than two, because the level is derived from
     * the score and a reader who has one has the other. A trainee who did not sit the
     * paper gets an empty cell, not a zero — a zero would read as a score.
     */
    private String markCell(AppAssessmentResult result, List<AppCefrBand> bands) {
        if (result == null || result.getIntScore() == null) {
            return "";
        }
        int score = result.getIntScore();
        String level = CefrMappingService.levelFor(score, bands);
        return level == null || level.isBlank() ? String.valueOf(score) : score + " - " + level;
    }

    /**
     * Resolves the marks to show against the configured assessments, keeping the
     * order the client asked for so the sheet's columns match the table's.
     */
    private List<AppAssessment> requireExams(List<String> examIds) {
        if (examIds == null || examIds.isEmpty()) {
            return List.of();
        }

        Map<Long, AppAssessment> configured = assessments.findAllByOrderByIntSortOrderAsc().stream()
                .collect(Collectors.toMap(
                        AppAssessment::getIntAssessmentId, Function.identity(), (first, second) -> first));

        List<FieldViolation> violations = new ArrayList<>();
        Map<Long, AppAssessment> chosen = new LinkedHashMap<>();

        for (String raw : examIds) {
            Long id = parseId(raw, "examIds", "is not a valid assessment id", violations);
            if (id == null) {
                continue;
            }
            AppAssessment exam = configured.get(id);
            if (exam == null) {
                violations.add(new FieldViolation(
                        "examIds", "'" + raw + "' is not an assessment."));
                continue;
            }
            // A repeated parameter is harmless, but two columns with one name are not.
            chosen.putIfAbsent(id, exam);
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }
        return List.copyOf(chosen.values());
    }

    /**
     * Reads a date, defaulting a blank one to today and refusing the future.
     *
     * <p>The same rules as the single-change path, with the row named so the message
     * can be acted on. Blank means today rather than "no change": a row that names a
     * status is asking for a change, and a change has to be dated. A day of slack is
     * allowed on "today" because the server works in UTC, and for a user east of it
     * their today is already tomorrow here.
     *
     * @return the date, or null when it was reported as a violation.
     */
    private LocalDate requireUsableDate(
            String value, String field, List<FieldViolation> violations) {

        if (value == null || value.isBlank()) {
            return LocalDate.now(ZoneOffset.UTC);
        }
        LocalDate date;
        try {
            date = LocalDate.parse(value);
        } catch (DateTimeParseException malformed) {
            violations.add(new FieldViolation(field, "Use a real date, as yyyy-MM-dd."));
            return null;
        }
        if (date.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1))) {
            violations.add(new FieldViolation(field, "A status cannot start in the future."));
            return null;
        }
        return date;
    }

    private Long parseEmployeeId(String raw, String field, List<FieldViolation> violations) {
        return parseId(raw, field + "employeeId", "is not a valid Employee ID", violations);
    }

    private Long parseId(String raw, String field, String complaint, List<FieldViolation> violations) {
        if (raw == null || raw.isBlank()) {
            violations.add(new FieldViolation(field, "Enter a number."));
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException invalid) {
            violations.add(new FieldViolation(field, "'" + raw.trim() + "' " + complaint + "."));
            return null;
        }
    }

    /**
     * Appends a CSV row, quoting any cell that needs it.
     *
     * <p>A trainee named {@code Nair, Aarav} would otherwise split into two columns
     * and shift every later value — the kind of corruption that is only noticed after
     * the sheet is uploaded.
     */
    private void appendRow(StringBuilder csv, List<String> cells) {
        for (int index = 0; index < cells.size(); index++) {
            if (index > 0) {
                csv.append(',');
            }
            csv.append(csvCell(cells.get(index)));
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
