package com.bizzskill.portal.auth.service;

import com.bizzskill.portal.auth.dto.LoginRequest;
import com.bizzskill.portal.auth.dto.LoginResponse;
import com.bizzskill.portal.user.dto.PortalUserResponse;
import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.common.error.InvalidCredentialsException;
import com.bizzskill.portal.security.TokenService;
import com.bizzskill.portal.user.entity.AppUser;
import com.bizzskill.portal.user.repository.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Signs users in and mints their access tokens.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /**
     * A hash-like value compared against when the account does not exist.
     *
     * <p>Without this, a request for an unknown user returns far faster than one
     * for a known user, and the difference is measurable — enough to enumerate
     * which employee numbers have accounts. Comparing against a dummy value costs
     * one hash and removes the signal.
     */
    private static final String ABSENT_ACCOUNT_PLACEHOLDER = "no-such-account";

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;

    public AuthService(
            AppUserRepository users, PasswordEncoder passwordEncoder, TokenService tokenService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
    }

    /**
     * Verifies credentials and issues a token.
     *
     * <p>Order matters: the password is checked <em>before</em> the account status.
     * Checking status first would tell an attacker which employee numbers have
     * accounts, without needing a password. This way the "account is inactive"
     * message is only ever shown to someone who already knows the password.
     *
     * @throws InvalidCredentialsException if the account is unknown or the password
     *                                     is wrong.
     * @throws InvalidCredentialsException if the account exists but is inactive.
     */
    @Transactional
    public LoginResponse login(LoginRequest request) {
        Optional<AppUser> found = findAccount(request.employeeId());

        if (found.isEmpty()) {
            // Spend the same effort as a real comparison, then fail identically.
            passwordEncoder.matches(request.password(), ABSENT_ACCOUNT_PLACEHOLDER);
            throw new InvalidCredentialsException("Your Employee ID or password is incorrect.");
        }

        AppUser user = found.get();
        if (!passwordEncoder.matches(request.password(), user.getTxtPassword())) {
            log.info("Failed sign-in for account '{}'", user.getTxtUsername());
            throw new InvalidCredentialsException("Your Employee ID or password is incorrect.");
        }

        if (user.getTxtStatus() != Status.ACTIVE) {
            throw new InvalidCredentialsException(
                    "This account is inactive. Ask a Super Admin to reactivate it.");
        }

        // Touch the permission set while the transaction is open: the token is
        // built from it and the persistence context is closed on return.
        user.getRole().getPermissions().size();

        user.setDateLastLogin(Instant.now());
        users.save(user);

        TokenService.IssuedToken token = tokenService.issue(user);
        log.info("Signed in '{}' as {}", user.getTxtUsername(), user.getRole().getTxtRoleCode());

        return LoginResponse.of(token.value(), token.expiresInSeconds(), PortalUserResponse.from(user));
    }

    /** The account behind an authenticated request. */
    @Transactional(readOnly = true)
    public PortalUserResponse currentUser(String username) {
        AppUser user = users.findByTxtUsernameIgnoreCase(username)
                .orElseThrow(() -> new InvalidCredentialsException("Your session is no longer valid."));
        user.getRole().getPermissions().size();
        return PortalUserResponse.from(user);
    }

    /**
     * Finds an account by username, by employee number, or by an {@code EMP-} style
     * reference.
     *
     * <p>The portal's own records key people by a numeric employee id, but staff
     * habitually write it with a prefix. Accepting all three forms costs one string
     * operation and avoids a support ticket per sign-in.
     */
    private Optional<AppUser> findAccount(String identifier) {
        String trimmed = identifier.trim();

        Optional<AppUser> byUsername = users.findByTxtUsernameIgnoreCase(trimmed);
        if (byUsername.isPresent()) {
            return byUsername;
        }

        String digits = trimmed.replaceAll("(?i)^emp[-_ ]*", "");
        if (digits.matches("\\d{1,19}")) {
            return users.findByIntEmployeeId(Long.valueOf(digits));
        }

        return Optional.empty();
    }
}
