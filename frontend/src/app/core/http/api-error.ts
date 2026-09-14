import { HttpErrorResponse } from '@angular/common/http';

/**
 * The backend's single error envelope, and how the UI reads it.
 *
 * Every failing endpoint answers with the same body:
 * `{timestamp, status, error, message, path, fieldErrors:[{field,message}]}`.
 * These helpers turn that — or a transport failure, which has no body at all —
 * into one shape the screens can render, so no component parses the envelope
 * itself.
 */

/** One field the backend rejected, e.g. `{field:'rows[2].score', message:'…'}`. */
export interface ApiFieldError {
  field: string;
  message: string;
}

/** A failure reduced to what a screen needs. */
export interface ApiErrorDetails {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** A sentence safe to show the user. */
  message: string;
  /** Per-field detail; empty when the failure was not a validation one. */
  fieldErrors: ApiFieldError[];
}

/** Shown when nothing better can be said about a failure. */
export const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** The message shown when the API cannot be reached at all. */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

/** Whether a value is the backend's error envelope. */
function isEnvelope(body: unknown): body is {
  status?: number;
  message?: string;
  fieldErrors?: unknown;
} {
  return typeof body === 'object' && body !== null;
}

/** Reads the field errors out of an envelope, dropping anything malformed. */
function readFieldErrors(body: unknown): ApiFieldError[] {
  if (!isEnvelope(body) || !Array.isArray(body.fieldErrors)) {
    return [];
  }
  return body.fieldErrors
    .filter(
      (entry): entry is ApiFieldError =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ApiFieldError).field === 'string' &&
        typeof (entry as ApiFieldError).message === 'string',
    )
    .map((entry) => ({ field: entry.field, message: entry.message }));
}

/**
 * Reduces any thrown value to an {@link ApiErrorDetails}.
 *
 * A 4xx envelope always carries a message the backend wrote for the user, so it
 * is preferred; a 5xx never leaks detail, so its body is ignored and the
 * fallback is used. A transport error (status 0) gets its own message.
 */
export function toApiError(error: unknown): ApiErrorDetails {
  if (error instanceof ApiRequestError) {
    return { status: error.status, message: error.message, fieldErrors: [...error.fieldErrors] };
  }

  if (!(error instanceof HttpErrorResponse)) {
    const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
    return { status: 0, message: message || DEFAULT_ERROR_MESSAGE, fieldErrors: [] };
  }

  const fieldErrors = readFieldErrors(error.error);
  const status = error.status;

  if (status === 0) {
    return { status, message: NETWORK_ERROR_MESSAGE, fieldErrors: [] };
  }

  const envelopeMessage =
    isEnvelope(error.error) && typeof error.error.message === 'string'
      ? error.error.message.trim()
      : '';

  if (status >= 500) {
    return { status, message: DEFAULT_ERROR_MESSAGE, fieldErrors: [] };
  }

  return {
    status,
    // Deliberately not `error.message`: Angular builds that as
    // "Http failure response for http://localhost:8080/api/users/roles: 403
    // Forbidden", which is a developer string rather than a sentence for a
    // person, and it leaks the URL into the UI. When the API sent no message of
    // its own, the neutral fallback is the honest thing to show.
    message: envelopeMessage || DEFAULT_ERROR_MESSAGE,
    fieldErrors,
  };
}

/** The message of a failure, ready to render. */
export function apiErrorMessage(error: unknown): string {
  return toApiError(error).message;
}

/** The field errors of a failure; empty when it carried none. */
export function apiFieldErrors(error: unknown): ApiFieldError[] {
  return toApiError(error).fieldErrors;
}

/**
 * The message recorded for one field, if the backend reported one. Matches the
 * field name exactly as the API sent it, e.g. `employeeId` or `rows[2].score`.
 */
export function fieldErrorMessage(
  fieldErrors: readonly ApiFieldError[],
  field: string,
): string | undefined {
  return fieldErrors.find((entry) => entry.field === field)?.message;
}

/**
 * An API failure as a thrown {@link Error}, so callers can `catch` it and read
 * `.message` (plus {@link fieldErrors}) without checking the type first.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: readonly ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** The message recorded for one field, if any. */
  fieldError(field: string): string | undefined {
    return fieldErrorMessage(this.fieldErrors, field);
  }
}
