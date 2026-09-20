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

    /**
     * Whether the batch began in the given year and quarter; a {@code null} half of
     * the period means "any".
     *
     * <p>The rule lives here rather than in each service that reads a period, because
     * the dashboard's figures, the filter bar's batch list and the location report
     * all have to agree on which batches a quarter holds: a second copy of this would
     * eventually answer differently, and the screen would count a batch its dropdown
     * did not offer.
     *
     * <p>A batch with no start date on record began in no quarter at all, so it is in
     * no period — a filter can only include what the data can prove. The month is read
     * off the date directly rather than through a timezone.
     */
    public boolean startedIn(Integer year, Integer quarter) {
        if (dateBatchStartDate == null) {
            return false;
        }

        boolean yearMatches = year == null || dateBatchStartDate.getYear() == year;
        boolean quarterMatches =
                quarter == null || (dateBatchStartDate.getMonthValue() - 1) / 3 + 1 == quarter;
        return yearMatches && quarterMatches;
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
