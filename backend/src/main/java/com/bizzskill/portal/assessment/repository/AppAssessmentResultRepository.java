package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Read/write access to assessment results. */
public interface AppAssessmentResultRepository extends JpaRepository<AppAssessmentResult, Long> {

    /**
     * Every result for a roster.
     *
     * <p>One query for the whole group rather than one per trainee: the
     * assessment table renders every participant's results for every assessment,
     * so a per-row lookup would produce hundreds of statements.
     */
    List<AppAssessmentResult> findByIntEmployeeIdIn(Collection<Long> employeeIds);

    Optional<AppAssessmentResult> findByIntEmployeeIdAndIntAssessmentId(
            Long intEmployeeId, Long intAssessmentId);

    List<AppAssessmentResult> findByIntAssessmentId(Long intAssessmentId);

    /**
     * Whether an assessment already has results recorded.
     *
     * <p>Used to refuse deleting an assessment that would orphan real marks.
     */
    @Query("select count(r) from AppAssessmentResult r where r.intAssessmentId = :intAssessmentId")
    long countByAssessment(@Param("intAssessmentId") Long intAssessmentId);

    /**
     * The highest score recorded against an assessment.
     *
     * <p>Used to refuse lowering an assessment's maximum below a score already
     * recorded, which would leave stored results that the assessment says are
     * impossible.
     */
    @Query("select max(r.intScore) from AppAssessmentResult r where r.intAssessmentId = :intAssessmentId")
    Integer findHighestScore(@Param("intAssessmentId") Long intAssessmentId);
}
