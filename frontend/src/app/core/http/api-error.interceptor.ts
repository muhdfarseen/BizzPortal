import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../ui/toast.service';
import { ApiRequestError, toApiError } from './api-error';

/**
 * Marks a request whose failure the caller reports itself, or does not need
 * reporting at all.
 *
 * Set it for the app's own background loads — the exam list, the organisation
 * tree, the CEFR mapping, session restore — so a flaky connection does not stack
 * up toasts on a page the user has not touched yet. Also set it where a screen
 * renders the failure inline next to the control that caused it, such as the
 * sign-in form, because two copies of one sentence reads as a malfunction.
 *
 * ```ts
 * this.http.post(url, body, { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) })
 * ```
 */
export const SUPPRESS_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** The message shown when the session ends under the user's feet. */
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

/** Whether this is the sign-in request, which reports its own failure inline. */
function isLoginRequest(url: string): boolean {
  return url.endsWith('/auth/login');
}

/**
 * Turns every failing HTTP response into an {@link ApiRequestError} **and** a
 * toast.
 *
 * The screens then handle one error type with `.message` and `.fieldErrors`
 * already unwrapped, instead of each of them reaching into
 * `HttpErrorResponse.error` and guessing whether the body is the envelope, a
 * Spring `ProblemDetail` or a stack-trace page.
 *
 * Raising the toast here rather than in each component is deliberate: a failure
 * nobody caught used to be silent, so a screen that forgot its error branch
 * simply appeared to do nothing. Now a failure is visible by default, and a
 * component has to opt out to keep quiet.
 *
 * Registered before the auth interceptor so a 401 is still recognised as an
 * `HttpErrorResponse` when that interceptor decides whether to sign the user out.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const toasts = inject(ToastService);

  return next(request).pipe(
    catchError((error: unknown) => {
      const failure = toApiError(error);
      const silent = request.context.get(SUPPRESS_ERROR_TOAST) || isLoginRequest(request.url);

      if (!silent) {
        report(toasts, failure.status, failure.message, failure.fieldErrors.length);
      }

      if (error instanceof ApiRequestError) {
        return throwError(() => error);
      }
      if (error instanceof HttpErrorResponse) {
        return throwError(
          () => new ApiRequestError(failure.status, failure.message, failure.fieldErrors),
        );
      }
      return throwError(() => error);
    }),
  );
};

/**
 * Raises the message for one failure.
 *
 * A 401 on anything but the sign-in request means the session ended, and saying
 * "Unauthorized" to someone who has just been bounced to the login screen
 * explains nothing — so that case gets the sentence they need. Anything the API
 * wrote for the user is preferred as-is.
 */
function report(
  toasts: ToastService,
  status: number,
  message: string,
  fieldErrorCount: number,
): void {
  if (status === 401) {
    toasts.error(SESSION_EXPIRED);
    return;
  }

  if (status === 403) {
    toasts.error(message || 'You do not have permission to do that.');
    return;
  }

  // A validation failure has a precise reason per field; the toast says how many
  // so the user knows to look at the form rather than at the network.
  const detail =
    fieldErrorCount === 1
      ? 'One field needs attention.'
      : fieldErrorCount > 1
        ? `${fieldErrorCount} fields need attention.`
        : undefined;

  toasts.error(message, detail ? { detail } : undefined);
}
