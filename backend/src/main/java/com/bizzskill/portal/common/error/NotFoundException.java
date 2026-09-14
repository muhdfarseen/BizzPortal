package com.bizzskill.portal.common.error;

/**
 * A requested record does not exist, or is outside the caller's data scope.
 *
 * <p>Deliberately used for both. Distinguishing "does not exist" from "exists but
 * belongs to another location" would let a restricted user probe the organisation
 * structure by comparing the two responses.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    /** {@code "No assessment with id 7."} */
    public static NotFoundException of(String what, Object id) {
        return new NotFoundException("No " + what + " with id " + id + ".");
    }
}
