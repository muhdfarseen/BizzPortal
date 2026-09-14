package com.bizzskill.portal.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;

/**
 * Turns exceptions into the single {@link ApiErrorResponse} shape.
 *
 * <p>Two rules are followed throughout:
 * <ul>
 *   <li>A 5xx never leaks a message, a SQL fragment or a stack trace to the
 *       client. The detail is logged with its stack trace; the response says only
 *       that something went wrong.
 *   <li>A 4xx always says what the client can do about it, because those
 *       messages are rendered directly in the UI.
 * </ul>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            NotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleConflict(
            ConflictException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<ApiErrorResponse> handleBusinessRule(
            BusinessRuleException ex, HttpServletRequest request) {
        return build(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidCredentials(
            InvalidCredentialsException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    /**
     * Handles a cross-field rule broken by an otherwise well-formed payload.
     *
     * <p>Answered in the same shape as bean-validation failures, so the client has
     * one way to highlight invalid fields rather than two.
     */
    @ExceptionHandler(RequestValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleRequestValidation(
            RequestValidationException ex, HttpServletRequest request) {

        ApiErrorResponse body = ApiErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI(),
                ex.getViolations());
        return ResponseEntity.badRequest().body(body);
    }

    /**
     * Handles {@code @Valid} failures on a request body.
     *
     * <p>Every offending field is returned, not just the first, so a form can mark
     * all of its invalid inputs in one round trip.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleBodyValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {

        List<ApiErrorResponse.FieldViolation> violations = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiErrorResponse.FieldViolation(
                        error.getField(),
                        error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage()))
                .toList();

        ApiErrorResponse body = ApiErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "The request contains invalid values.",
                request.getRequestURI(),
                violations);
        return ResponseEntity.badRequest().body(body);
    }

    /** Handles constraint violations raised on path variables and query parameters. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(
            ConstraintViolationException ex, HttpServletRequest request) {

        List<ApiErrorResponse.FieldViolation> violations = ex.getConstraintViolations().stream()
                .map(violation -> new ApiErrorResponse.FieldViolation(
                        violation.getPropertyPath().toString(), violation.getMessage()))
                .toList();

        ApiErrorResponse body = ApiErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "The request contains invalid values.",
                request.getRequestURI(),
                violations);
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<ApiErrorResponse> handleMalformedRequest(
            Exception ex, HttpServletRequest request) {
        log.debug("Malformed request to {}: {}", request.getRequestURI(), ex.getMessage());
        return build(HttpStatus.BAD_REQUEST, "The request could not be read.", request);
    }

    /**
     * Handles a denied method-level authorisation, e.g. a failed
     * {@code @PreAuthorize}.
     *
     * <p>Mapped here rather than rethrown: a denial raised inside a controller
     * happens after the security filter chain has finished, so it would otherwise
     * be reported as a 500 instead of a 403.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessDenied(
            AccessDeniedException ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "You do not have permission to do that.", request);
    }

    /**
     * Handles a URL that matches no endpoint.
     *
     * <p>Mapped explicitly because an unmatched path surfaces as
     * {@code NoResourceFoundException} from the static-resource handler rather than
     * as a 404 on its own. Without this it falls into the catch-all below and a
     * mistyped URL is reported — and alerted on — as a server fault.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNoSuchEndpoint(
            NoResourceFoundException ex, HttpServletRequest request) {
        log.debug("No endpoint for {} {}", request.getMethod(), request.getRequestURI());
        return build(
                HttpStatus.NOT_FOUND,
                "No endpoint matches " + request.getRequestURI() + ".",
                request);
    }

    /**
     * Handles a known URL called with the wrong method, e.g. a POST to a GET.
     *
     * <p>Answered with 405 and an {@code Allow} header, which is what a client needs
     * to correct the call.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {

        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (ex.getSupportedHttpMethods() != null) {
            response.allow(ex.getSupportedHttpMethods().toArray(new HttpMethod[0]));
        }
        return response.body(ApiErrorResponse.of(
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                HttpStatus.METHOD_NOT_ALLOWED.getReasonPhrase(),
                "That method is not supported for " + request.getRequestURI() + ".",
                request.getRequestURI()));
    }

    /**
     * The catch-all.
     *
     * <p>Logs everything, returns nothing specific. An unexpected failure's
     * message can contain a SQL statement fragment, a file path or an internal
     * hostname, none of which belongs in a response body.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        log.error("Unhandled failure while processing {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong on our side. Please try again.",
                request);
    }

    private ResponseEntity<ApiErrorResponse> build(
            HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(ApiErrorResponse.of(
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI()));
    }
}
