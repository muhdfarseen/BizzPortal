package com.bizzskill.portal.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * The audit columns every application table carries.
 *
 * <p>Populated centrally by Spring Data JPA auditing rather than by hand in each
 * service, so "who created this and when" cannot be forgotten on a new write
 * path. The database also defaults {@code datecreated_on} to {@code now()} as a
 * safety net for rows inserted outside the application.
 *
 * <p>The portal-owned tables (location, batch, learning_group, participant) do
 * <em>not</em> carry these columns and therefore do not extend this class.
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {

    @CreatedDate
    @Column(name = "datecreated_on", nullable = false, updatable = false)
    private Instant dateCreatedOn;

    @CreatedBy
    @Column(name = "txtcreated_by", length = 60, updatable = false)
    private String txtCreatedBy;

    @LastModifiedDate
    @Column(name = "dateupdated_on")
    private Instant dateUpdatedOn;

    @LastModifiedBy
    @Column(name = "txtupdated_by", length = 60)
    private String txtUpdatedBy;

    public Instant getDateCreatedOn() {
        return dateCreatedOn;
    }

    public void setDateCreatedOn(Instant dateCreatedOn) {
        this.dateCreatedOn = dateCreatedOn;
    }

    public String getTxtCreatedBy() {
        return txtCreatedBy;
    }

    public void setTxtCreatedBy(String txtCreatedBy) {
        this.txtCreatedBy = txtCreatedBy;
    }

    public Instant getDateUpdatedOn() {
        return dateUpdatedOn;
    }

    public void setDateUpdatedOn(Instant dateUpdatedOn) {
        this.dateUpdatedOn = dateUpdatedOn;
    }

    public String getTxtUpdatedBy() {
        return txtUpdatedBy;
    }

    public void setTxtUpdatedBy(String txtUpdatedBy) {
        this.txtUpdatedBy = txtUpdatedBy;
    }
}
