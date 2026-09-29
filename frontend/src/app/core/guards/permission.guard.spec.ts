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
import { Permission, UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import { permissionGuard } from './permission.guard';
import { SIGN_IN, signInWith } from '../../testing/api-testing';

const STORAGE_KEY = 'bizzskill_auth_state';

/**
 * Route stub — `logout()` navigates to `/login`, so the test router needs a
 * route to match or the navigation rejects with NG04002.
 */
const ROUTES: Routes = [{ path: 'login', children: [] }];

/** One API account per role (see the fixtures in `testing/api-testing`). */
const SIGN_IN_BY_ROLE: Record<UserRole, string> = {
  superadmin: SIGN_IN.superadmin,
  'program-manager': SIGN_IN.programManager,
  'location-admin': SIGN_IN.locationAdmin,
  faculty: SIGN_IN.faculty,
};

/**
 * Accounts that differ only in the track permissions granted to them directly,
 * for the guards that key on those.
 */
const GRANTED = {
  remedial: SIGN_IN.facultyRemedial,
  both: SIGN_IN.facultyLapRemedial,
};

const ROLES = Object.keys(SIGN_IN_BY_ROLE) as UserRole[];

describe('permissionGuard', () => {
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

  /** Runs the guard for a route as the signed-in session. */
  function canActivate(permission: Permission): true | UrlTree {
    const route = {} as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;

    return TestBed.runInInjectionContext(() => permissionGuard(permission)(route, state)) as
      true | UrlTree;
  }

  /** The roles the guard lets through to a route needing this permission. */
  function admittedBy(permission: Permission): UserRole[] {
    return ROLES.filter((role) => {
      signInWith(http, auth, SIGN_IN_BY_ROLE[role]);
      return canActivate(permission) === true;
    });
  }

  it('keeps User Management for the Super Admin alone', () => {
    expect(admittedBy('users.manage')).toEqual(['superadmin']);
  });

  it('keeps Exam Configuration for the Super Admin alone', () => {
    expect(admittedBy('configuration.manage')).toEqual(['superadmin']);
  });

  it('keeps moving LAP tracks away from a faculty granted only Remedial', () => {
    expect(admittedBy('lap-remedial.lap-manage')).toEqual([
      'superadmin',
      'program-manager',
      'location-admin',
    ]);
  });

  it('admits a faculty granted Remedial on their account, but not LAP', () => {
    // The per-person grant: the account is an ordinary faculty member whose only
    // difference is the Remedial box that was ticked for them.
    signInWith(http, auth, GRANTED.remedial);
    expect(canActivate('lap-remedial.remedial-manage')).toBe(true);
    expect(canActivate('lap-remedial.lap-manage')).toBeInstanceOf(UrlTree);
  });

  it('admits a faculty granted both tracks on their account', () => {
    signInWith(http, auth, GRANTED.both);
    expect(canActivate('lap-remedial.remedial-manage')).toBe(true);
    expect(canActivate('lap-remedial.lap-manage')).toBe(true);
  });

  it('still lets every faculty read the tracks, granted or not', () => {
    expect(admittedBy('lap-remedial.view')).toEqual([
      'superadmin',
      'program-manager',
      'location-admin',
      'faculty',
    ]);
    signInWith(http, auth, GRANTED.both);
    expect(canActivate('lap-remedial.view')).toBe(true);
  });

  it('turns a denied role back to the dashboard home it always has', () => {
    signInWith(http, auth, SIGN_IN.faculty);

    const result = canActivate('users.manage');

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/dashboard/home');
  });
});
