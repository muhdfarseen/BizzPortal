package com.bizzskill.portal.dashboard.service;

import com.bizzskill.portal.assessment.entity.AppTraineeStatus;
import com.bizzskill.portal.assessment.repository.AppTraineeStatusRepository;
import com.bizzskill.portal.assessment.service.TraineeScopeService;
import com.bizzskill.portal.common.enums.StatusState;
import com.bizzskill.portal.common.enums.TraineeStatus;
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
 * batches, the locations, and the statuses their trainees hold.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    private final TraineeScopeService scope;
    private final BatchRepository batches;
    private final BizLocationRepository locations;
    private final AppTraineeStatusRepository traineeStatuses;

    public DashboardService(
            TraineeScopeService scope,
            BatchRepository batches,
            BizLocationRepository locations,
            AppTraineeStatusRepository traineeStatuses) {
        this.scope = scope;
        this.batches = batches;
        this.locations = locations;
        this.traineeStatuses = traineeStatuses;
    }

    /**
     * Summarises the trainees matching a filter.
     *
     * @param locationId optional location code.
     * @param batchId    optional batch id; narrows further than the location.
     * @param lgId       optional learning group id; narrows further than the batch.
     */
    public DashboardSummaryResponse summary(
            PortalPrincipal caller, String locationId, Long batchId, Long lgId) {

        List<Participant> trainees = scope.find(caller, locationId, batchId, lgId).stream()
                .filter(participant -> participant.getIntEmployeeId() != null)
                .toList();

        if (trainees.isEmpty()) {
            return new DashboardSummaryResponse(new Totals(0, 0, 0, 0, 0, 0, 0), List.of());
        }

        Map<Long, Batch> batchesById = loadBatches(trainees);
        Map<String, String> locationNames = loadLocationNames();
        Statuses statuses = loadStatuses(trainees);

        int remedial = statuses.with(TraineeStatus.REMEDIAL).size();
        int lap = statuses.with(TraineeStatus.LAP).size();
        int cleared = statuses.with(TraineeStatus.CLEARED).size();
        int others = statuses.exits().size();

        return new DashboardSummaryResponse(
                new Totals(
                        trainees.size(),
                        batchesById.size(),
                        // Everyone holding no status at all. Derived rather than
                        // counted separately, so the five figures cannot drift from
                        // the total.
                        trainees.size() - remedial - lap - cleared - others,
                        remedial,
                        lap,
                        cleared,
                        others),
                breakdown(trainees, batchesById, locationNames, statuses));
    }

    // ── Internals ───────────────────────────────────────────────────────────

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
     * The employee numbers currently holding each status.
     *
     * <p>Only current rows count: a superseded status is history, and the trainee
     * has moved on from it — to another status, or to none at all.
     */
    private Statuses loadStatuses(List<Participant> trainees) {
        List<Long> employeeIds = trainees.stream().map(Participant::getIntEmployeeId).toList();

        Map<Long, TraineeStatus> byEmployee = new LinkedHashMap<>();
        for (AppTraineeStatus period :
                traineeStatuses.findByIntEmployeeIdInAndTxtState(employeeIds, StatusState.CURRENT)) {
            byEmployee.put(period.getIntEmployeeId(), period.getTxtTraineeStatus());
        }

        return new Statuses(byEmployee);
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
            Statuses statuses) {

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
                    .filter(member -> statuses.holds(member.getIntEmployeeId(), TraineeStatus.REMEDIAL))
                    .count();
            int lapCount = (int) members.stream()
                    .filter(member -> statuses.holds(member.getIntEmployeeId(), TraineeStatus.LAP))
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

    /**
     * The current status of every trainee in the selection, by employee number.
     *
     * <p>Absence from the map is meaningful: the trainee holds no status, which is
     * the regular case and the largest group on most real rosters. Keeping it as a
     * missing key rather than a stored value mirrors how the database records it.
     */
    private record Statuses(Map<Long, TraineeStatus> byEmployee) {

        /** The employee numbers holding exactly this status. */
        Set<Long> with(TraineeStatus status) {
            return idsMatching(status::equals);
        }

        /** The employee numbers who left — discontinued, purged or resigned. */
        Set<Long> exits() {
            return idsMatching(TraineeStatus::isExit);
        }

        boolean holds(Long employeeId, TraineeStatus status) {
            return status == byEmployee.get(employeeId);
        }

        private Set<Long> idsMatching(java.util.function.Predicate<TraineeStatus> wanted) {
            return byEmployee.entrySet().stream()
                    .filter(entry -> wanted.test(entry.getValue()))
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toSet());
        }
    }
}
