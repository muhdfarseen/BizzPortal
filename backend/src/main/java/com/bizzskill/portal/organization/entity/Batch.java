package com.bizzskill.portal.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.LocalDate;

/**
 * A batch of trainees at a location (the portal's {@code BATCH} table).
 *
 * <p><strong>Read-only</strong> — owned by the existing assessment portal.
 *
 * <p>Note the type mismatch that exists in the portal schema itself: this table
 * references its location through {@code TXTILP_LOCATION_ID VARCHAR2(3)} while
 * {@code LOCATION.TXTLOCATION_ID} is {@code VARCHAR2(4)}. It is reproduced as-is
 * rather than "fixed", because the table is not ours to change; the joins in
 * {@code OrganizationQueries} therefore cast rather than assume equal widths.
 */
@Entity
@Immutable
@Table(name = "batch")
public class Batch {

    @Id
    @Column(name = "intbatch_id", nullable = false)
    private Long intBatchId;

    @Column(name = "txtstatus", length = 1)
    private String txtStatus;

    @Column(name = "txtbatch_type", length = 45)
    private String txtBatchType;

    @Column(name = "txtremarks", length = 200)
    private String txtRemarks;

    @Column(name = "txtpremapped", length = 10)
    private String txtPremapped;

    @Column(name = "intprogramtype_id")
    private Long intProgramTypeId;

    @Column(name = "intbatching_number")
    private Long intBatchingNumber;

    @Column(name = "txtbatch_name", length = 45)
    private String txtBatchName;

    @Column(name = "datebatch_start_date")
    private LocalDate dateBatchStartDate;

    @Column(name = "datebatch_end_date")
    private LocalDate dateBatchEndDate;

    @Column(name = "txtilp_location_id", length = 3)
    private String txtIlpLocationId;

    @Column(name = "intduration")
    private Long intDuration;

    @Column(name = "intjoining_number")
    private Long intJoiningNumber;

    protected Batch() {
        // Required by JPA.
    }

    public Long getIntBatchId() {
        return intBatchId;
    }

    public String getTxtStatus() {
        return txtStatus;
    }

    public String getTxtBatchType() {
        return txtBatchType;
    }

    public String getTxtRemarks() {
        return txtRemarks;
    }

    public String getTxtPremapped() {
        return txtPremapped;
    }

    public Long getIntProgramTypeId() {
        return intProgramTypeId;
    }

    public Long getIntBatchingNumber() {
        return intBatchingNumber;
    }

    public String getTxtBatchName() {
        return txtBatchName;
    }

    public LocalDate getDateBatchStartDate() {
        return dateBatchStartDate;
    }

    public LocalDate getDateBatchEndDate() {
        return dateBatchEndDate;
    }

    public String getTxtIlpLocationId() {
        return txtIlpLocationId;
    }

    public Long getIntDuration() {
        return intDuration;
    }

    public Long getIntJoiningNumber() {
        return intJoiningNumber;
    }
}
