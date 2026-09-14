package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppAssessmentResultAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Append-only access to the score audit trail.
 *
 * <p>No update or delete method is exposed anywhere in the application; the trail
 * is written and read, never rewritten.
 */
public interface AppAssessmentResultAuditRepository extends JpaRepository<AppAssessmentResultAudit, Long> {

    List<AppAssessmentResultAudit> findByIntEmployeeIdOrderByDateChangedOnDesc(Long intEmployeeId);
}
