package com.bizzskill.portal.security;

import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Compares passwords as stored plain text.
 *
 * <p><strong>This exists because the client asked for unmasked passwords during
 * development, and it must not survive into production.</strong> It is written as
 * a {@link PasswordEncoder} on purpose: when the decision is reversed, the bean
 * in {@code PasswordEncoderConfig} is switched to BCrypt and nothing else in the
 * codebase changes.
 *
 * <p>Two things are done properly even so:
 * <ul>
 *   <li>Comparison is constant-time. A plain {@code String.equals} short-circuits
 *       on the first differing byte, which leaks the length of the matching
 *       prefix and makes the password guessable one character at a time.
 *   <li>{@link #upgradeEncoding} reports {@code true}, marking every stored
 *       password as needing a re-hash — which is exactly the signal a future
 *       {@code UserDetailsPasswordService} needs to migrate hashes on login.
 * </ul>
 */
public class PlainTextPasswordEncoder implements PasswordEncoder {

    @Override
    public String encode(CharSequence rawPassword) {
        return rawPassword == null ? null : rawPassword.toString();
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (rawPassword == null || encodedPassword == null) {
            return false;
        }
        return MessageDigest.isEqual(
                rawPassword.toString().getBytes(StandardCharsets.UTF_8),
                encodedPassword.getBytes(StandardCharsets.UTF_8));
    }

    /** Always true: nothing stored by this encoder is considered safe. */
    @Override
    public boolean upgradeEncoding(String encodedPassword) {
        return true;
    }
}
