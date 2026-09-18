package com.bizzskill.portal.dashboard.service;

import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.assessment.repository.AppLapRemedialRepository;
import com.bizzskill.portal.assessment.service.TraineeScopeService;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.dashboard.dto.DashboardSummaryResponse;
import com.bizzskill.portal.dashboard.dto.DashboardSummaryResponse.LocationBreakdown;
import com.bizzskill.portal.dashboard.dto.DashboardSummaryResponse.Totals;
import com.bizzskill.portal.organization.entity.Batch;
import com.bizzskill.portal.organization.entity.BizLocation;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.organization.repository.BatchRepository;
import com.bizzskill.portal.organization.repository.BizLocationRepository;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The dashboard's headline figures.
 *
 * <p>Goes through {@link TraineeScopeService} for the trainee set, exactly as the
 * assessment table does, so a Location Admin's dashboard counts their location and
 * nothing else. A dashboard is not a special case for authorisation: it is the most
 * likely place for a summary endpoint to quietly count the whole organisation and
 * leak the size of groups a user cannot open.
 *
 * <p>Five queries regardless of the organisation's size — participants, their
 * batches, the locations, and their open tracks.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    private final TraineeScopeService scope;
    private final BatchRepository batches;
    private final BizLocationRepository locations;
    private final AppLapRemedialRepository lapRemedial;

    public DashboardService(
            TraineeScopeService scope,
            BatchRepository batches,
            BizLocationRepository locations,
            AppLapRemedialRepository lapRemedial) {
        this.scope = scope;
        this.batches = batches;
        this.locations = locations;
        this.lapRemedial = lapRemedial;
    }

    /**
     * Summarises the trainees matching a filter.
     *
     * @param locationId optional location code.
     * @param batchId    optional batch id; narrows further than the location.
     * @param lgId       optional learning group id; narrows further than the batch.
     * @param year       optional year a batch must have begun in; `null` means any.
     * @param quarter    optional quarter of {@code year} a batch must have begun in.
     */
    public DashboardSummaryResponse summary(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            Integer year,
            Integer quarter) {

        List<Participant> trainees = scope.find(caller, locationId, batchId, lgId).stream()
                .filter(participant -> participant.getIntEmployeeId() != null)
                .toList();

        if (trainees.isEmpty()) {
            return empty();
        }

        Map<Long, Batch> batchesById = loadBatches(trainees);

        // The period narrows the figures themselves, not only the choices the filter
        // bar offers. With no single batch chosen, "All" has to mean the batches the
        // selection reaches that began in the chosen quarter: a count that ignored the
        // period would answer for batches the user is not looking at, and the cards
        // would disagree with the dropdown right above them.
        if (year != null || quarter != null) {
            Map<Long, Batch> inPeriod = new LinkedHashMap<>();
            for (Batch batch : batchesById.values()) {
                if (startsIn(batch, year, quarter)) {
                    inPeriod.put(batch.getIntBatchId(), batch);
                }
            }

            trainees = trainees.stream()
                    .filter(trainee -> inPeriod.containsKey(trainee.getIntBatchId()))
                    .toList();
            batchesById = inPeriod;

            if (trainees.isEmpty()) {
                return empty();
            }
        }

        Map<String, String> locationNames = loadLocationNames();
        Tracks tracks = loadTracks(trainees);

        int remedial = tracks.remedial().size();
        int lap = tracks.lap().size();

        return new DashboardSummaryResponse(
                new Totals(trainees.size(), batchesById.size(), trainees.size() - remedial - lap, remedial, lap),
                breakdown(trainees, batchesById, locationNames, tracks));
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /** No trainees are in the selection, so there is nothing to count. */
    private static DashboardSummaryResponse empty() {
        return new DashboardSummaryResponse(new Totals(0, 0, 0, 0, 0), List.of());
    }

    /**
     * Whether a batch began in the given year and quarter; a {@code null} half of
     * the period means "any".
     *
     * <p>A batch with no start date on record is in no quarter at all, so it is left
     * out whenever a period is asked for — the same rule the filter bar applies to
     * the batches it offers, so the dropdown and the figures cannot disagree. The year
     * and quarter are read off the date directly rather than through a timezone.
     */
    private static boolean startsIn(Batch batch, Integer year, Integer quarter) {
        if (batch == null || batch.getDateBatchStartDate() == null) {
            return false;
        }

        LocalDate start = batch.getDateBatchStartDate();
        boolean yearMatches = year == null || start.getYear() == year;
        boolean quarterMatches =
                quarter == null || (start.getMonthValue() - 1) / 3 + 1 == quarter;

        return yearMatches && quarterMatches;
    }

    private Map<Long, Batch> loadBatches(List<Participant> trainees) {
        Set<Long> batchIds = trainees.stream()
                .map(Participant::getIntBatchId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());

        if (batchIds.isEmpty()) {
            return Map.of();
        }
        return batches.findByIntBatchIdInOrderByTxtBatchNameAsc(batchIds).stream()
                .collect(Collectors.toMap(Batch::getIntBatchId, Function.identity(), (first, second) -> first));
    }

    private Map<String, String> loadLocationNames() {
        return locations.findAllByOrderByTxtLocationNameAsc().stream()
                .collect(Collectors.toMap(
                        BizLocation::getTxtLocationId,
                        BizLocation::getTxtLocationName,
                        (first, second) -> first));
    }

    /**
     * The employee numbers currently on each track.
     *
     * <p>Only open placements count: a trainee whose track was closed is back to
     * regular, which is what the Remedial and LAP tables show too.
     */
    private Tracks loadTracks(List<Participant> trainees) {
        List<Long> employeeIds = trainees.stream().map(Participant::getIntEmployeeId).toList();

        Map<Long, LapTrack> byEmployee = new LinkedHashMap<>();
        for (AppLapRemedial placement :
                lapRemedial.findByIntEmployeeIdInAndTxtStatus(employeeIds, LapStatus.OPEN)) {
            byEmployee.put(placement.getIntEmployeeId(), placement.getTxtTrack());
        }

        Set<Long> remedial = byEmployee.entrySet().stream()
                .filter(entry -> entry.getValue() == LapTrack.REMEDIAL)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
        Set<Long> lap = byEmployee.entrySet().stream()
                .filter(entry -> entry.getValue() == LapTrack.LAP)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());

        return new Tracks(remedial, lap);
    }

    /**
     * Groups the trainees by the location of their batch.
     *
     * <p>Insertion order follows the participant order, so the breakdown is stable
     * between calls rather than reordering as the map resizes.
     */
    private List<LocationBreakdown> breakdown(
            List<Participant> trainees,
            Map<Long, Batch> batchesById,
            Map<String, String> locationNames,
            Tracks tracks) {

        Map<String, List<Participant>> byLocation = new LinkedHashMap<>();
        for (Participant trainee : trainees) {
            Batch batch = trainee.getIntBatchId() == null ? null : batchesById.get(trainee.getIntBatchId());
            String locationId = batch == null ? null : batch.getTxtIlpLocationId();
            if (locationId == null) {
                continue;
            }
            byLocation.computeIfAbsent(locationId, key -> new ArrayList<>()).add(trainee);
        }

        List<LocationBreakdown> breakdown = new ArrayList<>(byLocation.size());
        for (Map.Entry<String, List<Participant>> entry : byLocation.entrySet()) {
            List<Participant> members = entry.getValue();

            long distinctBatches = members.stream()
                    .map(Participant::getIntBatchId)
                    .filter(java.util.Objects::nonNull)
                    .distinct()
                    .count();

            int remedialCount = (int) members.stream()
                    .filter(member -> tracks.remedial().contains(member.getIntEmployeeId()))
                    .count();
            int lapCount = (int) members.stream()
                    .filter(member -> tracks.lap().contains(member.getIntEmployeeId()))
                    .count();

            breakdown.add(new LocationBreakdown(
                    entry.getKey(),
                    locationNames.getOrDefault(entry.getKey(), entry.getKey()),
                    (int) distinctBatches,
                    members.size(),
                    remedialCount,
                    lapCount));
        }

        // Largest first, so the page's busiest locations lead — and by name where
        // two are the same size, so the order is deterministic.
        breakdown.sort((first, second) -> {
            int bySize = Integer.compare(second.totalTrainee(), first.totalTrainee());
            return bySize != 0 ? bySize : first.locationName().compareTo(second.locationName());
        });
        return breakdown;
    }

    /** The employee numbers on each open track. */
    private record Tracks(Set<Long> remedial, Set<Long> lap) {
    }
}
