package com.bizzskill.portal.config;

import com.bizzskill.portal.common.error.ApiErrorResponse;
import com.bizzskill.portal.security.PortalPrincipal;
import com.bizzskill.portal.security.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Stateless, token-based security for the REST API.
 *
 * <p>Design notes worth knowing before changing anything here:
 * <ul>
 *   <li><strong>No sessions.</strong> Every request carries its own bearer token,
 *       so there is no server-side session to cluster or expire.
 *   <li><strong>CSRF is disabled</strong> because the API authenticates with an
 *       {@code Authorization} header and sets no cookie. A browser cannot be
 *       tricked into adding that header cross-site, which is the whole premise
 *       CSRF protection defends.
 *   <li><strong>Authorities are permission codes</strong>, taken from the token's
 *       {@code permissions} claim. Endpoints therefore read
 *       {@code @PreAuthorize("hasAuthority('assessments.edit')")} — a capability
 *       check, not a role check, so re-granting a permission is a data change.
 * </ul>
 */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
@EnableMethodSecurity
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    /** Endpoints reachable without a token. Everything else requires one. */
    private static final String[] PUBLIC_ENDPOINTS = {
            "/api/auth/login",
            "/api/health"
    };

    @Bean
    SecurityFilterChain apiSecurityFilterChain(
            HttpSecurity http,
            Converter<Jwt, JwtAuthenticationToken> jwtAuthenticationConverter,
            ObjectMapper objectMapper,
            CorsConfigurationSource corsConfigurationSource) throws Exception {

        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        // CORS preflight carries no credentials by definition.
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(unauthorizedEntryPoint(objectMapper)))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(unauthorizedEntryPoint(objectMapper))
                        .accessDeniedHandler(forbiddenHandler(objectMapper)));

        return http.build();
    }

    /**
     * Signs tokens with a symmetric key.
     *
     * <p>HS256 is enough for a single service that both issues and verifies its own
     * tokens: there is no third party to publish a public key to. A shared secret
     * also cannot be forged by a client, unlike the {@code alg: none} and
     * algorithm-confusion attacks that asymmetric setups have to guard against.
     */
    @Bean
    JwtEncoder jwtEncoder(JwtProperties properties) {
        byte[] key = properties.secret().getBytes(StandardCharsets.UTF_8);
        if (key.length < 32) {
            throw new IllegalStateException(
                    "portal.security.jwt.secret must be at least 32 bytes for HS256; it is "
                            + key.length + ". Set the JWT_SECRET environment variable.");
        }
        SecretKey secretKey = new SecretKeySpec(key, "HmacSHA256");
        return new NimbusJwtEncoder(new com.nimbusds.jose.jwk.source.ImmutableSecret<>(secretKey));
    }

    /**
     * Verifies tokens.
     *
     * <p>The issuer is checked as well as the signature, so a token minted by a
     * different system that happens to share the key is still rejected.
     */
    @Bean
    JwtDecoder jwtDecoder(JwtProperties properties) {
        SecretKey secretKey = new SecretKeySpec(
                properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(org.springframework.security.oauth2.jwt.JwtValidators
                .createDefaultWithIssuer(properties.issuer()));
        return decoder;
    }

    /**
     * Maps a verified token onto the caller's authorities.
     *
     * <p>Spring Security's default converter reads {@code scope}/{@code scp} and
     * prefixes them with {@code SCOPE_}. This application authorises on permission
     * codes, so they are used verbatim and {@code hasAuthority('assessments.edit')}
     * reads exactly like the permission the administrator granted.
     */
    @Bean
    Converter<Jwt, JwtAuthenticationToken> jwtAuthenticationConverter(TokenService tokenService) {
        return jwt -> {
            PortalPrincipal principal = tokenService.toPrincipal(jwt);

            List<GrantedAuthority> authorities = principal.permissions().stream()
                    .map(permission -> (GrantedAuthority) new SimpleGrantedAuthority(permission))
                    .toList();

            return new JwtAuthenticationToken(jwt, authorities, principal.name());
        };
    }

    /**
     * Which browser origins may call the API.
     *
     * <p>Explicit origins rather than {@code *}: a wildcard cannot be combined with
     * credentials, and it would let any site on the internet call the API from a
     * user's browser.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${portal.security.allowed-origins:http://localhost:4200}") List<String> allowedOrigins) {

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    /** Answers a missing or invalid token with the standard error body. */
    private AuthenticationEntryPoint unauthorizedEntryPoint(ObjectMapper objectMapper) {
        return (request, response, authException) -> {
            log.debug("Rejecting unauthenticated request to {}", request.getRequestURI());
            writeError(objectMapper, request, response, HttpStatus.UNAUTHORIZED,
                    "Sign in to continue.");
        };
    }

    /** Answers a valid token that lacks the required permission. */
    private AccessDeniedHandler forbiddenHandler(ObjectMapper objectMapper) {
        return (request, response, deniedException) ->
                writeError(objectMapper, request, response, HttpStatus.FORBIDDEN,
                        "You do not have permission to do that.");
    }

    private void writeError(
            ObjectMapper objectMapper,
            HttpServletRequest request,
            HttpServletResponse response,
            HttpStatus status,
            String message) throws IOException {

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), ApiErrorResponse.of(
                status.value(), status.getReasonPhrase(), message, request.getRequestURI()));
    }
}
