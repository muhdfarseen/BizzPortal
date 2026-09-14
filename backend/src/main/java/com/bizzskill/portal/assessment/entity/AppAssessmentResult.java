package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * One trainee's outcome for one assessment.
 *
 * <p>Keyed by {@code intEmployeeId} rather than by participant row, so a result
 * survives the trainee moving between batches or learning groups.
 *
 * <p>The CEFR level is stored alongside the score rather than being derived on
 * read. That is deliberate: if an administrator edits the mapping, historical
 * results must keep reporting the level that was actually awarded at the time,
 * not a level recomputed from today's bands.
 */
@Entity
@Table(name = "app_assessment_result")
public class AppAssessmentResult extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intresult_id")
    private Long intResultId;

    @Column(name = "intemployee_id", nullable = false)
    private Long intEmployeeId;

    @Column(name = "intassessment_id", nullable = false)
    private Long intAssessmentId;

    /** Null until the trainee is actually scored. */
    @Column(name = "intscore")
    private Integer intScore;

    @Column(name = "txtcefr_level", length = 30)
    private String txtCefrLevel;

    @Column(name = "txtremarks", length = 500)
    private String txtRemarks;

    @Column(name = "dateassessed_on")
    private LocalDate dateAssessedOn;

    protected AppAssessmentResult() {
        // Required by JPA.
    }

    public static AppAssessmentResult create(Long intEmployeeId, Long intAssessmentId) {
        AppAssessmentResult result = new AppAssessmentResult();
        result.intEmployeeId = intEmployeeId;
        result.intAssessmentId = intAssessmentId;
        return result;
    }

    /**
     * Records a score and the level it awarded.
     *
     * <p>Passing a {@code null} score clears the result back to "not yet assessed",
     * which also clears the level: a level with no score would be a claim the data
     * cannot support.
     */
    public void recordScore(Integer score, String cefrLevel, String remarks, LocalDate assessedOn) {
        this.intScore = score;
        this.txtCefrLevel = score == null ? null : cefrLevel;
        this.txtRemarks = remarks;
        this.dateAssessedOn = score == null ? null : assessedOn;
    }

    public Long getIntResultId() {
        return intResultId;
    }

    public Long getIntEmployeeId() {
        return intEmployeeId;
    }

    public Long getIntAssessmentId() {
        return intAssessmentId;
    }

    public Integer getIntScore() {
        return intScore;
    }

    public String getTxtCefrLevel() {
        return txtCefrLevel;
    }

    public String getTxtRemarks() {
        return txtRemarks;
    }

    public LocalDate getDateAssessedOn() {
        return dateAssessedOn;
    }
}
