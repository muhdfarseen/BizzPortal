package com.bizzskill.portal.organization.service;

import com.bizzskill.portal.organization.dto.OrganizationTree.BatchNode;
import com.bizzskill.portal.organization.dto.OrganizationTree.LgNode;
import com.bizzskill.portal.organization.dto.OrganizationTree.LocationNode;
import com.bizzskill.portal.organization.entity.Batch;
import com.bizzskill.portal.organization.entity.BizLocation;
import com.bizzskill.portal.organization.entity.LearningGroup;
import com.bizzskill.portal.organization.repository.BatchRepository;
import com.bizzskill.portal.organization.repository.BizLocationRepository;
import com.bizzskill.portal.organization.repository.LearningGroupRepository;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Builds the organisation tree the filter bar searches within.
 *
 * <p>This is where role scope becomes a data filter. A Location Admin sees only
 * their assigned locations; a Faculty member sees the same. Every batch and
 * learning group inside an assigned location comes with it — access is granted
 * per location, never per batch. The filter is applied in the query, not in the
 * UI — hiding a row in the browser is not access control.
 *
 * <p>Costs three queries regardless of how large the organisation is, because the
 * levels are fetched in bulk and stitched together in memory. Walking the tree
 * level by level would issue a query per batch, which is the N+1 that makes a
 * filter bar slow exactly when the organisation is big enough to need it.
 */
@Service
@Transactional(readOnly = true)
public class OrganizationService {

    private final BizLocationRepository locations;
    private final BatchRepository batches;
    private final LearningGroupRepository learningGroups;

    public OrganizationService(
            BizLocationRepository locations,
            BatchRepository batches,
            LearningGroupRepository learningGroups) {
        this.locations = locations;
        this.batches = batches;
        this.learningGroups = learningGroups;
    }

    /**
     * The whole hierarchy, narrowed to what the caller may see.
     *
     * @param caller the authenticated principal whose scope is applied.
     * @return locations in name order, each with its batches and their groups.
     */
    public List<LocationNode> locationTree(PortalPrincipal caller) {
        List<BizLocation> visibleLocations = locations.findAllByOrderByTxtLocationNameAsc().stream()
                .filter(location -> maySeeLocation(caller, location.getTxtLocationId()))
                .toList();

        if (visibleLocations.isEmpty()) {
            return List.of();
        }

        List<String> locationIds = visibleLocations.stream()
                .map(BizLocation::getTxtLocationId)
                .toList();

        List<Batch> visibleBatches = batches
                .findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(locationIds);

        Map<Long, List<LearningGroup>> groupsByBatch = visibleBatches.isEmpty()
                ? Map.of()
                : learningGroups.findByIntBatchIdInOrderByTxtLgNameAsc(
                                visibleBatches.stream().map(Batch::getIntBatchId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(LearningGroup::getIntBatchId));

        Map<String, List<Batch>> batchesByLocation = visibleBatches.stream()
                .collect(Collectors.groupingBy(Batch::getTxtIlpLocationId));

        return visibleLocations.stream()
                .map(location -> new LocationNode(
                        location.getTxtLocationId(),
                        location.getTxtLocationName(),
                        batchesByLocation.getOrDefault(location.getTxtLocationId(), List.of()).stream()
                                .map(batch -> new BatchNode(
                                        String.valueOf(batch.getIntBatchId()),
                                        batch.getTxtBatchName(),
                                        iso(batch.getDateBatchStartDate()),
                                        groupsByBatch.getOrDefault(batch.getIntBatchId(), List.of()).stream()
                                                .map(group -> new LgNode(
                                                        String.valueOf(group.getIntLgId()),
                                                        group.getTxtLgName()))
                                                .toList()))
                                .toList()))
                .toList();
    }

    /**
     * The location ids the caller may filter by.
     *
     * <p>Empty means "every location", which is how an unrestricted role is
     * represented in a token and keeps the two cases distinguishable.
     */
    public Set<String> visibleLocationIds(PortalPrincipal caller) {
        if (!caller.isLocationRestricted()) {
            return locations.findAllByOrderByTxtLocationNameAsc().stream()
                    .map(BizLocation::getTxtLocationId)
                    .collect(Collectors.toSet());
        }
        return caller.locationIds();
    }

    private boolean maySeeLocation(PortalPrincipal caller, String locationId) {
        return !caller.isLocationRestricted() || caller.locationIds().contains(locationId);
    }

    /** Renders a date the way every response does — ISO ({@code 2026-01-06}), never a timestamp. */
    private static String iso(LocalDate date) {
        return date == null ? null : date.toString();
    }
}
