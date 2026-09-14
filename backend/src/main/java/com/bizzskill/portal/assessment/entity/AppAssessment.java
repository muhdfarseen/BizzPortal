package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import com.bizzskill.portal.common.enums.Status;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * An exam trainees are assessed against (Pre / Mid / Post to begin with).
 *
 * <p>Admin-configurable, so nothing in the codebase hard-codes a fixed set of
 * exams: results reference {@code intAssessmentId}, and the screens build their
 * columns from this table.
 */
@Entity
@Table(name = "app_assessment")
public class AppAssessment extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intassessment_id")
    private Long intAssessmentId;

    @Column(name = "txtassessment_name", length = 60, nullable = false, unique = true)
    private String txtAssessmentName;

    @Column(name = "txtdescription", length = 300)
    private String txtDescription;

    /** Highest achievable score; drives score validation and the CEFR lookup. */
    @Column(name = "intmax_score", nullable = false)
    private Integer intMaxScore;

    @Column(name = "intsort_order", nullable = false)
    private Integer intSortOrder;

    @Column(name = "txtstatus", length = 1, nullable = false)
    private Status txtStatus = Status.ACTIVE;

    protected AppAssessment() {
        // Required by JPA.
    }

    public static AppAssessment create(
            String name, String description, Integer maxScore, Integer sortOrder) {
        AppAssessment assessment = new AppAssessment();
        assessment.rename(name);
        assessment.describe(description);
        assessment.setIntMaxScore(maxScore);
        assessment.setIntSortOrder(sortOrder);
        assessment.txtStatus = Status.ACTIVE;
        return assessment;
    }

    public void rename(String name) {
        this.txtAssessmentName = name;
    }

    public void describe(String description) {
        this.txtDescription = description;
    }

    public void setIntMaxScore(Integer maxScore) {
        this.intMaxScore = maxScore;
    }

    public void setIntSortOrder(Integer sortOrder) {
        this.intSortOrder = sortOrder;
    }

    public void setTxtStatus(Status status) {
        this.txtStatus = status;
    }

    public Long getIntAssessmentId() {
        return intAssessmentId;
    }

    public String getTxtAssessmentName() {
        return txtAssessmentName;
    }

    public String getTxtDescription() {
        return txtDescription;
    }

    public Integer getIntMaxScore() {
        return intMaxScore;
    }

    public Integer getIntSortOrder() {
        return intSortOrder;
    }

    public Status getTxtStatus() {
        return txtStatus;
    }
}
