package com.bizzskill.portal.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.LocalDate;

/**
 * A trainee on a batch (the portal's {@code PARTICIPANT} table).
 *
 * <p><strong>Read-only</strong> — owned by the existing assessment portal. This
 * application stores scores against {@code intEmployeeId} rather than against
 * the participant row, so a result survives the trainee being moved between
 * batches.
 */
@Entity
@Immutable
@Table(name = "participant")
public class Participant {

    @Id
    @Column(name = "intparticipant_id", nullable = false)
    private Long intParticipantId;

    @Column(name = "txtreference_id", length = 45)
    private String txtReferenceId;

    @Column(name = "txtrecruit_branch", length = 45)
    private String txtRecruitBranch;

    @Column(name = "dateilp_date")
    private LocalDate dateIlpDate;

    @Column(name = "txtphase_id", length = 5)
    private String txtPhaseId;

    @Column(name = "intstatus_id")
    private Long intStatusId;

    @Column(name = "intbatch_id")
    private Long intBatchId;

    @Column(name = "intlg_id")
    private Long intLgId;

    @Column(name = "txtparticipant_name", length = 200)
    private String txtParticipantName;

    /** The trainee's employee number; the identity results are keyed by. */
    @Column(name = "intemployee_id")
    private Long intEmployeeId;

    @Column(name = "intstream_id")
    private Long intStreamId;

    protected Participant() {
        // Required by JPA.
    }

    public Long getIntParticipantId() {
        return intParticipantId;
    }

    public String getTxtReferenceId() {
        return txtReferenceId;
    }

    public String getTxtRecruitBranch() {
        return txtRecruitBranch;
    }

    public LocalDate getDateIlpDate() {
        return dateIlpDate;
    }

    public String getTxtPhaseId() {
        return txtPhaseId;
    }

    public Long getIntStatusId() {
        return intStatusId;
    }

    public Long getIntBatchId() {
        return intBatchId;
    }

    public Long getIntLgId() {
        return intLgId;
    }

    public String getTxtParticipantName() {
        return txtParticipantName;
    }

    public Long getIntEmployeeId() {
        return intEmployeeId;
    }

    public Long getIntStreamId() {
        return intStreamId;
    }
}
