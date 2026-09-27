import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PERMISSIONS, scopeSummary } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { SIGN_IN, signInWith } from '../../testing/api-testing';
import { DashboardLayoutComponent } from './dashboard-layout';

const STORAGE_KEY = 'bizzskill_auth_state';

/** Route stub — the layout hosts a `router-outlet` and navigates on tab clicks. */
@Component({ selector: 'app-blank-page', template: '' })
class BlankPageComponent {}

const ROUTES = [
  { path: 'login', component: BlankPageComponent },
  { path: '**', component: BlankPageComponent },
];

/** The tabs every role may open — the five the administrative roles add to. */
const SHARED_TABS = ['Home', 'Assessments', 'Remedial', 'LAP', 'Reports'];

describe('DashboardLayoutComponent', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  /** Signs in through the real login endpoint, flushing the login and org tree. */
  function signIn(employeeId: string): void {
    signInWith(http, auth, employeeId);
  }

  function createFixture() {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tabLabels(fixture: ReturnType<typeof createFixture>): (string | undefined)[] {
    return Array.from(host(fixture).querySelectorAll('.tab-item .tab-label')).map((label) =>
      label.textContent?.trim(),
    );
  }

  function activeTab(fixture: ReturnType<typeof createFixture>): string | undefined {
    return host(fixture).querySelector('.tab-item.active .tab-label')?.textContent?.trim();
  }

  /** Opens the account menu behind the header profile button. */
  function openUserMenu(fixture: ReturnType<typeof createFixture>): void {
    host(fixture).querySelector<HTMLButtonElement>('.header-profile-btn')?.click();
    fixture.detectChanges();
  }

  /** Opens the permissions modal from the account menu. */
  function openPermissionsModal(fixture: ReturnType<typeof createFixture>): void {
    openUserMenu(fixture);
    host(fixture).querySelector<HTMLButtonElement>('.dropdown-item')?.click();
    fixture.detectChanges();
  }

  /** Flushes the best-effort logout POST the AuthService fires on sign-out. */
  function flushLogout(): void {
    http
      .match((request) => request.url.endsWith('/auth/logout'))
      .forEach((request) => request.flush({}));
  }

  describe('the navbar', () => {
    it('offers Super Admin every tab, User Management included', () => {
      signIn(SIGN_IN.superadmin);
      const fixture = createFixture();

      expect(tabLabels(fixture)).toEqual([...SHARED_TABS, 'User Management', 'Configuration']);
    });

    it('keeps User Management and Configuration away from a Program Manager', () => {
      signIn(SIGN_IN.programManager);

      expect(tabLabels(createFixture())).toEqual(SHARED_TABS);
    });

    it('groups the Super Admin tools at the right end, behind a divider', () => {
      signIn(SIGN_IN.superadmin);
      const fixture = createFixture();

      const children = Array.from(host(fixture).querySelector('.tabs-container')?.children ?? []);
      const dividerIndex = children.findIndex((child) => child.classList.contains('nav-divider'));

      // The divider separates the shared tabs from the admin group…
      expect(dividerIndex).toBe(SHARED_TABS.length);
      expect(dividerIndex).toBeGreaterThan(-1);
      // …and only the Super Admin tabs follow it.
      expect(children.slice(dividerIndex + 1).map((child) => child.textContent?.trim())).toEqual([
        'User Management',
        'Configuration',
      ]);
    });

    it('renders no divider for a role without Super Admin tools', () => {
      signIn(SIGN_IN.programManager);

      expect(host(createFixture()).querySelector('.nav-divider')).toBeNull();
    });

    it('keeps them away from a Location Admin, who still sees the four shared tabs', () => {
      signIn(SIGN_IN.locationAdmin);
      const fixture = createFixture();

      expect(tabLabels(fixture)).toEqual(SHARED_TABS);
      expect(host(fixture).querySelector('[href="/dashboard/user-management"]')).toBeNull();
    });

    it('keeps them away from Faculty', () => {
      signIn(SIGN_IN.faculty);

      expect(tabLabels(createFixture())).toEqual(SHARED_TABS);
    });

    it('shows the signed-in account in the header', () => {
      signIn(SIGN_IN.locationAdmin);
      const fixture = createFixture();

      expect(host(fixture).querySelector('.header-user-name')?.textContent?.trim()).toBe(
        'Kochi Location Admin',
      );
      expect(host(fixture).querySelector('.header-user-id')?.textContent?.trim()).toBe(
        SIGN_IN.locationAdmin,
      );
      expect(host(fixture).querySelector('.avatar-letter')?.textContent?.trim()).toBe('K');
    });

    it('marks the tab of the page you are on, and follows a tab click', async () => {
      signIn(SIGN_IN.superadmin);
      await TestBed.inject(Router).navigateByUrl('/dashboard/reports');
      const fixture = createFixture();

      expect(activeTab(fixture)).toBe('Reports');

      const userManagementTab = Array.from(
        host(fixture).querySelectorAll<HTMLButtonElement>('.tab-item'),
      ).find((tab) => tab.textContent?.includes('User Management')) as HTMLButtonElement;
      userManagementTab.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(activeTab(fixture)).toBe('User Management');
      expect(TestBed.inject(Router).url).toBe('/dashboard/user-management');
    });
  });

  describe('the permissions modal', () => {
    it('lists every permission for Super Admin, with no assigned access', () => {
      signIn(SIGN_IN.superadmin);
      const fixture = createFixture();
      openPermissionsModal(fixture);

      expect(host(fixture).querySelector('[role="dialog"]')).not.toBeNull();
      expect(host(fixture).querySelector('.role-badge')?.textContent?.trim()).toBe(
        'Role: Super Admin',
      );
      expect(host(fixture).querySelector('.status-indicator')?.textContent).toContain(
        'All permissions active',
      );
      expect(host(fixture).querySelectorAll('.permission-item').length).toBe(PERMISSIONS.length);
      expect(host(fixture).querySelector('.assigned-access')).toBeNull();
    });

    it('scopes Faculty to its batches and holds back the administrative permissions', () => {
      signIn(SIGN_IN.faculty);
      const fixture = createFixture();
      openPermissionsModal(fixture);

      const names = Array.from(host(fixture).querySelectorAll('.perm-name')).map((name) =>
        name.textContent?.trim(),
      );

      expect(host(fixture).querySelector('.role-badge')?.textContent?.trim()).toBe('Role: Faculty');
      expect(names).toEqual([
        'Dashboard',
        'View Assessments',
        'Record Assessment Results',
        'View LAP / Remedial',
        'Reports',
      ]);
      expect(names).not.toContain('Manage LAP / Remedial');
      expect(host(fixture).querySelector('.assigned-access-value')?.textContent?.trim()).toBe(
        scopeSummary('faculty', ['BLR'], ['103']),
      );
      expect(host(fixture).querySelector('.status-indicator')?.textContent).toContain(
        '5 permissions active',
      );
    });

    it('scopes a Location Admin to its locations, tracks and all', () => {
      signIn(SIGN_IN.locationAdmin);
      const fixture = createFixture();
      openPermissionsModal(fixture);

      const names = Array.from(host(fixture).querySelectorAll('.perm-name')).map((name) =>
        name.textContent?.trim(),
      );

      expect(host(fixture).querySelector('.assigned-access-value')?.textContent?.trim()).toBe(
        scopeSummary('location-admin', ['KOC'], []),
      );
      expect(names).toContain('Manage LAP / Remedial');
      expect(names).not.toContain('User Management');
      expect(names).not.toContain('Exam Configuration');
    });

    it('offers no assigned access to the all-location Program Manager', () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();
      openPermissionsModal(fixture);

      expect(host(fixture).querySelector('.role-badge')?.textContent?.trim()).toBe(
        'Role: Program Manager',
      );
      expect(host(fixture).querySelector('.assigned-access')).toBeNull();
      expect(host(fixture).querySelector('.status-indicator')?.textContent).toContain(
        `${PERMISSIONS.length - 2} permissions active`,
      );
    });

    it('closes on Escape and on a backdrop click', () => {
      signIn(SIGN_IN.superadmin);
      const fixture = createFixture();
      openPermissionsModal(fixture);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();

      openPermissionsModal(fixture);
      host(fixture).querySelector<HTMLElement>('.modal-backdrop')?.click();
      fixture.detectChanges();
      expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe('the account menu', () => {
    it('offers the permissions modal and sign-out', () => {
      signIn(SIGN_IN.faculty);
      const fixture = createFixture();
      openUserMenu(fixture);

      const items = Array.from(host(fixture).querySelectorAll('.dropdown-item')).map((item) =>
        item.textContent?.trim(),
      );

      expect(items).toEqual(['View Permissions', 'Logout']);
    });

    it('signs you out and returns to the login page', async () => {
      signIn(SIGN_IN.faculty);
      const fixture = createFixture();
      openUserMenu(fixture);

      host(fixture).querySelector<HTMLButtonElement>('.logout-item')?.click();
      fixture.detectChanges();
      flushLogout();
      await fixture.whenStable();

      expect(auth.isAuthenticated()).toBe(false);
      expect(host(fixture).querySelector('.user-dropdown-menu')).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/login');
    });
  });
});
