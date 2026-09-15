package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppTraineeStatus;
import com.bizzskill.portal.common.enums.StatusState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Read/write access to the periods trainees hold a status. */
public interface AppTraineeStatusRepository extends JpaRepository<AppTraineeStatus, Long> {

    /**
     * The trainee's current status.
     *
     * <p>At most one row can match: the database enforces it with a partial
     * unique index on current rows.
     */
    Optional<AppTraineeStatus> findByIntEmployeeIdAndTxtState(Long intEmployeeId, StatusState txtState);

    /** Current statuses for a whole roster, in a single query. */
    List<AppTraineeStatus> findByIntEmployeeIdInAndTxtState(
            Collection<Long> employeeIds, StatusState txtState);

    /**
     * Every status a trainee has held, newest first.
     *
     * <p>Ordered by start date and then by id, because a trainee can hold two
     * statuses on the same day — corrected the morning after, say — and an order
     * that stopped at the date would leave which of them came first to the
     * database's discretion.
     */
    List<AppTraineeStatus> findByIntEmployeeIdOrderByDateStartDateDescIntTraineeStatusIdDesc(
            Long intEmployeeId);

    /**
     * Status history for a whole roster, newest first.
     *
     * <p>Loaded in bulk so a roster of any size costs one query rather than one
     * per trainee.
     */
    List<AppTraineeStatus> findByIntEmployeeIdInOrderByDateStartDateDescIntTraineeStatusIdDesc(
            Collection<Long> employeeIds);
}
