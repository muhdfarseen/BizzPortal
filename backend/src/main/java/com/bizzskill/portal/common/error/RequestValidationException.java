package com.bizzskill.portal.common.error;

import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;

import java.util.List;

/**
 * A request that passed bean validation but breaks a cross-field rule.
 *
 * <p>{@code @Valid} can check that a field is present, a number is positive, or a
 * string is short enough. It cannot express "the minimum must not exceed the
 * maximum", or "no two bands may declare the same level", because those rules
 * span several fields or several rows.
 *
 * <p>Rather than degrade those into a 422 with one flat sentence, this carries
 * per-field violations so the client receives the same {@code fieldErrors} shape
 * it gets for ordinary validation failures, and can highlight the offending row
 * in the form.
 */
public class RequestValidationException extends RuntimeException {

    private final transient List<FieldViolation> violations;

    public RequestValidationException(List<FieldViolation> violations) {
        super("The request contains invalid values.");
        this.violations = List.copyOf(violations);
    }

    public List<FieldViolation> getViolations() {
        return violations;
    }
}
