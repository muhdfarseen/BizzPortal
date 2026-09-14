package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.common.enums.LapStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Read/write access to LAP / Remedial placements. */
public interface AppLapRemedialRepository extends JpaRepository<AppLapRemedial, Long> {

    /**
     * The trainee's current track.
     *
     * <p>At most one row can match: the database enforces it with a partial
     * unique index on open placements.
     */
    Optional<AppLapRemedial> findByIntEmployeeIdAndTxtStatus(Long intEmployeeId, LapStatus txtStatus);

    /** Current tracks for a whole roster, in a single query. */
    List<AppLapRemedial> findByIntEmployeeIdInAndTxtStatus(
            Collection<Long> employeeIds, LapStatus txtStatus);

    List<AppLapRemedial> findByIntEmployeeIdOrderByDateStartDateDesc(Long intEmployeeId);

    /**
     * Track history for a whole roster, newest first.
     *
     * <p>Loaded in bulk so a roster of any size costs one query rather than one
     * per trainee.
     */
    List<AppLapRemedial> findByIntEmployeeIdInOrderByDateStartDateDesc(Collection<Long> employeeIds);
}
