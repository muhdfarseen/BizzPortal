package com.bizzskill.portal.user.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import com.bizzskill.portal.common.enums.Status;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A portal account.
 *
 * <p>Identified externally by {@code intEmployeeId} — the same number as
 * {@code participant.intemployee_id} — so a portal user and a trainee are the
 * same person when they are the same number. {@code txtUsername} exists only as
 * a convenience for signing in.
 *
 * <p>The organisation assignments are stored as element collections rather than
 * as entities: they are nothing but sets of ids owned entirely by the user, with
 * no attributes of their own.
 */
@Entity
@Table(name = "app_user")
public class AppUser extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intuser_id")
    private Long intUserId;

    @Column(name = "intemployee_id", nullable = false, unique = true)
    private Long intEmployeeId;

    @Column(name = "txtusername", length = 60, nullable = false, unique = true)
    private String txtUsername;

    @Column(name = "txtname", length = 200, nullable = false)
    private String txtName;

    @Column(name = "txtemail", length = 200)
    private String txtEmail;

    /**
     * The account's credential.
     *
     * <p>Stored in plain text at the client's explicit request, to be replaced by
     * a BCrypt hash once authentication is hardened. It is never returned by any
     * endpoint: the DTO layer simply has no field for it.
     */
    @Column(name = "txtpassword", length = 200, nullable = false)
    private String txtPassword;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "introle_id", nullable = false)
    private AppRole role;

    @Column(name = "txtstatus", length = 1, nullable = false)
    private Status txtStatus = Status.ACTIVE;

    @Column(name = "datelast_login")
    private Instant dateLastLogin;

    /** Locations this user may see, when the role's scope is not {@code all}. */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "app_user_location", joinColumns = @JoinColumn(name = "intuser_id"))
    @Column(name = "txtlocation_id", length = 4)
    private Set<String> locationIds = new LinkedHashSet<>();

    /** Batches this user may see, when the role's scope is {@code assigned-batches}. */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "app_user_batch", joinColumns = @JoinColumn(name = "intuser_id"))
    @Column(name = "intbatch_id")
    private Set<Long> batchIds = new LinkedHashSet<>();

    protected AppUser() {
        // Required by JPA.
    }

    /**
     * Creates an account.
     *
     * <p>The username is derived from the employee number rather than supplied.
     * Sign-in accepts the employee number, so a separate username would be one more
     * thing for an administrator to invent and for a user to remember, and deriving
     * it guarantees it is unique — the employee number already is.
     */
    public static AppUser create(
            Long intEmployeeId,
            String username,
            String name,
            String email,
            String password,
            AppRole role) {
        AppUser user = new AppUser();
        user.intEmployeeId = intEmployeeId;
        user.txtUsername = username;
        user.txtName = name;
        user.txtEmail = email;
        user.txtPassword = password;
        user.role = role;
        user.txtStatus = Status.ACTIVE;
        return user;
    }

    public void rename(String name) {
        this.txtName = name;
    }

    public void setTxtEmail(String email) {
        this.txtEmail = email;
    }

    public void assignRole(AppRole role) {
        this.role = role;
    }

    /** Replaces the whole assignment set; the collections are owned by this user. */
    public void replaceAssignments(Set<String> locations, Set<Long> batches) {
        this.locationIds.clear();
        this.locationIds.addAll(locations);
        this.batchIds.clear();
        this.batchIds.addAll(batches);
    }

    public Long getIntUserId() {
        return intUserId;
    }

    public Long getIntEmployeeId() {
        return intEmployeeId;
    }

    public String getTxtUsername() {
        return txtUsername;
    }

    public String getTxtName() {
        return txtName;
    }

    public String getTxtEmail() {
        return txtEmail;
    }

    public String getTxtPassword() {
        return txtPassword;
    }

    public void setTxtPassword(String txtPassword) {
        this.txtPassword = txtPassword;
    }

    public AppRole getRole() {
        return role;
    }

    public void setRole(AppRole role) {
        this.role = role;
    }

    public Status getTxtStatus() {
        return txtStatus;
    }

    public void setTxtStatus(Status txtStatus) {
        this.txtStatus = txtStatus;
    }

    public Instant getDateLastLogin() {
        return dateLastLogin;
    }

    public void setDateLastLogin(Instant dateLastLogin) {
        this.dateLastLogin = dateLastLogin;
    }

    public Set<String> getLocationIds() {
        return locationIds;
    }

    public Set<Long> getBatchIds() {
        return batchIds;
    }
}
