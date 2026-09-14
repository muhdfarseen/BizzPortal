package com.bizzskill.portal.user.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import com.bizzskill.portal.common.enums.RoleScope;
import com.bizzskill.portal.common.enums.Status;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A role: what it is called, how far it reaches and what it may do.
 *
 * <p>Roles are data, not an enum, so an administrator can add a role without a
 * deployment. The permission set is what the token is built from — the frontend
 * never decides access on the role name.
 */
@Entity
@Table(name = "app_role")
public class AppRole extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "introle_id")
    private Long intRoleId;

    @Column(name = "txtrole_code", length = 45, nullable = false, unique = true)
    private String txtRoleCode;

    @Column(name = "txtrole_name", length = 100, nullable = false)
    private String txtRoleName;

    @Column(name = "txtdescription", length = 300)
    private String txtDescription;

    @Column(name = "txtscope", length = 30, nullable = false)
    private RoleScope txtScope;

    @Column(name = "intsort_order", nullable = false)
    private Integer intSortOrder;

    @Column(name = "txtstatus", length = 1, nullable = false)
    private Status txtStatus = Status.ACTIVE;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "app_role_permission",
            joinColumns = @JoinColumn(name = "introle_id"),
            inverseJoinColumns = @JoinColumn(name = "intpermission_id"))
    private Set<AppPermission> permissions = new LinkedHashSet<>();

    protected AppRole() {
        // Required by JPA.
    }

    public Long getIntRoleId() {
        return intRoleId;
    }

    public String getTxtRoleCode() {
        return txtRoleCode;
    }

    public String getTxtRoleName() {
        return txtRoleName;
    }

    public String getTxtDescription() {
        return txtDescription;
    }

    public RoleScope getTxtScope() {
        return txtScope;
    }

    public Integer getIntSortOrder() {
        return intSortOrder;
    }

    public Status getTxtStatus() {
        return txtStatus;
    }

    public Set<AppPermission> getPermissions() {
        return permissions;
    }
}
