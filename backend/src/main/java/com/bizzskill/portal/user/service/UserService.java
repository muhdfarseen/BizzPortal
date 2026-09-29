package com.bizzskill.portal.user.service;

import com.bizzskill.portal.common.enums.RoleScope;
import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.BusinessRuleException;
import com.bizzskill.portal.common.error.ConflictException;
import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.common.web.PageResponse;
import com.bizzskill.portal.common.web.SortQuery;
import com.bizzskill.portal.common.error.NotFoundException;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.organization.repository.BizLocationRepository;
import com.bizzskill.portal.user.dto.CreatedUserResponse;
import com.bizzskill.portal.user.dto.PermissionResponse;
import com.bizzskill.portal.user.dto.PortalUserResponse;
import com.bizzskill.portal.user.dto.RoleResponse;
import com.bizzskill.portal.user.dto.UserCreateRequest;
import com.bizzskill.portal.user.dto.UserUpdateRequest;
import com.bizzskill.portal.user.entity.AppPermission;
import com.bizzskill.portal.user.entity.AppRole;
import com.bizzskill.portal.user.entity.AppUser;
import com.bizzskill.portal.user.repository.AppPermissionRepository;
import com.bizzskill.portal.user.repository.AppRoleRepository;
import com.bizzskill.portal.user.repository.AppUserRepository;
import com.bizzskill.portal.user.repository.AppUserSpecifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.Locale;
import java.util.Set;

/**
 * Portal account management.
 *
 * <p>Two rules are enforced here rather than left to the UI, because both are ways
 * to lock the organisation out of its own portal:
 *
 * <ol>
 *   <li>Assignments must match the role's scope — a Location Admin with no location
 *       sees nothing, and a role that reaches everywhere has nothing to assign.
 *   <li>You cannot delete or deactivate yourself, and the last active Super Admin
 *       cannot be removed. Either would leave nobody able to manage users.
 * </ol>
 */
