package com.bizzskill.portal.report.service;

import com.bizzskill.portal.assessment.entity.AppAssessment;
import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.assessment.repository.AppAssessmentRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import com.bizzskill.portal.assessment.repository.AppLapRemedialRepository;
import com.bizzskill.portal.assessment.service.CefrMappingService;
import com.bizzskill.portal.assessment.service.TraineeScopeService;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.organization.entity.Batch;
import com.bizzskill.portal.organization.entity.BizLocation;
import com.bizzskill.portal.organization.entity.LearningGroup;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.organization.repository.BatchRepository;
import com.bizzskill.portal.organization.repository.BizLocationRepository;
import com.bizzskill.portal.organization.repository.LearningGroupRepository;
import com.bizzskill.portal.report.dto.LocationReportResponse;
import com.bizzskill.portal.report.dto.LocationReportResponse.AssessmentConducted;
import com.bizzskill.portal.report.dto.LocationReportResponse.BatchReport;
import com.bizzskill.portal.report.dto.LocationReportResponse.Totals;
import com.bizzskill.portal.report.dto.TraineeReportResponse;
import com.bizzskill.portal.report.dto.TraineeReportResponse.ExamTimeline;
import com.bizzskill.portal.report.dto.TraineeReportResponse.TrackTimeline;
import com.bizzskill.portal.report.dto.TraineeReportResponse.TraineeOption;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The reports behind the reports page.
 *
 * <p>Every read goes through {@link TraineeScopeService}, exactly as the
 * assessment table does, so a Location Admin's location report covers their
 * locations and nothing else. A report is the most tempting place to aggregate
 * the whole organisation — it is asked for as a summary, and a summary that
 * quietly includes groups the caller cannot open leaks their size.
 *
 * <p>Each report is assembled from a fixed number of queries: participants, their
 * batches, the locations, the results and the track placements are each read once
 * and joined in memory, so a location of ten thousand trainees costs the same as
 * a location of ten.
 */
@Service
@Transactional(readOnly = true)
public class ReportService {

    /** Trainees a report search offers at most. */
    private static final int SEARCH_LIMIT = 10;

    /**
     * The order a report search is cut from.
     *
     * <p>Name first, which is the order the choices are shown. The employee number
     * breaks ties, because two trainees can share a name and the option list would
     * otherwise be able to offer one of them twice and the other never.
     */
    private static final Sort SEARCH_ORDER = Sort.by(
            Sort.Order.asc("txtParticipantName"), Sort.Order.asc("intEmployeeId"));

    private final TraineeScopeService scope;
    private final BatchRepository batches;
    private final BizLocationRepository locations;
    private final LearningGroupRepository learningGroups;
    private final AppAssessmentRepository assessments;
    private final AppAssessmentResultRepository results;
    private final AppLapRemedialRepository lapRemedial;
    private final CefrMappingService cefrMapping;

    public ReportService(
            TraineeScopeService scope,
            BatchRepository batches,
            BizLocationRepository locations,
            LearningGroupRepository learningGroups,
            AppAssessmentRepository assessments,
            AppAssessmentResultRepository results,
            AppLapRemedialRepository lapRemedial,
            CefrMappingService cefrMapping) {
        this.scope = scope;
        this.batches = batches;
        this.locations = locations;
        this.learningGroups = learningGroups;
        this.assessments = assessments;
        this.results = results;
        this.lapRemedial = lapRemedial;
        this.cefrMapping = cefrMapping;
    }

