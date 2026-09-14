import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { readAccessToken } from './session-storage';

/**
 * Attaches the bearer token to API calls and ends the session on a 401.
 *
 * Two deliberate exemptions keep the sign-in screen usable:
 *
 * - The login request itself is never given a (possibly stale) token, and a 401
 *   from it is not treated as an expired session — a wrong password must show
 *   the message the API returned, not reload the page.
 * - Requests outside the API base URL (component templates, assets) are left
 *   untouched.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);
  const injector = inject(Injector);

  const isApiRequest = request.url.startsWith(environment.apiBaseUrl);
  const isLoginRequest = request.url.endsWith('/auth/login');

  const token = isLoginRequest ? null : readAccessToken();
  const authorized =
    token && isApiRequest
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isLoginRequest) {
        // Resolved lazily: injecting the service eagerly would make HttpClient
        // construct this interceptor while the service is still being built.
        injector.get(AuthService).clearSession();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
