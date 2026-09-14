package com.bizzskill.portal.user.web;

import com.bizzskill.portal.common.web.PageQuery;
import com.bizzskill.portal.common.web.PageResponse;
import com.bizzskill.portal.security.CurrentUser;
import com.bizzskill.portal.user.dto.CreatedUserResponse;
import com.bizzskill.portal.user.dto.PermissionResponse;
import com.bizzskill.portal.user.dto.PortalUserResponse;
import com.bizzskill.portal.user.dto.RoleResponse;
import com.bizzskill.portal.user.dto.UserCreateRequest;
import com.bizzskill.portal.user.dto.UserUpdateRequest;
import com.bizzskill.portal.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Portal account management.
 *
 * <p>The whole controller is guarded by {@code users.manage}, which only the Super
 * Admin role holds. Also note that a password is never returned: the create
 * endpoint returns a generated one exactly once when it had to make one, and no
 * other response has a field for it.
 */
@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasAuthority('users.manage')")
public class UserController {

    private final UserService users;
    private final CurrentUser currentUser;

    public UserController(UserService users, CurrentUser currentUser) {
        this.users = users;
        this.currentUser = currentUser;
    }

    /**
     * One page of portal accounts.
     *
     * <p>{@code search}, {@code role} and {@code status} are applied in the database
     * with the page, so they filter the whole table rather than the page on screen.
     */
    @GetMapping
    public PageResponse<PortalUserResponse> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String direction) {
        return users.list(PageQuery.of(page, size, search), role, status, sort, direction);
    }

    /**
     * The roles and what each may do.
     *
     * <p>Served rather than duplicated in the frontend, so the permission matrix
     * has exactly one definition — the database — and the two cannot drift.
     */
    @GetMapping("/roles")
    public List<RoleResponse> roles() {
        return users.roles();
    }

    @GetMapping("/permissions")
    public List<PermissionResponse> permissions() {
        return users.permissions();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedUserResponse create(@Valid @RequestBody UserCreateRequest request) {
        return users.create(request);
    }

    /**
     * Updates an account, addressed by employee number rather than by internal id.
     *
     * <p>The employee number is the identity the organisation uses and the one an
     * administrator actually knows; the internal surrogate key is an implementation
     * detail that should not appear in a URL.
     */
    @PatchMapping("/{employeeId}")
    public PortalUserResponse update(
            @PathVariable Long employeeId, @Valid @RequestBody UserUpdateRequest request) {
        return users.update(employeeId, request, currentUser.require().employeeId());
    }

    @DeleteMapping("/{employeeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long employeeId) {
        users.delete(employeeId, currentUser.require().employeeId());
    }
}
