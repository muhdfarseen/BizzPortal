package com.bizzskill.portal.common.error;

/**
 * The credentials presented were not valid.
 *
 * <p>Answered with 401 rather than 400 so the client can tell "sign in again"
 * apart from "your request was malformed".
 */
public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException(String message) {
        super(message);
    }
}
