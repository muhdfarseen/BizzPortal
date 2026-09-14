package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * A trainee's placement on a LAP or Remedial track.
 *
 * <p>Modelled as a table of events rather than a status column on the trainee, so
 * the history is preserved: a trainee's <em>current</em> track is the single row
 * that is {@link LapStatus#OPEN}, and closing a track sets it to
 * {@link LapStatus#CLOSED} while keeping the row. "How many trainees went through
 * Remedial last quarter, and did they finish" is therefore answerable, which it
 * would not be with a single mutable status field.
 *
 * <p>The database enforces at most one open track per trainee with a partial
 * unique index, so two concurrent requests cannot place the same person twice.
 */
@Entity
@Table(name = "app_lap_remedial")
public class AppLapRemedial extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intlap_remedial_id")
    private Long intLapRemedialId;

    @Column(name = "intemployee_id", nullable = false)
    private Long intEmployeeId;

    /** The assessment whose result prompted the placement, when there was one. */
    @Column(name = "intassessment_id")
    private Long intAssessmentId;

    @Column(name = "txttrack", length = 20, nullable = false)
    private LapTrack txtTrack;

    @Column(name = "txtstatus", length = 1, nullable = false)
    private LapStatus txtStatus = LapStatus.OPEN;

    @Column(name = "txtremark", length = 500)
    private String txtRemark;

    @Column(name = "datestart_date", nullable = false)
    private LocalDate dateStartDate;

    @Column(name = "dateclose_date")
    private LocalDate dateCloseDate;

    protected AppLapRemedial() {
        // Required by JPA.
    }

    public static AppLapRemedial place(
            Long intEmployeeId,
            Long intAssessmentId,
            LapTrack track,
            String remark,
            LocalDate startDate) {
        AppLapRemedial placement = new AppLapRemedial();
        placement.intEmployeeId = intEmployeeId;
        placement.intAssessmentId = intAssessmentId;
        placement.txtTrack = track;
        placement.txtRemark = remark;
        placement.dateStartDate = startDate;
        placement.txtStatus = LapStatus.OPEN;
        return placement;
    }

    /** Moves an open placement to another track, keeping the same start date. */
    public void moveTo(LapTrack track, String remark) {
        this.txtTrack = track;
        this.txtRemark = remark;
    }

    /** Closes the placement, recording the remark that explains why. */
    public void close(String remark, LocalDate closeDate) {
        this.txtStatus = LapStatus.CLOSED;
        this.txtRemark = remark;
        this.dateCloseDate = closeDate;
    }

    public Long getIntLapRemedialId() {
        return intLapRemedialId;
    }

    public Long getIntEmployeeId() {
        return intEmployeeId;
    }

    public Long getIntAssessmentId() {
        return intAssessmentId;
    }

    public LapTrack getTxtTrack() {
        return txtTrack;
    }

    public LapStatus getTxtStatus() {
        return txtStatus;
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
