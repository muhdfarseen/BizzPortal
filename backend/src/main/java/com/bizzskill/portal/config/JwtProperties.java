package com.bizzskill.portal.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * Token settings, bound from {@code portal.security.jwt.*}.
 *
 * <p>The signing secret has no usable default in production: it comes from the
 * {@code JWT_SECRET} environment variable. {@link SecurityConfig} refuses to
 * start with a short key, and warns loudly while the development default is in
 * use.
 *
 * @param secret  HMAC-SHA256 signing key. Must be at least 32 bytes, because
 *                that is the shortest key HS256 is defined for.
 * @param issuer  the {@code iss} claim, so a token from another system cannot be
 *                replayed against this one.
 * @param ttl     how long an issued token stays valid.
 */
@Validated
@ConfigurationProperties(prefix = "portal.security.jwt")
public record JwtProperties(
        @NotBlank String secret,
        @NotBlank String issuer,
        @NotNull Duration ttl) {
}