@Service
@Transactional(readOnly = true)
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    /** The role whose loss would make the portal unmanageable. */
    private static final String SUPER_ADMIN_ROLE = "superadmin";

    /** Username prefix, so a derived username is recognisably an employee number. */
    private static final String USERNAME_PREFIX = "emp";

    /**
     * Temporary-password alphabet with the ambiguous characters removed — no
     * {@code I}, {@code l}, {@code 0} or {@code O} — because these passwords get
     * read aloud and typed from a screenshot.
     */
    private static final String PASSWORD_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";

    private static final int TEMPORARY_PASSWORD_LENGTH = 14;

    /**
     * The order pages are cut from.
     *
     * <p>Name first, matching the screen. The employee number breaks ties: two
     * accounts can share a display name, and a page boundary between equal keys may
     * otherwise return one twice and the other never.
     */
    private static final Sort USER_TIE_BREAKERS =
            Sort.by(Sort.Order.asc("txtName"), Sort.Order.asc("intEmployeeId"));

    /** Sort keys the account list accepts, mapped to entity properties. */
    private static final Map<String, String> USER_SORTABLE = Map.of(
            "name", "txtName", "employeeId", "intEmployeeId", "email", "txtEmail");

    private final AppUserRepository users;
    private final AppRoleRepository roles;
    private final AppPermissionRepository permissions;
    private final BizLocationRepository locations;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    public UserService(
            AppUserRepository users,
            AppRoleRepository roles,
            AppPermissionRepository permissions,
            BizLocationRepository locations,
            PasswordEncoder passwordEncoder) {
        this.users = users;
        this.roles = roles;
        this.permissions = permissions;
        this.locations = locations;
        this.passwordEncoder = passwordEncoder;
    }

    /** Every account, for the User Management screen. */
    public PageResponse<PortalUserResponse> list(
            PageQuery paging, String roleCode, String status, String sort, String direction) {

        Sort order = SortQuery.resolve(sort, direction, USER_SORTABLE, USER_TIE_BREAKERS);

        Page<AppUser> page = users.findAll(
                AppUserSpecifications.matching(paging.search(), roleCode, status),
                paging.toPageRequest(order));

        List<Long> pageIds = page.getContent().stream().map(AppUser::getIntUserId).toList();
        if (pageIds.isEmpty()) {
            return PageResponse.of(List.of(), page.getNumber(), page.getSize(), page.getTotalElements());
        }

        // Second pass, for this page only. The first pass reads nothing but ids, so
        // the role and the location / batch collections are never touched there —
        // see the note on the repository method for why they cannot be joined into
        // the paged query itself.
        Map<Long, AppUser> loaded = users.findByIntUserIdIn(pageIds).stream()
                .collect(Collectors.toMap(AppUser::getIntUserId, Function.identity()));

        // Rebuilt in the page's order: `findByIntUserIdIn` makes no ordering promise,
        // and the rows have to line up with the total the client was given.
        List<PortalUserResponse> rows = pageIds.stream()
                .map(loaded::get)
                .filter(Objects::nonNull)
                .map(PortalUserResponse::from)
                .toList();

        return PageResponse.of(rows, page.getNumber(), page.getSize(), page.getTotalElements());
    }

    /** The role catalogue, with each role's permissions. */
    public List<RoleResponse> roles() {
        return roles.findAllWithPermissions().stream().map(RoleResponse::from).toList();
    }

    /** The permission catalogue, for the screens that list what a role grants. */
    public List<PermissionResponse> permissions() {
        return permissions.findAllByOrderByIntSortOrderAsc().stream()
                .map(PermissionResponse::from)
                .toList();
    }

    /**
     * Creates an account.
     *
     * <p>When no password is supplied one is generated and returned once, rather
     * than falling back to a predictable default such as the employee number.
     */
    @Transactional
    public CreatedUserResponse create(UserCreateRequest request) {
        Long employeeId = Long.valueOf(request.employeeId());
        if (users.existsByIntEmployeeId(employeeId)) {
            throw new ConflictException(
                    "An account for Employee ID " + employeeId + " already exists.");
        }

        AppRole role = requireRole(request.role());
        Assignments assignments = validateAssignments(role, request.locationIds());

        String generated = null;
        String password = request.password();
        if (password == null || password.isBlank()) {
            generated = generateTemporaryPassword();
            password = generated;
        }

        AppUser user = AppUser.create(
                employeeId,
                USERNAME_PREFIX + employeeId,
                request.name().trim(),
                trimToNull(request.email()),
                passwordEncoder.encode(password),
                role);
        user.replaceAssignments(assignments.locations());
        user.setTxtStatus(toStatus(request.status()));
        user.replaceExtraPermissions(resolveTrackPermissions(request.trackPermissions()));

        AppUser saved = users.save(user);
        log.info("Created account {} ({})", saved.getTxtUsername(), role.getTxtRoleCode());

        return new CreatedUserResponse(PortalUserResponse.from(saved), generated);
    }

    /** Updates an account's details, role and assignments. */
    @Transactional
    public PortalUserResponse update(Long employeeId, UserUpdateRequest request, Long actorEmployeeId) {
        AppUser user = requireUser(employeeId);
        AppRole role = requireRole(request.role());
        Assignments assignments = validateAssignments(role, request.locationIds());

        Status status = toStatus(request.status());
        boolean losingSuperAdmin =
                isSuperAdmin(user) && (!isSuperAdmin(role) || status != Status.ACTIVE);

        if (losingSuperAdmin && employeeId.equals(actorEmployeeId)) {
            throw new BusinessRuleException(
                    "You cannot remove your own Super Admin access. Ask another Super Admin to do it.");
        }
        if (losingSuperAdmin) {
            guardLastSuperAdmin("remove Super Admin access from");
        }

        user.rename(request.name().trim());
        user.setTxtEmail(trimToNull(request.email()));
        user.assignRole(role);
        user.replaceAssignments(assignments.locations());
        user.setTxtStatus(status);
        // Only replaced when the field was sent, so a caller that never mentions
        // track permissions does not silently revoke them.
        if (request.trackPermissions() != null) {
            user.replaceExtraPermissions(resolveTrackPermissions(request.trackPermissions()));
        }

        return PortalUserResponse.from(user);
    }

    /**
     * Resolves the requested track permissions to their rows.
     *
     * <p>Only the two track codes are looked up, and an unrecognised code is
     * refused rather than dropped. The bean validation on the request already
     * rejects a bad code, but the lookup is the boundary that matters: were it to
     * skip what it did not recognise, a request naming {@code users.manage}
     * would be stored as "no extra permissions" and the caller would believe it
     * had been granted.
     */
    private Set<AppPermission> resolveTrackPermissions(List<String> requested) {
        if (requested == null || requested.isEmpty()) {
            return Set.of();
        }

        Set<AppPermission> resolved = new LinkedHashSet<>();
        for (String code : requested) {
            AppPermission permission = permissions
                    .findAllByOrderByIntSortOrderAsc().stream()
                    .filter(candidate -> candidate.getTxtPermissionCode().equals(code))
                    .findFirst()
                    .orElseThrow(() -> new RequestValidationException(List.of(
                            new FieldViolation("trackPermissions", "There is no permission called '" + code + "'."))));
            resolved.add(permission);
        }
        return resolved;
    }

    /**
     * Deletes an account.
     *
     * <p>Deactivating is the reversible alternative and is usually what is wanted:
     * an account set to inactive is refused at sign-in but keeps its identity.
     */
    @Transactional
    public void delete(Long employeeId, Long actorEmployeeId) {
        AppUser user = requireUser(employeeId);

        if (employeeId.equals(actorEmployeeId)) {
            throw new BusinessRuleException("You cannot delete your own account.");
        }
        if (isSuperAdmin(user)) {
            guardLastSuperAdmin("delete");
        }

        users.delete(user);
        log.info("Deleted account {}", user.getTxtUsername());
    }

    // ── Validation ──────────────────────────────────────────────────────────

    /**
     * Checks that the assignments make sense for the role.
     *
     * <p>Locations are the only assignment: a location-scoped role reaches every
     * batch and learning group inside the locations it is given, so there is
     * nothing batch-level left to validate.
     */
    private Assignments validateAssignments(AppRole role, List<String> locationIds) {

        RoleScope scope = role.getTxtScope();
        Set<String> requestedLocations = locationIds == null
                ? new LinkedHashSet<>()
                : new LinkedHashSet<>(locationIds);

        List<FieldViolation> violations = new ArrayList<>();

        if (!scope.requiresLocations() && !requestedLocations.isEmpty()) {
            violations.add(new FieldViolation(
                    "locationIds",
                    "The " + role.getTxtRoleName() + " role reaches every location, so it takes no assignments."));
        }
        if (scope.requiresLocations() && requestedLocations.isEmpty()) {
            violations.add(new FieldViolation(
                    "locationIds",
                    "Assign at least one location to a " + role.getTxtRoleName() + "."));
        }

        validateLocationIdsExist(requestedLocations, violations);

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        return new Assignments(requestedLocations);
    }

    private void validateLocationIdsExist(Set<String> requested, List<FieldViolation> violations) {
        for (String locationId : requested) {
            if (!locations.existsById(locationId)) {
                violations.add(new FieldViolation(
                        "locationIds", "There is no location with the code '" + locationId + "'."));
            }
        }
    }

    /**
     * Refuses an action that would leave the portal with no active Super Admin.
     *
     * @param action a verb phrase, e.g. {@code "delete"}.
     */
    private void guardLastSuperAdmin(String action) {
        long remaining = users.countByRole_TxtRoleCodeAndTxtStatus(SUPER_ADMIN_ROLE, Status.ACTIVE);
        if (remaining <= 1) {
            throw new BusinessRuleException(
                    "This is the only active Super Admin, so you cannot " + action
                            + " it. Create another Super Admin first.");
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private AppUser requireUser(Long employeeId) {
        return users.findByIntEmployeeId(employeeId)
                .orElseThrow(() -> NotFoundException.of("user", employeeId));
    }

    private AppRole requireRole(String roleCode) {
        return roles.findByCodeWithPermissions(roleCode)
                .orElseThrow(() -> new RequestValidationException(List.of(
                        new FieldViolation("role", "There is no role called '" + roleCode + "'."))));
    }

    private boolean isSuperAdmin(AppUser user) {
        return SUPER_ADMIN_ROLE.equalsIgnoreCase(user.getRole().getTxtRoleCode());
    }

    private boolean isSuperAdmin(AppRole role) {
        return SUPER_ADMIN_ROLE.equalsIgnoreCase(role.getTxtRoleCode());
    }

    private Status toStatus(String status) {
        return status != null && "inactive".equals(status.toLowerCase(Locale.ROOT))
                ? Status.INACTIVE
                : Status.ACTIVE;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String generateTemporaryPassword() {
        StringBuilder password = new StringBuilder(TEMPORARY_PASSWORD_LENGTH);
        for (int index = 0; index < TEMPORARY_PASSWORD_LENGTH; index++) {
            password.append(PASSWORD_ALPHABET.charAt(random.nextInt(PASSWORD_ALPHABET.length())));
        }
        return password.toString();
    }

    /** The validated location assignments. */
    private record Assignments(Set<String> locations) {
    }
}
