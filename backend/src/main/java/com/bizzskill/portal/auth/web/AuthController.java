package com.bizzskill.portal.auth.web;

import com.bizzskill.portal.auth.dto.LoginRequest;
import com.bizzskill.portal.auth.dto.LoginResponse;
import com.bizzskill.portal.user.dto.PortalUserResponse;
import com.bizzskill.portal.auth.service.AuthService;
import com.bizzskill.portal.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Sign-in and session endpoints.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final CurrentUser currentUser;

    public AuthController(AuthService authService, CurrentUser currentUser) {
        this.authService = authService;
        this.currentUser = currentUser;
    }

    /**
     * Signs in and returns an access token.
     *
     * <p>The only endpoint reachable without a token. It is also the only place a
     * password is ever accepted.
     */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /**
     * The signed-in user, re-read from the database.
     *
     * <p>Exists so the client can refresh its view of the account — after an
     * administrator changes the caller's role, for instance — without holding on
     * to the sign-in response.
     */
    @GetMapping("/me")
    public PortalUserResponse me() {
        return authService.currentUser(currentUser.require().username());
    }

    /**
     * Ends the session.
     *
     * <p>Stateless tokens cannot be revoked server-side, so this is a formality:
     * it exists so the client has one call to make on sign-out, and so a future
     * token-denylist has somewhere to hook in. The client discards the token.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout() {
        return ResponseEntity.ok(Map.of("message", "Signed out."));
    }
}
