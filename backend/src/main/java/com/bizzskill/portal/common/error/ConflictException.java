package com.bizzskill.portal.common.error;

/**
 * A write collides with existing data.
 *
 * <p>Used for unique-key clashes — a duplicate employee number, username or
 * assessment name — so the client gets a message naming the conflict instead of
 * a raw database constraint violation.
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
