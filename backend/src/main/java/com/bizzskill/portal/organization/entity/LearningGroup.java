package com.bizzskill.portal.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.LocalDate;

/**
 * A learning group: the smallest unit trainees are grouped into, and the level
 * the assessment screens filter by (the portal's {@code LEARNING_GROUP} table).
 *
 * <p><strong>Read-only</strong> — owned by the existing assessment portal.
 */
@Entity
@Immutable
@Table(name = "learning_group")
public class LearningGroup {

    @Id
    @Column(name = "intlg_id", nullable = false)
    private Long intLgId;

    @Column(name = "txtlg_name", length = 45)
    private String txtLgName;

    @Column(name = "txtstatus", length = 1)
    private String txtStatus;

    @Column(name = "txtlg_type", length = 45)
    private String txtLgType;

    @Column(name = "dateend_date")
    private LocalDate dateEndDate;

    @Column(name = "datestart_date")
    private LocalDate dateStartDate;

    @Column(name = "intstream_id")
    private Long intStreamId;

    @Column(name = "intbatch_id")
    private Long intBatchId;

    @Column(name = "txtlocation_id", length = 10)
    private String txtLocationId;

    protected LearningGroup() {
        // Required by JPA.
    }

    public Long getIntLgId() {
        return intLgId;
    }

    public String getTxtLgName() {
        return txtLgName;
    }

    public String getTxtStatus() {
        return txtStatus;
    }

    public String getTxtLgType() {
        return txtLgType;
    }

    public LocalDate getDateEndDate() {
        return dateEndDate;
    }

    public LocalDate getDateStartDate() {
        return dateStartDate;
    }

    public Long getIntStreamId() {
        return intStreamId;
    }

    public Long getIntBatchId() {
        return intBatchId;
    }

    public String getTxtLocationId() {
        return txtLocationId;
    }
}
