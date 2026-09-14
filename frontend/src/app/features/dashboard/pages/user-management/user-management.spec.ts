import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { roleLabel } from '../../../../core/models/user.model';
import type { ApiPortalUser } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { UserService } from '../../../../core/services/user.service';
import { ToastService } from '../../../../core/ui/toast.service';
import {
  API_BASE,
  API_PERMISSIONS,
  API_ROLES,
  API_USERS,
  SIGN_IN,
  signInWith,
} from '../../../../testing/api-testing';
import { UserManagementComponent } from './user-management';

const STORAGE_KEY = 'bizzskill_auth_state';

/**
 * The roster `GET /api/users` answers with: the five seeded accounts plus five
 * more, so the grid has enough rows to page, sort and filter.
 */
const ROSTER: readonly ApiPortalUser[] = [
  API_USERS[SIGN_IN.superadmin],
  API_USERS[SIGN_IN.programManager],
  API_USERS[SIGN_IN.locationAdmin],
  API_USERS[SIGN_IN.faculty],
  API_USERS[SIGN_IN.inactive],
  {
    employeeId: '41202',
    name: 'Meera Nair',
    email: 'meera.nair@tcs.com',
    role: 'location-admin',
    roleName: 'Location Admin',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['KOC'],
    status: 'active',
  },
  {
    employeeId: '42310',
    name: 'Gautham Iyer',
    email: 'gautham.iyer@tcs.com',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    locationIds: ['KOC'],
    batchIds: [101],
    status: 'active',
  },
  {
    employeeId: '43291',
    name: 'Ishita Sharma',
    email: 'ishita.sharma@tcs.com',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    locationIds: ['KOC'],
    batchIds: [101],
    status: 'inactive',
  },
  {
    employeeId: '50001',
    name: 'Vishnu Pillai',
    email: 'vishnu.pillai@tcs.com',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    locationIds: ['BLR'],
    batchIds: [103],
    status: 'active',
  },
  {
    employeeId: '50002',
    name: 'Zoya Khan',
    email: 'zoya.khan@tcs.com',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    locationIds: ['TRV'],
    batchIds: [102],
    status: 'active',
  },
];

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('UserManagementComponent', () => {
  let users: UserService;
  let auth: AuthService;
  let http: HttpTestingController;

  type Fixture = ComponentFixture<UserManagementComponent>;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    users = TestBed.inject(UserService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    // The screen is Super-Admin gated, and the signed-in account drives the
    // self tag, the delete lock and the role lock.
    signInWith(http, auth, SIGN_IN.superadmin);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  /** Flushes the roster, role matrix and permission list `loadAll()` asks for. */
  function flushLoadAll(roster: readonly ApiPortalUser[] = ROSTER): void {
    http.expectOne(`${API_BASE}/users`).flush(roster);
    http.expectOne(`${API_BASE}/users/roles`).flush(API_ROLES);
    http.expectOne(`${API_BASE}/users/permissions`).flush(API_PERMISSIONS);
  }

  function createFixture(): Fixture {
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();
    flushLoadAll();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: Fixture): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The rows of the grid, in render order. */
  function rows(fixture: Fixture): HTMLTableRowElement[] {
    return Array.from(host(fixture).querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  /** The name cell of every rendered row. */
  function rowNames(fixture: Fixture): (string | undefined)[] {
    return rows(fixture).map((row) => row.querySelector('.td-name span')?.textContent?.trim());
  }

  /** The row of the account with this employee id. */
  function rowFor(fixture: Fixture, employeeId: string): HTMLTableRowElement {
    return rows(fixture).find(
      (row) => row.querySelector('.td-empid')?.textContent?.trim() === employeeId,
    ) as HTMLTableRowElement;
  }

  function summary(fixture: Fixture): string {
    return host(fixture).querySelector('.table-summary')?.textContent?.trim() ?? '';
  }

  function searchField(fixture: Fixture): HTMLInputElement {
    return host(fixture).querySelector<HTMLInputElement>('.search-input') as HTMLInputElement;
  }

  function typeSearch(fixture: Fixture, value: string): void {
    const input = searchField(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function editDialog(fixture: Fixture): HTMLElement | null {
    return host(fixture).querySelector('app-user-edit-dialog');
  }

  function deleteDialog(fixture: Fixture): HTMLElement | null {
    return host(fixture).querySelector('[role="alertdialog"]');
  }

  /** Opens the add dialog. */
  function openAddDialog(fixture: Fixture): void {
    host(fixture).querySelector<HTMLButtonElement>('.btn-add')?.click();
    fixture.detectChanges();
  }

  /** Picks the option with the given label from the nth select of the toolbar. */
  async function chooseFilter(fixture: Fixture, index: number, label: string): Promise<void> {
    host(fixture).querySelectorAll<HTMLElement>('app-select')[index].click();
    await flushOverlay();
    fixture.detectChanges();

    const option = Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    option?.click();
    await flushOverlay();
    fixture.detectChanges();
  }

  /** Flushes the `POST /api/users` the created account is written through. */
  function flushCreate(user: ApiPortalUser, temporaryPassword: string | null): void {
    const request = http.expectOne({ method: 'POST', url: `${API_BASE}/users` });
    request.flush({ user, temporaryPassword });
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  describe('the roster', () => {
    it('renders a row per account, with its role, access and status', () => {
      const fixture = createFixture();
      const first = rows(fixture)[0];

      expect(host(fixture).querySelector('.page-title')?.textContent?.trim()).toBe(
        'User Management',
      );
      expect(rows(fixture).length).toBe(users.users().length);
      expect(first.querySelector('.td-empid')?.textContent?.trim()).toBe('10294');
      expect(first.querySelector('.td-role')?.textContent?.trim()).toBe(roleLabel('superadmin'));
      expect(first.querySelector('.td-status')?.textContent?.trim()).toBe('active');
      expect(first.querySelector('[aria-label="Edit System Administrator"]')).not.toBeNull();
    });

    it('reports the page range and disables paging while a single page holds the roster', () => {
      const fixture = createFixture();

      expect(summary(fixture)).toBe(`Showing 1–10 of ${users.users().length} users`);
      expect(
        host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
      ).toBe(true);
    });

    it('sorts by a column, descending on a second click', () => {
      const fixture = createFixture();

      host(fixture).querySelector<HTMLButtonElement>('[data-column="name"] .th-sort')?.click();
      fixture.detectChanges();

      expect(host(fixture).querySelector('[data-column="name"]')?.getAttribute('aria-sort')).toBe(
        'ascending',
      );
      expect(rowNames(fixture)[0]).toBe('Divya Sharma');

      host(fixture).querySelector<HTMLButtonElement>('[data-column="name"] .th-sort')?.click();
      fixture.detectChanges();

      expect(host(fixture).querySelector('[data-column="name"]')?.getAttribute('aria-sort')).toBe(
        'descending',
      );
      expect(rowNames(fixture)[0]).toBe('Zoya Khan');
    });

    it('pages through a roster that outgrows the page size', () => {
      const fixture = createFixture();
      users
        .createUser({
          employeeId: '90001',
          name: 'Nadia Fernandes',
          email: 'nadia.fernandes@tcs.com',
          role: 'faculty',
          locationIds: ['BLR'],
          batchIds: ['103'],
          status: 'active',
        })
        .subscribe();
      flushCreate(
        {
          employeeId: '90001',
          name: 'Nadia Fernandes',
          email: 'nadia.fernandes@tcs.com',
          role: 'faculty',
          roleName: 'Faculty',
          scope: 'assigned-batches',
          requiresLocations: true,
          requiresBatches: true,
          locationIds: ['BLR'],
          batchIds: [103],
          status: 'active',
        },
        null,
      );
      fixture.detectChanges();

      expect(summary(fixture)).toBe('Showing 1–10 of 11 users');

      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
      fixture.detectChanges();

      expect(summary(fixture)).toBe('Showing 11–11 of 11 users');
      expect(rowNames(fixture)).toEqual(['Nadia Fernandes']);

      host(fixture).querySelector<HTMLButtonElement>('[aria-label="First page"]')?.click();
      fixture.detectChanges();

      expect(summary(fixture)).toBe('Showing 1–10 of 11 users');
    });
  });

  describe('the toolbar', () => {
    it('searches by name, employee id and email', () => {
      const fixture = createFixture();

      typeSearch(fixture, 'meera');
      expect(rowNames(fixture)).toEqual(['Meera Nair']);

      typeSearch(fixture, '42310');
      expect(rowNames(fixture)).toEqual(['Gautham Iyer']);

      typeSearch(fixture, 'ishita.sharma@tcs.com');
      expect(rowNames(fixture)).toEqual(['Ishita Sharma']);
    });

    it('shows an empty state — and a clear button — when nothing matches', () => {
      const fixture = createFixture();
      typeSearch(fixture, 'nobody');

      expect(rows(fixture)).toEqual([]);
      expect(host(fixture).querySelector('.empty-state-title')?.textContent?.trim()).toBe(
        'No users found',
      );

      host(fixture).querySelector<HTMLButtonElement>('.search-clear')?.click();
      fixture.detectChanges();

      expect(searchField(fixture).value).toBe('');
      expect(rows(fixture).length).toBe(users.users().length);
      expect(host(fixture).querySelector('.search-clear')).toBeNull();
    });

    it('filters by role', async () => {
      const fixture = createFixture();
      // Three Location Admins are on the roster — the inactive one included,
      // since the role filter on its own does not look at status.
      const expected = users
        .users()
        .filter((user) => user.role === 'location-admin')
        .map((user) => user.name);

      await chooseFilter(fixture, 0, roleLabel('location-admin'));

      expect(expected.length).toBe(3);
      expect(rowNames(fixture)).toEqual(expected);
    });

    it('filters by status and by role at once', async () => {
      const fixture = createFixture();

      await chooseFilter(fixture, 1, 'Inactive');
      expect(rowNames(fixture)).toEqual(['Sneha Kapoor', 'Ishita Sharma']);

      await chooseFilter(fixture, 0, roleLabel('faculty'));
      expect(rowNames(fixture)).toEqual(['Ishita Sharma']);
    });
  });

  describe('adding an account', () => {
    /** Fills the identity fields of the open dialog. */
    function fillIdentity(fixture: Fixture, employeeId: string, name: string, email: string): void {
      const fields = Array.from(
        editDialog(fixture)?.querySelectorAll<HTMLInputElement>('.text-input') ?? [],
      );
      // Employee ID, Name and Email, in that order.
      [employeeId, name, email].forEach((value, index) => {
        fields[index].value = value;
        fields[index].dispatchEvent(new Event('input'));
      });
      fixture.detectChanges();
    }

    /** Ticks the first checkbox of a picker of the open dialog. */
    function tickFirst(fixture: Fixture, groupLabel: string): void {
      const group = editDialog(fixture)?.querySelector<HTMLElement>(`[aria-label="${groupLabel}"]`);
      group?.querySelector<HTMLInputElement>('input')?.click();
      fixture.detectChanges();
    }

    function saveButton(fixture: Fixture): HTMLButtonElement {
      return editDialog(fixture)?.querySelector<HTMLButtonElement>(
        '.btn-primary',
      ) as HTMLButtonElement;
    }

    it('creates the account the dialog describes', () => {
      const fixture = createFixture();
      const before = users.users().length;
      openAddDialog(fixture);

      expect(editDialog(fixture)).not.toBeNull();
      // A new account starts on the least access there is, which still needs
      // a location and a batch before it can be saved.
      expect(editDialog(fixture)?.textContent).toContain(roleLabel('faculty'));
      expect(saveButton(fixture).disabled).toBe(true);

      fillIdentity(fixture, '90002', 'Ananya Rao', 'ananya.rao@tcs.com');
      tickFirst(fixture, 'Assigned locations');
      tickFirst(fixture, 'Assigned batches');

      expect(saveButton(fixture).disabled).toBe(false);
      saveButton(fixture).click();
      fixture.detectChanges();

      const request = http.expectOne({ method: 'POST', url: `${API_BASE}/users` });
      expect(request.request.body).toEqual({
        employeeId: '90002',
        name: 'Ananya Rao',
        email: 'ananya.rao@tcs.com',
        role: 'faculty',
        locationIds: ['BLR'],
        batchIds: ['103'],
        status: 'active',
      });
      request.flush({
        user: {
          employeeId: '90002',
          name: 'Ananya Rao',
          email: 'ananya.rao@tcs.com',
          role: 'faculty',
          roleName: 'Faculty',
          scope: 'assigned-batches',
          requiresLocations: true,
          requiresBatches: true,
          locationIds: ['BLR'],
          batchIds: [103],
          status: 'active',
        },
        temporaryPassword: 'Temp-90002',
      });
      fixture.detectChanges();

      expect(editDialog(fixture)).toBeNull();
      expect(users.users().length).toBe(before + 1);
      const created = users.getUser('90002');
      expect(created?.name).toBe('Ananya Rao');
      expect(created?.role).toBe('faculty');
      expect(created?.locationIds).toEqual(['BLR']);
      expect(created?.batchIds).toEqual(['103']);

      // The generated password is shown once, in the status notice.
      const notice = host(fixture).querySelector('.inline-notice[role="status"]');
      expect(notice?.textContent).toContain('Temporary password');
      expect(notice?.textContent).toContain('Temp-90002');
      expect(toastMessages()).toContain('Account created');
    });

    it('does not confirm an account the API rejected', () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '90006', 'Ananya Rao', 'ananya.rao@tcs.com');
      tickFirst(fixture, 'Assigned locations');
      tickFirst(fixture, 'Assigned batches');

      saveButton(fixture).click();
      fixture.detectChanges();

      http
        .expectOne({ method: 'POST', url: `${API_BASE}/users` })
        .flush(
          { status: 409, message: 'An account with that employee id already exists.' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();

      expect(users.getUser('90006')).toBeUndefined();
      expect(toastMessages().filter((message) => message === 'Account created')).toEqual([]);
    });

    it('refuses an employee id that already has an account', () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '10294', 'Someone Else', 'someone.else@tcs.com');

      expect(editDialog(fixture)?.querySelector('.field-error')?.textContent).toContain(
        'already has an account',
      );
      expect(saveButton(fixture).disabled).toBe(true);
    });

    it('refuses an invalid email address', () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '90004', 'Ananya Rao', 'not-an-email');

      expect(editDialog(fixture)?.textContent).toContain('Enter a valid email address');
      expect(saveButton(fixture).disabled).toBe(true);
    });

    it('leaves the roster alone when the dialog is cancelled', () => {
      const fixture = createFixture();
      const before = users.users().length;
      openAddDialog(fixture);
      fillIdentity(fixture, '90003', 'Ananya Rao', 'ananya.rao@tcs.com');

      editDialog(fixture)?.querySelector<HTMLButtonElement>('.btn-secondary')?.click();
      fixture.detectChanges();

      expect(editDialog(fixture)).toBeNull();
      expect(users.users().length).toBe(before);
      expect(users.getUser('90003')).toBeUndefined();
    });

    it('closes on Escape', () => {
      const fixture = createFixture();
      openAddDialog(fixture);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(editDialog(fixture)).toBeNull();
    });
  });

  describe('your own account', () => {
    it('marks your row and refuses to remove it', () => {
      const fixture = createFixture();
      const own = rowFor(fixture, SIGN_IN.superadmin);

      expect(own.querySelector('.self-tag')?.textContent?.trim()).toBe('You');
      const remove = own.querySelector<HTMLButtonElement>(
        '.row-action--danger',
      ) as HTMLButtonElement;
      expect(remove.disabled).toBe(true);

      remove.click();
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(users.getUser(SIGN_IN.superadmin)).toBeDefined();
    });

    it('locks the role while the rest of the account stays editable', () => {
      const fixture = createFixture();

      rowFor(fixture, SIGN_IN.superadmin)
        .querySelector<HTMLButtonElement>('[aria-label="Edit System Administrator"]')
        ?.click();
      fixture.detectChanges();

      expect(editDialog(fixture)?.textContent).toContain(
        'You cannot change the role of your own account.',
      );

      const nameField = Array.from(
        editDialog(fixture)?.querySelectorAll<HTMLInputElement>('.text-input') ?? [],
      )[1];
      nameField.value = 'System Administrator-Adams';
      nameField.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      editDialog(fixture)?.querySelector<HTMLButtonElement>('.btn-primary')?.click();
      fixture.detectChanges();

      const request = http.expectOne({
        method: 'PATCH',
        url: `${API_BASE}/users/${SIGN_IN.superadmin}`,
      });
      // The locked role is kept, whatever the dialog sends.
      expect(request.request.body).toMatchObject({
        employeeId: SIGN_IN.superadmin,
        name: 'System Administrator-Adams',
        role: 'superadmin',
      });
      request.flush({
        ...API_USERS[SIGN_IN.superadmin],
        name: 'System Administrator-Adams',
      });
      fixture.detectChanges();

      const edited = users.getUser(SIGN_IN.superadmin);
      expect(edited?.name).toBe('System Administrator-Adams');
      expect(edited?.role).toBe('superadmin');
      expect(toastMessages()).toContain('Account updated');
    });
  });

  describe('deleting an account', () => {
    /** Opens the confirmation for the account with this employee id. */
    function requestDelete(fixture: Fixture, employeeId: string): void {
      rowFor(fixture, employeeId).querySelector<HTMLButtonElement>('.row-action--danger')?.click();
      fixture.detectChanges();
    }

    it('asks first, and keeps the account when the question is dismissed', () => {
      const fixture = createFixture();
      const before = users.users().length;
      requestDelete(fixture, '43291');

      expect(deleteDialog(fixture)?.textContent).toContain('Ishita Sharma');
      expect(deleteDialog(fixture)?.textContent).toContain('43291');

      host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(users.getUser('43291')).toBeDefined();
      expect(users.users().length).toBe(before);
    });

    it('removes the account once confirmed', () => {
      const fixture = createFixture();
      const before = users.users().length;
      requestDelete(fixture, '43291');

      host(fixture).querySelector<HTMLButtonElement>('.btn-danger')?.click();
      fixture.detectChanges();

      http
        .expectOne({ method: 'DELETE', url: `${API_BASE}/users/43291` })
        .flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(users.getUser('43291')).toBeUndefined();
      expect(users.users().length).toBe(before - 1);
      expect(rowFor(fixture, '43291')).toBeUndefined();
      expect(toastMessages()).toContain('Account for Ishita Sharma deleted');
    });

    it('closes the confirmation on Escape', () => {
      const fixture = createFixture();
      requestDelete(fixture, '43291');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(users.getUser('43291')).toBeDefined();
    });
  });
});
