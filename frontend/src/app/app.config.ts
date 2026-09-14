import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { catchError, firstValueFrom, of } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { apiErrorInterceptor } from './core/http/api-error.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // `apiErrorInterceptor` runs first so the auth interceptor still sees a raw
    // `HttpErrorResponse` when it decides whether a 401 ends the session.
    provideHttpClient(withInterceptors([apiErrorInterceptor, authInterceptor])),
    // Re-reads a persisted session before the first route is activated, so the
    // auth guard never has to guess whether a token is still good.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      return firstValueFrom(auth.restoreSession().pipe(catchError(() => of(null))));
    }),
  ],
};
