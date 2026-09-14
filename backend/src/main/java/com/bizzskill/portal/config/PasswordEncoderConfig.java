package com.bizzskill.portal.config;

import com.bizzskill.portal.security.PlainTextPasswordEncoder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Chooses how account passwords are stored and checked.
 *
 * <p>Default is {@code plain} — unmasked passwords, at the client's explicit
 * request for now. Set {@code portal.security.password-encoding=bcrypt} to switch.
 *
 * <h2>Moving to BCrypt</h2>
 * <ol>
 *   <li>Set the property (and {@code PORTAL_PASSWORD_ENCODING=bcrypt} in the
 *       deployment environment).</li>
 *   <li>Existing rows still hold plain text, so nobody could sign in. Either
 *       issue one-time passwords and let users reset, or — better — apply the
 *       hash on the fly: {@link PlainTextPasswordEncoder#upgradeEncoding} already
 *       returns {@code true} for every row, which is the hook a
 *       {@code UserDetailsPasswordService} implementation uses to re-hash each
 *       password as its owner signs in.</li>
 *   <li>Once every row is a {@code $2a$} hash, the plain-text encoder can be
 *       deleted outright.</li>
 * </ol>
 */
@Configuration
public class PasswordEncoderConfig {

    private static final Logger log = LoggerFactory.getLogger(PasswordEncoderConfig.class);

    @Bean
    public PasswordEncoder passwordEncoder(
            @Value("${portal.security.password-encoding:plain}") String encoding) {

        if ("bcrypt".equalsIgnoreCase(encoding)) {
            log.info("Passwords are stored as BCrypt hashes.");
            return new BCryptPasswordEncoder();
        }

        log.warn("""
                ****************************************************************
                Passwords are stored in PLAIN TEXT (portal.security.password-encoding=plain).
                This is a development setting and MUST NOT be used in production.
                Set portal.security.password-encoding=bcrypt to enable hashing.
                ****************************************************************""");
        return new PlainTextPasswordEncoder();
    }
}
