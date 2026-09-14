package com.bizzskill.portal.auth.dto;

import com.bizzskill.portal.user.dto.PortalUserResponse;

/**
 * A successful sign-in.
 *
 * @param accessToken the bearer token, sent as {@code Authorization: Bearer …}.
 * @param tokenType   always {@code Bearer}; included so the client does not have
 *                    to hard-code the scheme.
 * @param expiresIn   token lifetime in seconds, so the client can warn before a
 *                    session ends rather than discovering it on a failed call.
 * @param user        the signed-in account, including its permissions.
 */
public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        PortalUserResponse user) {

    public static LoginResponse of(String accessToken, long expiresIn, PortalUserResponse user) {
        return new LoginResponse(accessToken, "Bearer", expiresIn, user);
    }
}
