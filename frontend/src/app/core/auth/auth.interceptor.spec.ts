import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { apiErrorInterceptor } from '../http/api-error.interceptor';
import { ApiRequestError } from '../http/api-error';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';
import { SESSION_STORAGE_KEY } from './session-storage';
import { API_BASE, API_USERS, SIGN_IN, signInWith } from '../../testing/api-testing';

@Component({ selector: 'app-blank-page', template: '' })
class BlankPageComponent {}

const ROUTES = [
  { path: 'login', component: BlankPageComponent },
  { path: 'protected', component: BlankPageComponent },
];

/** The same order as `app.config.ts`: the error interceptor converts last. */
function provideInterceptors() {
  return provideHttpClient(withInterceptors([apiErrorInterceptor, authInterceptor]));
}

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  let client: HttpClient;

  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    await TestBed.configureTestingModule({
      providers: [provideRouter(ROUTES), provideInterceptors(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it('attaches the stored bearer token to API calls', () => {
    signInWith(http, auth, SIGN_IN.locationAdmin);

    client.get(`${API_BASE}/users/roles`).subscribe();

    const request = http.expectOne(`${API_BASE}/users/roles`);
    expect(request.request.headers.get('Authorization')).toBe(
      `Bearer token-${SIGN_IN.locationAdmin}`,
    );
    request.flush([]);
  });

  it('never sends a (possibly stale) token with the login request', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: 'stale-token', user: API_USERS[SIGN_IN.superadmin] }),
    );

    auth.login(SIGN_IN.superadmin, 'secret').subscribe();

    const request = http.expectOne(`${API_BASE}/auth/login`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({
      accessToken: 'fresh',
      tokenType: 'Bearer',
      expiresIn: 28800,
      user: API_USERS[SIGN_IN.superadmin],
    });
    http.match(`${API_BASE}/organization/locations`).forEach((org) => org.flush([]));
  });

  it('leaves requests outside the API untouched', () => {
    signInWith(http, auth, SIGN_IN.locationAdmin);

    client.get('https://cdn.example.com/i18n.json').subscribe();

    const request = http.expectOne('https://cdn.example.com/i18n.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('ends the session and redirects to the sign-in page on a 401', async () => {
    signInWith(http, auth, SIGN_IN.locationAdmin);
    expect(auth.isAuthenticated()).toBe(true);

    let thrown: unknown = null;
    client
      .get(`${API_BASE}/users/roles`)
      .subscribe({ error: (error: unknown) => (thrown = error) });

    http.expectOne(`${API_BASE}/users/roles`).flush(
      {
        timestamp: '2026-09-13T09:32:09.844162Z',
        status: 401,
        error: 'Unauthorized',
        message: 'Sign in to continue.',
        path: '/api/users/roles',
        fieldErrors: [],
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    // The error still reaches the caller, reduced to the shared error shape.
    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect((thrown as ApiRequestError).status).toBe(401);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.url).toBe('/login');
  });

  it('shows a failed sign-in instead of treating it as an expired session', async () => {
    let failed = false;
    auth.login(SIGN_IN.superadmin, 'wrong').subscribe({ error: () => (failed = true) });

    http.expectOne(`${API_BASE}/auth/login`).flush(
      {
        timestamp: '2026-09-13T09:32:09.844162Z',
        status: 401,
        error: 'Unauthorized',
        message: 'Your Employee ID or password is incorrect.',
        path: '/api/auth/login',
        fieldErrors: [],
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed).toBe(true);
    expect(auth.loginError()).toContain('Employee ID or password is incorrect');
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(router.url).not.toBe('/login');
  });
});
