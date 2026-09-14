package com.bizzskill.portal.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A single thing a role is allowed to do.
 *
 * <p>The {@code txtpermission_code} values ({@code assessments.view}, …) are the
 * contract with the frontend and are what the security layer checks, so they are
 * treated as stable identifiers: a code is added, never renamed.
 */
@Entity
@Table(name = "app_permission")
public class AppPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intpermission_id")
    private Long intPermissionId;

    @Column(name = "txtpermission_code", length = 60, nullable = false, unique = true)
    private String txtPermissionCode;

    @Column(name = "txtlabel", length = 100, nullable = false)
    private String txtLabel;

    @Column(name = "txtdescription", length = 300)
    private String txtDescription;

    @Column(name = "intsort_order", nullable = false)
    private Integer intSortOrder;

    protected AppPermission() {
        // Required by JPA.
    }

    public Long getIntPermissionId() {
        return intPermissionId;
    }

    public String getTxtPermissionCode() {
        return txtPermissionCode;
    }

    public String getTxtLabel() {
        return txtLabel;
    }

    public String getTxtDescription() {
        return txtDescription;
    }

    public Integer getIntSortOrder() {
        return intSortOrder;
    }
}
