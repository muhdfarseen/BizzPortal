package com.bizzskill.portal.common.error;

/**
 * The request is well-formed but breaks a rule of the domain.
 *
 * <p>Distinct from a validation failure: the payload passed its field checks, but
 * the operation is not allowed given the current state — closing a track that is
 * already closed, deleting an assessment that has results, placing a trainee when
 * they are already on a track. Answered with 422 so the client can tell "you sent
 * something malformed" apart from "that action is not allowed right now".
 */
public class BusinessRuleException extends RuntimeException {

    public BusinessRuleException(String message) {
        super(message);
    }
}