    /**
     * The trainees a report search box may be pointed at.
     *
     * <p>Narrowed to the caller's scope in the database, for the same reason the
     * assessment roster is: offering a trainee the caller cannot then open is a
     * worse answer than not offering them, and the count of matches would leak the
     * size of groups that are not theirs.
     *
     * @param term free text matched against the name or employee number.
     */
    public List<TraineeOption> searchTrainees(PortalPrincipal caller, String term, Integer size) {
        int limit = size == null ? SEARCH_LIMIT : Math.max(1, Math.min(size, SEARCH_LIMIT));

        Page<Participant> page = scope.page(
                caller, null, null, null, PageQuery.of(0, limit, term), null, SEARCH_ORDER);

        List<Participant> found = page.getContent().stream()
                .filter(participant -> participant.getIntEmployeeId() != null)
                .toList();

        if (found.isEmpty()) {
            return List.of();
        }

        Set<Long> batchIds = found.stream()
                .map(Participant::getIntBatchId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<Long, String> batchNames = batchIds.isEmpty()
                ? Map.of()
                : batches.findByIntBatchIdInOrderByTxtBatchNameAsc(batchIds).stream()
                        .collect(Collectors.toMap(
                                Batch::getIntBatchId,
                                Batch::getTxtBatchName,
                                (first, second) -> first));

        return found.stream()
                .map(participant -> new TraineeOption(
                        String.valueOf(participant.getIntEmployeeId()),
                        participant.getTxtParticipantName(),
                        batchNames.get(participant.getIntBatchId())))
                .toList();
    }

    /**
     * One trainee's report: their record, their exam timeline and their LAP /
     * Remedial timeline.
     *
     * @throws com.bizzskill.portal.common.error.NotFoundException
     *         if no trainee has that employee number.
     * @throws org.springframework.security.access.AccessDeniedException
     *         if they exist but fall outside the caller's scope.
     */
    public TraineeReportResponse traineeReport(PortalPrincipal caller, Long employeeId) {
        Participant trainee = scope.requireVisible(caller, employeeId);
        Batch batch = findBatch(trainee.getIntBatchId());
        LearningGroup group = trainee.getIntLgId() == null
                ? null
                : learningGroups.findById(trainee.getIntLgId()).orElse(null);
        String locationId = batch == null ? null : batch.getTxtIlpLocationId();

        List<AppAssessment> exams = assessments.findAllByOrderByIntSortOrderAsc();
        List<AppCefrBand> bands = cefrMapping.orderedBands();

        Map<Long, AppAssessmentResult> resultsByExam =
                results.findByIntEmployeeIdIn(List.of(trainee.getIntEmployeeId())).stream()
                        .collect(Collectors.toMap(
                                AppAssessmentResult::getIntAssessmentId,
                                Function.identity(),
                                (first, second) -> first));

        List<AppLapRemedial> placements =
                lapRemedial.findByIntEmployeeIdOrderByDateStartDateDesc(trainee.getIntEmployeeId());

        AppLapRemedial open = placements.stream()
                .filter(placement -> placement.getTxtStatus() == LapStatus.OPEN)
                .findFirst()
                .orElse(null);

        return new TraineeReportResponse(
                String.valueOf(trainee.getIntEmployeeId()),
                trainee.getTxtParticipantName(),
                trainee.getTxtReferenceId(),
                trainee.getTxtRecruitBranch(),
                iso(trainee.getDateIlpDate()),
                trainee.getTxtPhaseId(),
                batch == null ? null : String.valueOf(batch.getIntBatchId()),
                batch == null ? null : batch.getTxtBatchName(),
                batch == null ? null : iso(batch.getDateBatchStartDate()),
                batch == null ? null : iso(batch.getDateBatchEndDate()),
                group == null ? null : String.valueOf(group.getIntLgId()),
                group == null ? null : group.getTxtLgName(),
                locationId,
                locationName(locationId),
                open == null ? null : open.getTxtTrack().name().toLowerCase(Locale.ROOT),
                open == null ? null : iso(open.getDateStartDate()),
                examTimeline(exams, resultsByExam, bands),
                trackTimeline(placements, exams));
    }

    /**
     * One location's report: the batches there, how their trainees are distributed
     * across the tracks, and the assessments that have been conducted.
     *
     * <p>The location is required: this report is about a place, and "no location"
     * has no meaning to count against. The caller's scope is enforced by the same
     * path the roster uses, so asking about another location is refused.
     *
     * @param year    optional year a batch must have begun in; {@code null} means any.
     * @param quarter optional quarter of {@code year} a batch must have begun in.
     *                The period narrows the batches, and with them the trainees the
     *                figures count — the same rule the dashboard and the filter bar
     *                apply, so a quarter means the same thing on both screens.
     */
    public LocationReportResponse locationReport(
            PortalPrincipal caller, String locationId, Integer year, Integer quarter) {

        if (locationId == null || locationId.isBlank()) {
            throw new RequestValidationException(List.of(
                    new FieldViolation("locationId", "Choose a location to report on.")));
        }

        // Enforces the location scope, and answers with the trainees the caller may
        // see there — the two must not be able to disagree, so the scope is applied
        // once, here, and both the counts and the batch list are built from it.
        List<Participant> trainees = scope.find(caller, locationId, null, null);

        Set<Long> allowedBatches = scope.allowedBatchIds(caller);
        List<Batch> locationBatches = batches
                .findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(List.of(locationId)).stream()
                .filter(batch -> allowedBatches == null || allowedBatches.contains(batch.getIntBatchId()))
                .filter(batch -> batch.startedIn(year, quarter))
                .toList();

        Set<Long> batchIds = locationBatches.stream()
                .map(Batch::getIntBatchId)
                .collect(Collectors.toSet());

        // Only the in-period batches' trainees count. A trainee of a batch outside the
        // quarter is not in this quarter's figures, however recently they were scored:
        // the period narrows the batches, and the batches carry their people.
        List<Participant> roster = trainees.stream()
                .filter(trainee -> trainee.getIntEmployeeId() != null
                        && batchIds.contains(trainee.getIntBatchId()))
                .toList();

        List<Long> employeeIds = roster.stream().map(Participant::getIntEmployeeId).toList();
        Map<Long, List<AppLapRemedial>> tracksByEmployee = employeeIds.isEmpty()
                ? Map.of()
                : lapRemedial.findByIntEmployeeIdInOrderByDateStartDateDesc(employeeIds).stream()
                        .collect(Collectors.groupingBy(AppLapRemedial::getIntEmployeeId));

        Set<Long> openRemedial = new HashSet<>();
        Set<Long> openLap = new HashSet<>();
        Set<Long> cleared = new HashSet<>();
        for (Map.Entry<Long, List<AppLapRemedial>> entry : tracksByEmployee.entrySet()) {
            boolean open = false;
            for (AppLapRemedial placement : entry.getValue()) {
                if (placement.getTxtStatus() == LapStatus.OPEN) {
                    open = true;
                    if (placement.getTxtTrack() == LapTrack.LAP) {
                        openLap.add(entry.getKey());
                    } else {
                        openRemedial.add(entry.getKey());
                    }
                }
            }
            // Track history with nothing open is the trainee who has been through
            // remedial support and released — the report's "cleared" column.
            if (!open) {
                cleared.add(entry.getKey());
            }
        }

        List<AppAssessment> exams = assessments.findAllByOrderByIntSortOrderAsc();
        Map<Long, String> batchNames = locationBatches.stream()
                .collect(Collectors.toMap(Batch::getIntBatchId, Batch::getTxtBatchName, (a, b) -> a));
        Sittings sittings = sittings(roster, exams, batchNames);

        List<BatchReport> batchReports = new ArrayList<>();
        for (Batch batch : locationBatches) {
            List<Long> members = roster.stream()
                    .filter(trainee -> batch.getIntBatchId().equals(trainee.getIntBatchId()))
                    .map(Participant::getIntEmployeeId)
                    .toList();

            int remedial = countIn(members, openRemedial);
            int lap = countIn(members, openLap);
            int released = countIn(members, cleared);
            String batchId = String.valueOf(batch.getIntBatchId());

            batchReports.add(new BatchReport(
                    batchId,
                    batch.getTxtBatchName(),
                    batch.getTxtStatus(),
                    iso(batch.getDateBatchStartDate()),
                    iso(batch.getDateBatchEndDate()),
                    members.size(),
                    members.size() - remedial - lap - released,
                    remedial,
                    lap,
                    released,
                    sittings.ofBatch(batchId)));
        }

        int remedialTotal = countIn(employeeIds, openRemedial);
        int lapTotal = countIn(employeeIds, openLap);
        int clearedTotal = countIn(employeeIds, cleared);

        return new LocationReportResponse(
                locationId,
                locationName(locationId),
                new Totals(
                        roster.size(),
                        batchReports.size(),
                        roster.size() - remedialTotal - lapTotal - clearedTotal,
                        remedialTotal,
                        lapTotal,
                        clearedTotal),
                batchReports,
                sittings.atLocation());
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /**
     * The trainee's exams, in the order they were sat.
     *
     * <p>An exam with no result is present with no score and sorted to the end: the
     * timeline's job is to show progress through the programme, so what is still
     * outstanding belongs on it — hiding it would make an incomplete record look
     * complete. Exams sat on the same day keep their configured order, so the
     * timeline does not reorder itself between two reads.
     */
    private List<ExamTimeline> examTimeline(
            List<AppAssessment> exams,
            Map<Long, AppAssessmentResult> resultsByExam,
            List<AppCefrBand> bands) {

        Map<Long, Integer> examOrder = new LinkedHashMap<>();
        List<ExamTimeline> timeline = new ArrayList<>(exams.size());
        for (int index = 0; index < exams.size(); index++) {
            AppAssessment exam = exams.get(index);
            examOrder.put(exam.getIntAssessmentId(), index);
            AppAssessmentResult result = resultsByExam.get(exam.getIntAssessmentId());
            Integer score = result == null ? null : result.getIntScore();

            timeline.add(new ExamTimeline(
                    String.valueOf(exam.getIntAssessmentId()),
                    exam.getTxtAssessmentName(),
                    exam.getIntMaxScore(),
                    score,
                    // Derived from the current mapping, as the assessment table does,
                    // so the report and the grid cannot disagree about a level.
                    score == null ? null : CefrMappingService.levelFor(score, bands),
                    result == null ? null : iso(result.getDateAssessedOn())));
        }

        timeline.sort(Comparator
                .comparingInt((ExamTimeline entry) -> entry.assessedOn() == null ? 1 : 0)
                .thenComparing(ExamTimeline::assessedOn, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparingInt(entry -> examOrder.getOrDefault(
                        Long.valueOf(entry.assessmentId()), Integer.MAX_VALUE)));
        return timeline;
    }

    /** The trainee's LAP / Remedial placements, as the repository returned them: newest first. */
    private List<TrackTimeline> trackTimeline(
            List<AppLapRemedial> placements, List<AppAssessment> exams) {

        Map<Long, String> examNames = exams.stream().collect(Collectors.toMap(
                AppAssessment::getIntAssessmentId,
                AppAssessment::getTxtAssessmentName,
                (first, second) -> first));

        return placements.stream()
                .map(placement -> new TrackTimeline(
                        placement.getTxtTrack().name().toLowerCase(Locale.ROOT),
                        placement.getTxtStatus() == LapStatus.OPEN ? "open" : "closed",
                        iso(placement.getDateStartDate()),
                        iso(placement.getDateCloseDate()),
                        placement.getTxtRemark(),
                        placement.getIntAssessmentId() == null
                                ? null
                                : examNames.get(placement.getIntAssessmentId())))
                .toList();
    }

    /**
     * An assessment a batch sat on one date, with the trainees who sat it.
     *
     * @param employees the trainees, kept as a set rather than a count so the row can
     *                  be read as "these people" and a repeated employee number cannot
     *                  be counted twice.
     */
    private record Sitting(
            String batchId, Long assessmentId, String conductedOn, Set<Long> employees) {
    }

    /**
     * The roster's sittings, cut two ways: grouped by batch, and straight down as the
     * location's chronology.
     *
     * <p>A sitting is read from the results themselves — a result carries the date it
     * was assessed on, so one row per batch, assessment and date is exactly the
     * question "which exams, and when", with no separate timetable to keep in step
     * with the marks. Results with no date are left out, because a date is what this
     * report reports; they remain visible on the trainee's own report.
     *
     * <p>Cut twice from one pass, because both tables are views of the same rows:
     * assembling them separately is how a batch's own figures come to disagree with the
     * location's.
     */
    private Sittings sittings(
            List<Participant> roster, List<AppAssessment> exams, Map<Long, String> batchNames) {

        Map<Long, Integer> examOrder = new LinkedHashMap<>();
        for (int index = 0; index < exams.size(); index++) {
            examOrder.put(exams.get(index).getIntAssessmentId(), index);
        }

        Map<Long, String> examNames = exams.stream().collect(Collectors.toMap(
                AppAssessment::getIntAssessmentId,
                AppAssessment::getTxtAssessmentName,
                (first, second) -> first));

        Map<Long, String> batchByEmployee = new LinkedHashMap<>();
        for (Participant trainee : roster) {
            batchByEmployee.put(
                    trainee.getIntEmployeeId(),
                    trainee.getIntBatchId() == null ? null : String.valueOf(trainee.getIntBatchId()));
        }

        // Keyed by the sitting rather than by the trainee, so the pass is one query and
        // the grouping is one walk over its rows: [batchId, assessmentId, date].
        Map<String, Sitting> bySitting = new LinkedHashMap<>();
        for (AppAssessmentResult result : results.findByIntEmployeeIdIn(
                roster.stream().map(Participant::getIntEmployeeId).toList())) {
            if (result.getDateAssessedOn() == null) {
                continue;
            }
            String date = iso(result.getDateAssessedOn());
            String batchId = batchByEmployee.get(result.getIntEmployeeId());
            String key = batchId + "|" + result.getIntAssessmentId() + "|" + date;

            bySitting.computeIfAbsent(
                            key,
                            ignored -> new Sitting(
                                    batchId,
                                    result.getIntAssessmentId(),
                                    date,
                                    new LinkedHashSet<>()))
                    .employees()
                    .add(result.getIntEmployeeId());
        }

        List<Sitting> sittings = new ArrayList<>(bySitting.values());
        // Newest sitting first: the report is read to see what has been done recently,
        // not what was done first. The configured exam order breaks a day's ties, and
        // the batch breaks the ties it leaves, so the table cannot reorder itself
        // between two reads of the same data.
        sittings.sort(Comparator
                .comparing(Sitting::conductedOn, Comparator.reverseOrder())
                .thenComparingInt(sitting -> examOrder.getOrDefault(
                        sitting.assessmentId(), Integer.MAX_VALUE))
                .thenComparing(Sitting::batchId, Comparator.nullsLast(Comparator.naturalOrder())));

        List<AssessmentConducted> rows = new ArrayList<>(sittings.size());
        Map<String, List<AssessmentConducted>> byBatch = new LinkedHashMap<>();
        for (Sitting sitting : sittings) {
            AssessmentConducted row = toConducted(sitting, examNames, batchNames);
            rows.add(row);
            if (sitting.batchId() != null) {
                byBatch.computeIfAbsent(sitting.batchId(), ignored -> new ArrayList<>()).add(row);
            }
        }

        return new Sittings(byBatch, rows);
    }

    private AssessmentConducted toConducted(
            Sitting sitting,
            Map<Long, String> examNames,
            Map<Long, String> batchNames) {

        Long batchId = sitting.batchId() == null ? null : Long.valueOf(sitting.batchId());

        return new AssessmentConducted(
                sitting.batchId(),
                batchId == null ? null : batchNames.get(batchId),
                String.valueOf(sitting.assessmentId()),
                // An exam deleted out from under its results is named by id rather than
                // dropped: the sitting happened, and hiding it would understate what the
                // location has run.
                examNames.getOrDefault(
                        sitting.assessmentId(), "Assessment " + sitting.assessmentId()),
                sitting.conductedOn(),
                sitting.employees().size());
    }

    /** The sittings grouped by batch, and the same rows read straight down by date. */
    private record Sittings(
            Map<String, List<AssessmentConducted>> byBatch,
            List<AssessmentConducted> atLocation) {

        List<AssessmentConducted> ofBatch(String batchId) {
            return byBatch.getOrDefault(batchId, List.of());
        }
    }

    private Batch findBatch(Long batchId) {
        return batchId == null ? null : batches.findById(batchId).orElse(null);
    }

    /** The location's name, falling back to its code when it is not configured. */
    private String locationName(String locationId) {
        if (locationId == null) {
            return null;
        }
        return locations.findById(locationId)
                .map(BizLocation::getTxtLocationName)
                .orElse(locationId);
    }

    private static int countIn(List<Long> employeeIds, Set<Long> matching) {
        return (int) employeeIds.stream().filter(matching::contains).count();
    }

    /** Renders a date the way every response does — ISO ({@code 2026-01-06}), never a timestamp. */
    private static String iso(LocalDate date) {
        return date == null ? null : date.toString();
    }
}
