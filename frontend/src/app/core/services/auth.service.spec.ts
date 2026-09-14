import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ROLES, permissionsForRole } from '../models/user.model';
import { AuthService } from './auth.service';
import {
  API_BASE,
  API_USERS,
  ORG_TREE,
  SIGN_IN,
  flushOrg,
  signInWith,
} from '../../testing/api-testing';

const STORAGE_KEY = 'bizzskill_auth_state';

const SUPER_ADMIN = SIGN_IN.superadmin;
const PROGRAM_MANAGER = SIGN_IN.programManager;
const LOCATION_ADMIN = SIGN_IN.locationAdmin;
const FACULTY = SIGN_IN.faculty;
const INACTIVE = SIGN_IN.inactive;

/**
 * Route stub — `logout()` navigates to `/login`, so the test router needs a
 * route to match or the navigation rejects with NG04002.
 */
@Component({ selector: 'app-blank-page', template: '' })
class BlankPageComponent {}

const ROUTES = [{ path: 'login', component: BlankPageComponent }];

describe('AuthService', () => {
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

  describe('the role model', () => {
    it('ships exactly the four portal roles, highest access first', () => {
      expect(ROLES.map((role) => role.id)).toEqual([
        'superadmin',
        'program-manager',
        'location-admin',
        'faculty',
      ]);
    });

    it('reaches the whole organisation only for Super Admin and Program Manager', () => {
      expect(ROLES.filter((role) => role.scope === 'all').map((role) => role.id)).toEqual([
        'superadmin',
        'program-manager',
      ]);
    });

    it('keeps Exam Configuration — and User Management — for Super Admin alone', () => {
      const withConfiguration = ROLES.filter((role) =>
        role.permissions.includes('configuration.manage'),
      ).map((role) => role.id);
      const withUsers = ROLES.filter((role) => role.permissions.includes('users.manage')).map(
        (role) => role.id,
      );

      expect(withConfiguration).toEqual(['superadmin']);
      expect(withUsers).toEqual(['superadmin']);
    });

    it('never gives Faculty the ability to move LAP / Remedial tracks', () => {
      expect(permissionsForRole('faculty')).not.toContain('lap-remedial.manage');
      expect(permissionsForRole('faculty')).toContain('lap-remedial.view');
      expect(permissionsForRole('faculty')).toContain('assessments.edit');
      expect(permissionsForRole('location-admin')).toContain('lap-remedial.manage');
    });
  });

  describe('login', () => {
    it('takes the role, name and assignments of the account the API returns', () => {
      signInWith(http, auth, LOCATION_ADMIN);

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.employeeId()).toBe(LOCATION_ADMIN);
      expect(auth.userName()).toBe('Kochi Location Admin');
      expect(auth.role()).toBe('location-admin');
      expect(auth.assignedLocationIds()).toEqual(['KOC']);
    });

    it('sends the credentials to the login endpoint', () => {
      auth.login('41201', 'hunter2').subscribe();

      const request = http.expectOne(`${API_BASE}/auth/login`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ employeeId: '41201', password: 'hunter2' });
      request.flush({
        accessToken: 'token',
        tokenType: 'Bearer',
        expiresIn: 28800,
        user: API_USERS[LOCATION_ADMIN],
      });
      flushOrg(http);
    });

    it('scopes a Location Admin to the locations it was assigned', () => {
      signInWith(http, auth, LOCATION_ADMIN);

      expect(auth.scope()).toBe('assigned-locations');
      expect(auth.canAccessLocation('KOC')).toBe(true);
      expect(auth.canAccessLocation('BLR')).toBe(false);
      expect(auth.visibleLocations().map((location) => location.id)).toEqual(['KOC']);
    });

    it('scopes Faculty to the batches it was assigned, inside its location', () => {
      signInWith(http, auth, FACULTY);

      expect(auth.role()).toBe('faculty');
      expect(auth.canAccessLocation('BLR')).toBe(true);
      expect(auth.canAccessLocation('CHN')).toBe(false);
      expect(auth.canAccessBatch('103')).toBe(true);
      expect(auth.canAccessBatch('104')).toBe(false);

      const visible = auth.visibleLocations();
      expect(visible.map((location) => location.id)).toEqual(['BLR']);
      expect(visible[0].batches.map((batch) => batch.id)).toEqual(['103']);
    });

    it('reaches every location — and no configuration — as Program Manager', () => {
      signInWith(http, auth, PROGRAM_MANAGER);

      expect(auth.scope()).toBe('all');
      expect(auth.canAccessLocation('DEL')).toBe(true);
      expect(auth.canAccessBatch('999')).toBe(true);
      expect(auth.has('configuration.manage')).toBe(false);
      expect(auth.has('users.manage')).toBe(false);
      expect(auth.has('reports.view')).toBe(true);
    });

    it('gives Super Admin every permission', () => {
      signInWith(http, auth, SUPER_ADMIN);

      expect(auth.role()).toBe('superadmin');
      expect(auth.has('users.manage')).toBe(true);
      expect(auth.has('configuration.manage')).toBe(true);
      expect(auth.has('lap-remedial.manage')).toBe(true);
    });

    it('refuses a deactivated account and says why', () => {
      let failed = false;
      auth.login(INACTIVE, 'secret').subscribe({ error: () => (failed = true) });

      const request = http.expectOne(`${API_BASE}/auth/login`);
      request.flush(
        {
          timestamp: '2026-09-13T09:32:09.844162Z',
          status: 401,
          error: 'Unauthorized',
          message: 'Your account is inactive.',
          path: '/api/auth/login',
          fieldErrors: [],
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(failed).toBe(true);
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.loginError()).toContain('inactive');
    });

    it('refuses an empty employee id or password without calling the API', () => {
      let failed = false;
      auth.login('  ', 'secret').subscribe({ error: () => (failed = true) });
      auth.login(SUPER_ADMIN, '   ').subscribe({ error: () => (failed = true) });

      http.expectNone(`${API_BASE}/auth/login`);
      expect(failed).toBe(true);
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('keeps the session across a reload', () => {
      signInWith(http, auth, FACULTY);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.accessToken).toBe(`token-${FACULTY}`);

      // A second service instance reads what the first one persisted.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
      });
      const restored = TestBed.inject(AuthService);
      const restoredHttp = TestBed.inject(HttpTestingController);

      restored.restoreSession().subscribe();
      restoredHttp.expectOne(`${API_BASE}/auth/me`).flush(API_USERS[FACULTY]);
      flushOrg(restoredHttp);

      expect(restored.isAuthenticated()).toBe(true);
      expect(restored.role()).toBe('faculty');
      expect(restored.assignedBatchIds()).toEqual(['103']);
      restoredHttp.verify();
    });

    it('re-reads the account on startup instead of trusting the stored permissions', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: 'stale-token',
          user: { ...API_USERS[SUPER_ADMIN], permissions: ['dashboard.view'] },
        }),
      );

      auth.restoreSession().subscribe();
      http.expectOne(`${API_BASE}/auth/me`).flush(API_USERS[SUPER_ADMIN]);
      flushOrg(http);

      expect(auth.has('users.manage')).toBe(true);
    });

    it('ends a restored session whose token the server rejects', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: 'expired', user: API_USERS[SUPER_ADMIN] }),
      );

      let result: unknown = 'unset';
      auth.restoreSession().subscribe((user) => (result = user));

      http.expectOne(`${API_BASE}/auth/me`).flush(
        {
          timestamp: '2026-09-13T09:32:09.844162Z',
          status: 401,
          error: 'Unauthorized',
          message: 'Sign in to continue.',
          path: '/api/auth/me',
          fieldErrors: [],
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(result).toBeNull();
      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('setSessionRole', () => {
    it('replaces the role and the assignments behind it', () => {
      signInWith(http, auth, SUPER_ADMIN);

      auth.setSessionRole('location-admin', ['MUM'], []);

      expect(auth.role()).toBe('location-admin');
      expect(auth.has('users.manage')).toBe(false);
      expect(auth.canAccessLocation('MUM')).toBe(true);
      expect(auth.canAccessLocation('KOC')).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears the session and the stored state', () => {
      signInWith(http, auth, LOCATION_ADMIN);

      auth.logout();
      // The stateless token is discarded client-side; the POST is a formality.
      http.match(`${API_BASE}/auth/logout`).forEach((request) => request.flush({ message: 'ok' }));

      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.employeeId()).toBeNull();
      expect(auth.assignedLocationIds()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('assignments', () => {
    it('asks scoped roles for assignments and all-scope roles for none', () => {
      const byId = new Map(ROLES.map((role) => [role.id, role]));

      expect(byId.get('superadmin')?.requiresLocations).toBe(false);
      expect(byId.get('program-manager')?.requiresLocations).toBe(false);
      expect(byId.get('location-admin')?.requiresLocations).toBe(true);
      expect(byId.get('location-admin')?.requiresBatches).toBe(false);
      expect(byId.get('faculty')?.requiresBatches).toBe(true);
    });

    it('serves the organisation tree narrowed to the assignment', () => {
      signInWith(http, auth, LOCATION_ADMIN);

      expect(auth.visibleLocations().map((location) => location.name)).toEqual(['Kochi']);
      expect(ORG_TREE.length).toBeGreaterThan(auth.visibleLocations().length);
    });
  });
});
