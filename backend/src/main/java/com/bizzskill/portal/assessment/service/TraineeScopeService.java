package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.common.error.NotFoundException;
import com.bizzskill.portal.organization.entity.Batch;
import com.bizzskill.portal.organization.entity.LearningGroup;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.organization.repository.BatchRepository;
import com.bizzskill.portal.organization.repository.LearningGroupRepository;
import com.bizzskill.portal.organization.repository.ParticipantRepository;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

        Set<Long> allowedBatches = allowedBatchIds(caller);

        if (lgId != null) {
            LearningGroup group = learningGroups.findById(lgId)
                    .orElseThrow(() -> NotFoundException.of("learning group", lgId));
            requireAllowedBatch(allowedBatches, group.getIntBatchId());
            return participants.findByIntLgIdInOrderByTxtParticipantNameAsc(Set.of(lgId));
        }

        if (batchId != null) {
            requireAllowedBatch(allowedBatches, batchId);
            return participants.findByIntBatchIdInOrderByTxtParticipantNameAsc(Set.of(batchId));
        }

        if (locationId != null) {
            requireAllowedLocation(caller, locationId);
            List<Long> batchIds = batches
                    .findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(List.of(locationId)).stream()
                    .map(Batch::getIntBatchId)
                    .filter(id -> allowedBatches == null || allowedBatches.contains(id))
                    .toList();
            return batchIds.isEmpty()
                    ? List.of()
                    : participants.findByIntBatchIdInOrderByTxtParticipantNameAsc(batchIds);
        }

        if (allowedBatches == null) {
            return participants.findAllByOrderByTxtParticipantNameAsc();
        }
        return allowedBatches.isEmpty()
                ? List.of()
                : participants.findByIntBatchIdInOrderByTxtParticipantNameAsc(allowedBatches);
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
