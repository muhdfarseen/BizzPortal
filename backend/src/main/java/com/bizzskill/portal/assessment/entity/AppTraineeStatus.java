package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import com.bizzskill.portal.common.enums.StatusState;
import com.bizzskill.portal.common.enums.TraineeStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * One period during which a trainee held a status.
 *
 * <p>Modelled as a table of periods rather than a status column on the trainee, so
 * the history is preserved: a trainee's <em>current</em> status is the single row
 * that is {@link StatusState#CURRENT}, and superseding a status sets that row to
 * {@link StatusState#SUPERSEDED} while keeping it. "How many trainees went through
 * Remedial last quarter, and where did they end up" is therefore answerable, which
 * it would not be with a single mutable status field.
 *
 * <p>A trainee holding no status — the ordinary case — simply has no current row.
 * Nothing is stored to say so.
 *
 * <p>The database enforces at most one current row per trainee with a partial
 * unique index, so two concurrent requests cannot give the same person two
 * statuses at once.
 */
@Entity
@Table(name = "app_trainee_status")
public class AppTraineeStatus extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "inttrainee_status_id")
    private Long intTraineeStatusId;

    @Column(name = "intemployee_id", nullable = false)
    private Long intEmployeeId;

    /** The assessment whose result prompted the change, when there was one. */
    @Column(name = "intassessment_id")
    private Long intAssessmentId;

    @Column(name = "txttrainee_status", length = 20, nullable = false)
    private TraineeStatus txtTraineeStatus;

    @Column(name = "txtstate", length = 1, nullable = false)
    private StatusState txtState = StatusState.CURRENT;

    @Column(name = "txtremark", length = 500)
    private String txtRemark;

    /** The day this status began. */
    @Column(name = "datestart_date", nullable = false)
    private LocalDate dateStartDate;

    /** The day this status was superseded, which is the day the next one began. */
    @Column(name = "dateclose_date")
    private LocalDate dateCloseDate;

    protected AppTraineeStatus() {
        // Required by JPA.
    }

    /**
     * Opens a period in which the trainee holds {@code status}.
     *
     * <p>The result is the trainee's current status until something supersedes it,
     * including when the status is an outcome such as {@code cleared}: a trainee
     * who has cleared still <em>is</em> cleared, which is what lets the figures
     * account for everyone.
     */
    public static AppTraineeStatus begin(
            Long intEmployeeId,
            Long intAssessmentId,
            TraineeStatus status,
            String remark,
            LocalDate startDate) {
        AppTraineeStatus period = new AppTraineeStatus();
        period.intEmployeeId = intEmployeeId;
        period.intAssessmentId = intAssessmentId;
        period.txtTraineeStatus = status;
        period.txtRemark = remark;
        period.dateStartDate = startDate;
        period.txtState = StatusState.CURRENT;
        return period;
    }

    /**
     * Ends this period on {@code closeDate}, keeping the remark it was opened with.
     *
     * <p>The remark explains why the trainee <em>held</em> this status, so it is
     * not overwritten by the reason it ended — that reason belongs to the status
     * that follows.
     */
    public void supersede(LocalDate closeDate) {
        this.txtState = StatusState.SUPERSEDED;
        this.dateCloseDate = closeDate;
    }

    /** Whether this is the trainee's live status rather than history. */
    public boolean isCurrent() {
        return txtState == StatusState.CURRENT;
    }

    public Long getIntTraineeStatusId() {
        return intTraineeStatusId;
    }

    public Long getIntEmployeeId() {
        return intEmployeeId;
    }

    public Long getIntAssessmentId() {
        return intAssessmentId;
    }

    public TraineeStatus getTxtTraineeStatus() {
        return txtTraineeStatus;
    }

    public StatusState getTxtState() {
        return txtState;
    }

    public String getTxtRemark() {
        return txtRemark;
    }

    public LocalDate getDateStartDate() {
        return dateStartDate;
    }

    public LocalDate getDateCloseDate() {
        return dateCloseDate;
    }
}
