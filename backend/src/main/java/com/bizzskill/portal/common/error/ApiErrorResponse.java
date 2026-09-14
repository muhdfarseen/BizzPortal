package com.bizzskill.portal.common.error;

import java.time.Instant;
import java.util.List;

/**
 * The single error body every failing endpoint returns.
 *
 * <p>One shape for every failure — validation, business rule, not found, server
 * fault — so the frontend has exactly one error format to handle instead of
 * parsing Spring's default {@code ProblemDetail} in some cases and a stack-trace
 * page in others.
 *
 * @param timestamp   when the failure happened (UTC).
 * @param status      HTTP status code.
 * @param error       the status reason, e.g. {@code Bad Request}.
 * @param message     a message safe to show the user.
 * @param path        the request path that failed.
 * @param fieldErrors per-field detail, present only for validation failures.
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<FieldViolation> fieldErrors) {

    /**
     * One field that failed validation.
     *
     * @param field   the field name as the client sent it.
     * @param message why it was rejected.
     */
    public record FieldViolation(String field, String message) {
    }

    /** An error with no per-field detail. */
    public static ApiErrorResponse of(int status, String error, String message, String path) {
        return new ApiErrorResponse(Instant.now(), status, error, message, path, List.of());
    }

    /** A validation failure carrying the offending fields. */
    public static ApiErrorResponse of(
            int status, String error, String message, String path, List<FieldViolation> fieldErrors) {
        return new ApiErrorResponse(Instant.now(), status, error, message, path, List.copyOf(fieldErrors));
    }
}
