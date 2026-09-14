import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Routes,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';
import { SIGN_IN, signInWith } from '../../testing/api-testing';

const STORAGE_KEY = 'bizzskill_auth_state';

/**
 * Route stub — `logout()` navigates to `/login`, so the test router needs a
 * route to match or the navigation rejects with NG04002.
 */
const ROUTES: Routes = [{ path: 'login', children: [] }];

describe('authGuard', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  /** Runs the guard for a route. */
  function canActivate(): true | UrlTree {
    const route = {} as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;

    return TestBed.runInInjectionContext(() => authGuard(route, state)) as true | UrlTree;
  }

  it('sends a signed-out visitor to the login page', () => {
    const result = canActivate();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('admits any signed-in account, whatever its role', () => {
    signInWith(http, auth, SIGN_IN.faculty);

    expect(canActivate()).toBe(true);
  });

  it('sends a signed-out session back to login, even after it was signed in', () => {
    signInWith(http, auth, SIGN_IN.faculty);

    auth.logout();
    http
      .match((request) => request.url.endsWith('/auth/logout'))
      .forEach((request) => request.flush({}));

    expect(canActivate()).toBeInstanceOf(UrlTree);
  });
});
