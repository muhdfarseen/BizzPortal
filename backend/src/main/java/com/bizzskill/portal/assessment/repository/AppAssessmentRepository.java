package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppAssessment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** Read/write access to the assessment configuration. */
public interface AppAssessmentRepository extends JpaRepository<AppAssessment, Long> {

    List<AppAssessment> findAllByOrderByIntSortOrderAsc();

    Optional<AppAssessment> findByTxtAssessmentNameIgnoreCase(String name);

    long countByIntAssessmentIdNot(Long intAssessmentId);
}
