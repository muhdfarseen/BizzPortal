package com.bizzskill.portal.security;

import com.bizzskill.portal.common.enums.RoleScope;
import com.bizzskill.portal.config.JwtProperties;
import com.bizzskill.portal.user.entity.AppPermission;
import com.bizzskill.portal.user.entity.AppUser;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Issues and reads the application's access tokens.
 *
 * <p>A token carries the caller's identity, role, permission codes and
 * organisation assignments. Putting the permissions in the token is what makes
 * authorisation stateless: the security filter answers every
 * {@code hasAuthority(...)} check without touching the database.
 *
 * <p><strong>Consequence to be aware of:</strong> a token is a snapshot. Removing
 * a permission or an assignment takes effect the next time that user signs in,
 * not immediately. That is the accepted trade-off of the stateless design the
 * client chose; the alternatives are short-lived tokens with a refresh flow, or
 * revocation checking on each request.
 */
@Service
public class TokenService {

    /** Claim holding the employee number. */
    public static final String CLAIM_EMPLOYEE_ID = "employeeId";
    /** Claim holding the display name, used to attribute audit rows. */
    public static final String CLAIM_NAME = "name";
    /** Claim holding the role code. */
    public static final String CLAIM_ROLE = "role";
    /** Claim holding the role's scope. */
    public static final String CLAIM_SCOPE = "scope";
    /** Claim holding the permission codes. */
    public static final String CLAIM_PERMISSIONS = "permissions";
    /** Claim holding the assigned location ids. */
    public static final String CLAIM_LOCATIONS = "locations";
    /** Claim holding the assigned batch ids. */
    public static final String CLAIM_BATCHES = "batches";

    private final JwtEncoder encoder;
    private final JwtProperties properties;

    public TokenService(JwtEncoder encoder, JwtProperties properties) {
        this.encoder = encoder;
        this.properties = properties;
    }

    /**
     * Mints an access token for an account.
     *
     * <p>The caller must have loaded the role with its permissions; the user
     * repository does that with an entity graph precisely so this method can
     * build the authority list without another query.
     */
    public IssuedToken issue(AppUser user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(properties.ttl());

        Set<String> permissions = user.getRole().getPermissions().stream()
                .map(AppPermission::getTxtPermissionCode)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .subject(user.getTxtUsername())
                .claim(CLAIM_EMPLOYEE_ID, user.getIntEmployeeId())
                .claim(CLAIM_NAME, user.getTxtName())
                .claim(CLAIM_ROLE, user.getRole().getTxtRoleCode())
                .claim(CLAIM_SCOPE, user.getRole().getTxtScope().getCode())
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions))
                .claim(CLAIM_LOCATIONS, List.copyOf(user.getLocationIds()))
                .claim(CLAIM_BATCHES, List.copyOf(user.getBatchIds()))
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        return new IssuedToken(value, properties.ttl().toSeconds());
    }

    /** Rebuilds the caller from the claims of an already-verified token. */
    public PortalPrincipal toPrincipal(Jwt jwt) {
        return new PortalPrincipal(
                jwt.getSubject(),
                jwt.getClaim(CLAIM_EMPLOYEE_ID),
                jwt.getClaim(CLAIM_NAME),
                jwt.getClaim(CLAIM_ROLE),
                RoleScope.fromCode(jwt.getClaimAsString(CLAIM_SCOPE)),
                stringSet(jwt.getClaim(CLAIM_PERMISSIONS)),
                stringSet(jwt.getClaim(CLAIM_LOCATIONS)),
                longSet(jwt.getClaim(CLAIM_BATCHES)));
    }

    @SuppressWarnings("unchecked")
    private Set<String> stringSet(Object claim) {
        if (claim instanceof List<?> list) {
            return list.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        }
        return Set.of();
    }

    @SuppressWarnings("unchecked")
    private Set<Long> longSet(Object claim) {
        if (claim instanceof List<?> list) {
            return list.stream()
                    .filter(Number.class::isInstance)
                    .map(value -> ((Number) value).longValue())
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        }
        return Set.of();
    }

    /**
     * A freshly minted token.
     *
     * @param value           the compact JWS.
     * @param expiresInSeconds lifetime, so the client can refresh proactively.
     */
    public record IssuedToken(String value, long expiresInSeconds) {
    }
}
