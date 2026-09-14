package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.enums.AuditAction;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * An immutable record of a score change.
 *
 * <p>Assessment results are the portal's system of record, so "who changed this
 * mark, and what was it before" has to be answerable. Rows are only ever
 * inserted, never updated or deleted.
 *
 * <p>This entity deliberately does not extend {@code AuditableEntity}: the audit
 * row's own timestamps <em>are</em> its content, and it has no separate
 * created/updated pair. {@code intResultId} is not a foreign key either, so the
 * trail outlives a result that is later removed.
 */
@Entity
@Table(name = "app_assessment_result_audit")
public class AppAssessmentResultAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intaudit_id")
    private Long intAuditId;

    @Column(name = "intresult_id")
    private Long intResultId;

    @Column(name = "intemployee_id", nullable = false)
    private Long intEmployeeId;

    @Column(name = "intassessment_id", nullable = false)
    private Long intAssessmentId;

    @Column(name = "intold_score")
    private Integer intOldScore;

    @Column(name = "intnew_score")
    private Integer intNewScore;

    @Column(name = "txtold_cefr", length = 30)
    private String txtOldCefr;

    @Column(name = "txtnew_cefr", length = 30)
    private String txtNewCefr;

    @Column(name = "txtaction", length = 20, nullable = false)
    private AuditAction txtAction;

    @Column(name = "txtchanged_by", length = 60, nullable = false)
    private String txtChangedBy;

    @Column(name = "datechanged_on", nullable = false)
    private Instant dateChangedOn;

    protected AppAssessmentResultAudit() {
        // Required by JPA.
    }

    /**
     * Captures the first score recorded for an exam.
     */
    public static AppAssessmentResultAudit ofInsert(AppAssessmentResult after, String changedBy) {
        AppAssessmentResultAudit audit = new AppAssessmentResultAudit();
        audit.intResultId = after.getIntResultId();
        audit.intEmployeeId = after.getIntEmployeeId();
        audit.intAssessmentId = after.getIntAssessmentId();
        audit.intOldScore = null;
        audit.txtOldCefr = null;
        audit.intNewScore = after.getIntScore();
        audit.txtNewCefr = after.getTxtCefrLevel();
        audit.txtAction = AuditAction.INSERT;
        audit.txtChangedBy = changedBy;
        audit.dateChangedOn = Instant.now();
        return audit;
    }

    /**
     * Captures a score being changed.
     *
     * <p>The replaced score and level are taken as values, not as a second
     * entity. The result is mutated in place, so a factory that accepted the same
     * instance for both sides read the old value twice and produced a row saying
     * a score had changed from X to X — able to show that something happened but
     * never what it became. This signature makes that mistake unrepresentable.
     *
     * @param after         the result, already holding the new score
     * @param previousScore the score being replaced
     * @param previousCefr  the level that went with the replaced score
     */
    public static AppAssessmentResultAudit ofUpdate(
            AppAssessmentResult after,
            Integer previousScore,
            String previousCefr,
            String changedBy) {
        AppAssessmentResultAudit audit = new AppAssessmentResultAudit();
        audit.intResultId = after.getIntResultId();
        audit.intEmployeeId = after.getIntEmployeeId();
        audit.intAssessmentId = after.getIntAssessmentId();
        audit.intOldScore = previousScore;
        audit.txtOldCefr = previousCefr;
        audit.intNewScore = after.getIntScore();
        audit.txtNewCefr = after.getTxtCefrLevel();
        audit.txtAction = AuditAction.UPDATE;
        audit.txtChangedBy = changedBy;
        audit.dateChangedOn = Instant.now();
        return audit;
    }

    /**
     * Captures a score being removed, keeping the value that was lost.
     */
    public static AppAssessmentResultAudit ofDelete(AppAssessmentResult previous, String changedBy) {
        AppAssessmentResultAudit audit = new AppAssessmentResultAudit();
        audit.intResultId = null;
        audit.intEmployeeId = previous.getIntEmployeeId();
        audit.intAssessmentId = previous.getIntAssessmentId();
        audit.intOldScore = previous.getIntScore();
        audit.txtOldCefr = previous.getTxtCefrLevel();
        audit.intNewScore = null;
        audit.txtNewCefr = null;
        audit.txtAction = AuditAction.DELETE;
        audit.txtChangedBy = changedBy;
        audit.dateChangedOn = Instant.now();
        return audit;
    }

    public Long getIntAuditId() {
        return intAuditId;
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

    public Integer getIntOldScore() {
        return intOldScore;
    }

    public Integer getIntNewScore() {
        return intNewScore;
    }

    public String getTxtOldCefr() {
        return txtOldCefr;
    }

    public String getTxtNewCefr() {
        return txtNewCefr;
    }

    public AuditAction getTxtAction() {
        return txtAction;
    }

    public String getTxtChangedBy() {
        return txtChangedBy;
    }

    public Instant getDateChangedOn() {
        return dateChangedOn;
    }
}
