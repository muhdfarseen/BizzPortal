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
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
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

    /** Locations this user may see, and every batch and group inside them. */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "app_user_location", joinColumns = @JoinColumn(name = "intuser_id"))
    @Column(name = "txtlocation_id", length = 4)
    private Set<String> locationIds = new LinkedHashSet<>();

    /**
     * Permissions granted to this person on top of their role's.
     *
     * <p>Needed because a role cannot carry the difference between two faculty
     * members, one of whom owns the Remedial track and one of whom owns both.
     * Deliberately additive: a grant can only add, so this can never quietly take
     * access away, and the role remains the floor every account starts from.
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "app_user_permission",
            joinColumns = @JoinColumn(name = "intuser_id"),
            inverseJoinColumns = @JoinColumn(name = "intpermission_id"))
    private Set<AppPermission> extraPermissions = new LinkedHashSet<>();

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

    /** Replaces the whole assignment set; the collection is owned by this user. */
    public void replaceAssignments(Set<String> locations) {
        this.locationIds.clear();
        this.locationIds.addAll(locations);
    }

    /**
     * Replaces the per-user permission grants.
     *
     * <p>Whole-set, like the assignments, so an unticked box really does revoke
     * that grant rather than leaving a stale one behind.
     */
    public void replaceExtraPermissions(Set<AppPermission> permissions) {
        this.extraPermissions.clear();
        this.extraPermissions.addAll(permissions);
    }

    /**
     * Every permission this account holds: its role's, plus anything granted to
     * the person directly.
     *
     * <p>The union is what the token and the API report, and the single place
     * that combines them — a per-user grant that was not merged here would grant
     * nothing, and merging it in two places is how the two drift apart.
     */
    public Set<String> effectivePermissionCodes() {
        Set<String> codes = new LinkedHashSet<>();
        role.getPermissions().stream()
                .map(AppPermission::getTxtPermissionCode)
                .forEach(codes::add);
        extraPermissions.stream().map(AppPermission::getTxtPermissionCode).forEach(codes::add);
        return codes;
    }

    /** The permissions granted to this person over and above their role's. */
    public Set<AppPermission> getExtraPermissions() {
        return extraPermissions;
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
}
