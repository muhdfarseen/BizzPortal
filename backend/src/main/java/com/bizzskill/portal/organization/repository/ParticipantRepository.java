package com.bizzskill.portal.organization.repository;

import com.bizzskill.portal.organization.entity.Participant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Read access to the portal-owned {@code participant} table. */
public interface ParticipantRepository
        extends JpaRepository<Participant, Long>, JpaSpecificationExecutor<Participant> {

    /**
     * The roster of a learning group, which is what every assessment screen
     * ultimately lists.
     */
    List<Participant> findByIntBatchIdAndIntLgIdOrderByTxtParticipantNameAsc(
            Long intBatchId, Long intLgId);

    /** Roster of every learning group in a set of batches, for batch-wide reads. */
    List<Participant> findByIntBatchIdInOrderByTxtParticipantNameAsc(Collection<Long> batchIds);

    /**
     * Looks a trainee up by employee number.
     *
     * <p>Returns an {@code Optional} rather than a value because a bulk upload
     * must be able to say "this employee id is not in the group" instead of
     * silently creating a trainee from a typo.
     */
    Optional<Participant> findByIntEmployeeId(Long intEmployeeId);

    List<Participant> findByIntEmployeeIdIn(Collection<Long> employeeIds);

    /** Every participant, for an unfiltered roster. */
    List<Participant> findAllByOrderByTxtParticipantNameAsc();

    /** The participants of several learning groups at once, avoiding a query per group. */
    List<Participant> findByIntLgIdInOrderByTxtParticipantNameAsc(Collection<Long> lgIds);
}
