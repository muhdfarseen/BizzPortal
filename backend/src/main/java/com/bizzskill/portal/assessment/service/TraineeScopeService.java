package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.repository.TraineeRosterSpecifications;
import com.bizzskill.portal.common.enums.TrackFilter;
import com.bizzskill.portal.common.error.NotFoundException;
import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.organization.entity.Batch;
import com.bizzskill.portal.organization.entity.LearningGroup;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.organization.repository.BatchRepository;
import com.bizzskill.portal.organization.repository.LearningGroupRepository;
import com.bizzskill.portal.organization.repository.ParticipantRepository;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Resolves which trainees a caller is allowed to see.
 *
 * <p>Every trainee-facing read and write goes through here, so the scoping rule
 * exists once. A Faculty member restricted to one batch must not be able to read
 * another batch's roster by editing a query string — and must not be able to score
 * a trainee outside it either, which is why writes call
 * {@link #requireVisible} rather than trusting the id in the URL.
 *
 * <p>Asking for a group outside your scope is answered with 403 rather than an
 * empty list: an empty roster is indistinguishable from a batch that genuinely has
 * no trainees, which would hide a mistake or a probe behind a plausible result.
 */
@Service
@Transactional(readOnly = true)
public class TraineeScopeService {

    private final ParticipantRepository participants;
    private final BatchRepository batches;
    private final LearningGroupRepository learningGroups;

    public TraineeScopeService(
            ParticipantRepository participants,
            BatchRepository batches,
            LearningGroupRepository learningGroups) {
        this.participants = participants;
        this.batches = batches;
        this.learningGroups = learningGroups;
    }

    /**
     * The trainees matching a filter, narrowed to the caller's scope.
     *
     * @param locationId optional location code.
     * @param batchId    optional batch id; takes precedence over the location.
     * @param lgId       optional learning group id; takes precedence over both.
     */
    public List<Participant> find(
            PortalPrincipal caller, String locationId, Long batchId, Long lgId) {

        ResolvedScope resolved = resolve(caller, locationId, batchId, lgId);

        if (resolved.lgId() != null) {
            return participants.findByIntLgIdInOrderByTxtParticipantNameAsc(Set.of(resolved.lgId()));
        }

        // null means unrestricted, empty means nothing is visible; the two must not
        // collapse into one another.
        if (resolved.batchIds() == null) {
            return participants.findAllByOrderByTxtParticipantNameAsc();
        }

        return resolved.batchIds().isEmpty()
                ? List.of()
                : participants.findByIntBatchIdInOrderByTxtParticipantNameAsc(resolved.batchIds());
    }

    /**
     * One page of trainees, narrowed to the caller's scope and to the given filters.
     *
     * <p>The sibling of {@link #find} for screens that page. The scope rules are
     * resolved here exactly as they are for a full read — the same 403 for an
     * out-of-scope group — so paging cannot become a way around them. The filters
     * and the page are both applied in the database, so the total the client is
     * given counts the filtered set rather than whatever happened to be loaded.
     *
     * <p>{@link #find} is still used by the reads that genuinely need every trainee
     * of a group: the dashboard's totals and a bulk upload's commit. Those are
     * aggregates over the whole set rather than a list someone scrolls.
     *
     * @param locationId optional location code.
     * @param batchId    optional batch id; takes precedence over the location.
     * @param lgId       optional learning group id; takes precedence over both.
     * @param paging     the requested page and search text.
     * @param track      optional LAP / Remedial filter, or null for every trainee.
     * @param sort       the order pages are cut from; must be a total order.
     */
    public Page<Participant> page(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            PageQuery paging,
            TrackFilter track,
            Sort sort) {

        ResolvedScope resolved = resolve(caller, locationId, batchId, lgId);
        Specification<Participant> spec =
                TraineeRosterSpecifications.inScope(resolved.lgId(), resolved.batchIds());

        Specification<Participant> search = TraineeRosterSpecifications.matchesSearch(paging.search());
        if (search != null) {
            spec = spec.and(search);
        }

        Specification<Participant> onTrack = TraineeRosterSpecifications.onTrack(track);
        if (onTrack != null) {
            spec = spec.and(onTrack);
        }

        return participants.findAll(spec, paging.toPageRequest(sort));
    }

    /**
     * The named trainees of a group, narrowed to the caller's scope.
     *
     * <p>For a caller that already knows which employee numbers it cares about — a
     * bulk upload holding the numbers in a sheet — so the group's other trainees are
     * neither read nor sent.
     */
    public List<Participant> findWithin(
            PortalPrincipal caller,
            String locationId,
            Long batchId,
            Long lgId,
            Collection<Long> employeeIds) {

        ResolvedScope resolved = resolve(caller, locationId, batchId, lgId);

        Specification<Participant> spec = TraineeRosterSpecifications.inScope(
                resolved.lgId(), resolved.batchIds());

        Specification<Participant> named = TraineeRosterSpecifications.hasEmployeeId(employeeIds);
        if (named != null) {
            spec = spec.and(named);
        }

        return participants.findAll(spec, Sort.by(Sort.Order.asc("intEmployeeId")));
    }

    /**
     * How many trainees a group holds, narrowed to the caller's scope.
     *
     * <p>A count query rather than loading the group and taking its size: the bulk
     * upload preview needs to know how many trainees the sheet left out, and paying
     * for every row to learn a number would defeat the point of not loading them.
     */
    public long count(PortalPrincipal caller, String locationId, Long batchId, Long lgId) {
        ResolvedScope resolved = resolve(caller, locationId, batchId, lgId);
        return participants.count(
                TraineeRosterSpecifications.inScope(resolved.lgId(), resolved.batchIds()));
    }

    /**
     * The group a set of query parameters resolves to, with scope already enforced.
     *
     * <p>Shared by every paged read so the authorisation checks cannot be applied on
     * one path and forgotten on another.
     */
    private record ResolvedScope(Long lgId, Collection<Long> batchIds) {
    }

    private ResolvedScope resolve(
            PortalPrincipal caller, String locationId, Long batchId, Long lgId) {

        Set<Long> allowedBatches = allowedBatchIds(caller);

        if (lgId != null) {
            LearningGroup group = learningGroups.findById(lgId)
                    .orElseThrow(() -> NotFoundException.of("learning group", lgId));
            requireAllowedBatch(allowedBatches, group.getIntBatchId());
            return new ResolvedScope(lgId, null);
        }

        if (batchId != null) {
            requireAllowedBatch(allowedBatches, batchId);
            return new ResolvedScope(null, Set.of(batchId));
        }

        if (locationId != null) {
            requireAllowedLocation(caller, locationId);
            return new ResolvedScope(null, batches
                    .findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(List.of(locationId)).stream()
                    .map(Batch::getIntBatchId)
                    .filter(id -> allowedBatches == null || allowedBatches.contains(id))
                    .toList());
        }

        return new ResolvedScope(null, allowedBatches);
    }

    /**
     * Loads one trainee and refuses the caller if they fall outside their scope.
     *
     * @throws NotFoundException  if no trainee has that employee number.
     * @throws AccessDeniedException if they exist but belong to another group.
     */
    public Participant requireVisible(PortalPrincipal caller, Long employeeId) {
        Participant participant = participants.findByIntEmployeeId(employeeId)
                .orElseThrow(() -> NotFoundException.of("trainee", employeeId));

        requireAllowedBatch(allowedBatchIds(caller), participant.getIntBatchId());
        return participant;
    }

    /**
     * The batch ids a caller may see, or {@code null} when unrestricted.
     *
     * <p>{@code null} rather than "every id" so an unrestricted role costs no extra
     * query, and so the distinction survives into the repository call.
     */
    public Set<Long> allowedBatchIds(PortalPrincipal caller) {
        if (caller.isBatchRestricted()) {
            return caller.batchIds();
        }
        if (caller.isLocationRestricted()) {
            return batches.findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(caller.locationIds()).stream()
                    .map(Batch::getIntBatchId)
                    .collect(Collectors.toSet());
        }
        return null;
    }

    private void requireAllowedBatch(Set<Long> allowedBatches, Long batchId) {
        if (allowedBatches != null && !allowedBatches.contains(batchId)) {
            throw new AccessDeniedException("That group is outside your assigned scope.");
        }
    }

    private void requireAllowedLocation(PortalPrincipal caller, String locationId) {
        if (caller.isLocationRestricted() && !caller.locationIds().contains(locationId)) {
            throw new AccessDeniedException("That location is outside your assigned scope.");
        }
    }
}
