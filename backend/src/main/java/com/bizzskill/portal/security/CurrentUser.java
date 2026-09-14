package com.bizzskill.portal.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Reads the authenticated caller from the security context.
 *
 * <p>Controllers inject this instead of touching {@code SecurityContextHolder}
 * themselves, so the token-to-principal conversion lives in exactly one place.
 */
@Component
public class CurrentUser {

    private final TokenService tokenService;

    public CurrentUser(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    /**
     * The signed-in caller.
     *
     * @throws IllegalStateException if there is no authenticated token, which can
     *         only happen on an endpoint that was mistakenly left unsecured — a
     *         programming error, not a client error.
     */
    public PortalPrincipal require() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            Jwt jwt = token.getToken();
            return tokenService.toPrincipal(jwt);
        }
        throw new IllegalStateException(
                "No authenticated caller on this request. Is the endpoint missing from a secured path?");
    }

    /** The caller's display name, for audit attribution. */
    public String name() {
        return require().name();
    }
}
