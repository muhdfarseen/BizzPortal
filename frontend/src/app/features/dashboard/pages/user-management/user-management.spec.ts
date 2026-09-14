import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { roleLabel } from '../../../../core/models/user.model';
import type { ApiPortalUser } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/ui/toast.service';
import {
  API_BASE,
  API_PERMISSIONS,
  API_ROLES,
  API_USERS,
  SIGN_IN,
  pageOf,
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

/** Enough accounts to push the roster past one page of 25. */
function extraUsers(count: number): ApiPortalUser[] {
  return Array.from({ length: count }, (_, index) => ({
    employeeId: String(70000 + index),
    name: `Extra User ${index + 1}`,
    email: `extra.user.${index + 1}@tcs.com`,
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    locationIds: ['BLR'],
    batchIds: [103],
    status: 'active',
  }));
}

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('UserManagementComponent', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  type Fixture = ComponentFixture<UserManagementComponent>;

  /** The accounts the page's queries are answered from, mutated by the CRUD calls. */
  let server: ApiPortalUser[];

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    server = ROSTER.map((user) => ({ ...user }));
    // The screen is Super-Admin gated, and the signed-in account drives the
    // self tag, the delete lock and the role lock.
    signInWith(http, auth, SIGN_IN.superadmin);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  /** The accounts a query selects, as the API would select them. */
  function matching(params: URLSearchParams): ApiPortalUser[] {
    const search = (params.get('search') ?? '').toLowerCase();
    const role = params.get('role');
    const status = params.get('status');
    const rows = server.filter(
      (user) =>
        (role === null || user.role === role) &&
        (status === null || user.status === status) &&
        (search === '' ||
          user.name.toLowerCase().includes(search) ||
          user.employeeId.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search)),
    );

    const sort = params.get('sort') as 'name' | 'employeeId' | 'email' | null;
    if (!sort) {
      return rows;
    }
    const factor = params.get('direction') === 'desc' ? -1 : 1;
    return [...rows].sort(
      (first, second) => factor * String(first[sort]).localeCompare(String(second[sort])),
    );
  }

  /** Answers the pending page request from {@link server} and returns its query. */
  function flushPage(fixture: Fixture): URLSearchParams {
    const request = http.expectOne((candidate) => candidate.url === `${API_BASE}/users`);
    const params = new URLSearchParams(request.request.params.toString());
    const page = Number(params.get('page') ?? '0');
    const size = Number(params.get('size') ?? '25');
    const rows = matching(params);
    request.flush(
      pageOf(rows.slice(page * size, page * size + size), {
        page,
        size,
        totalElements: rows.length,
      }),
    );
    fixture.detectChanges();
    return params;
  }

  /** Flushes the role matrix and permission list `loadAll()` asks for. */
  function flushReference(): void {
    http.expectOne(`${API_BASE}/users/roles`).flush(API_ROLES);
    http.expectOne(`${API_BASE}/users/permissions`).flush(API_PERMISSIONS);
  }

  function createFixture(): Fixture {
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();
    flushReference();
    flushPage(fixture);
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
  function rowFor(fixture: Fixture, employeeId: string): HTMLTableRowElement | undefined {
    return rows(fixture).find(
      (row) => row.querySelector('.td-empid')?.textContent?.trim() === employeeId,
    );
  }

  /** The account in the simulated server, or `undefined` when there is none. */
  function serverUser(employeeId: string): ApiPortalUser | undefined {
    return server.find((user) => user.employeeId === employeeId);
  }

  function summary(fixture: Fixture): string {
    return host(fixture).querySelector('.table-summary')?.textContent?.trim() ?? '';
  }

  function searchField(fixture: Fixture): HTMLInputElement {
    return host(fixture).querySelector<HTMLInputElement>('.search-input') as HTMLInputElement;
  }

  /** Types a term and lets the debounce elapse, then answers the page it asks for. */
  function typeSearch(fixture: Fixture, value: string): void {
    vi.useFakeTimers();
    const input = searchField(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    vi.useRealTimers();

    flushPage(fixture);
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

  /** Opens the confirmation for the account with this employee id. */
  function requestDelete(fixture: Fixture, employeeId: string): void {
    rowFor(fixture, employeeId)?.querySelector<HTMLButtonElement>('.row-action--danger')?.click();
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
    flushPage(fixture);
  }

  /** Flushes the `POST /api/users` the created account is written through. */
  function flushCreate(
    fixture: Fixture,
    user: ApiPortalUser,
    temporaryPassword: string | null,
  ): void {
    const request = http.expectOne({ method: 'POST', url: `${API_BASE}/users` });
    request.flush({ user, temporaryPassword });
    server.push(user);
    fixture.detectChanges();
    // A new account may not be on the page on screen, so the roster is re-read
    // from its first page.
    flushPage(fixture);
  }

  /** Flushes the `PATCH /api/users/:id` an edit is written through. */
  function flushUpdate(fixture: Fixture, updated: ApiPortalUser): void {
    const request = http.expectOne({
      method: 'PATCH',
      url: `${API_BASE}/users/${updated.employeeId}`,
    });
    request.flush(updated);
    server = server.map((user) => (user.employeeId === updated.employeeId ? updated : user));
    fixture.detectChanges();
    flushPage(fixture);
  }

  /** Flushes the `DELETE /api/users/:id` a confirmed removal is written through. */
  function flushDelete(fixture: Fixture, employeeId: string): void {
    http
      .expectOne({ method: 'DELETE', url: `${API_BASE}/users/${employeeId}` })
      .flush(null, { status: 204, statusText: 'No Content' });
    server = server.filter((user) => user.employeeId !== employeeId);
    fixture.detectChanges();
    flushPage(fixture);
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
      expect(rows(fixture).length).toBe(server.length);
      expect(first.querySelector('.td-empid')?.textContent?.trim()).toBe('10294');
      expect(first.querySelector('.td-role')?.textContent?.trim()).toBe(roleLabel('superadmin'));
      expect(first.querySelector('.td-status')?.textContent?.trim()).toBe('active');
      expect(first.querySelector('[aria-label="Edit System Administrator"]')).not.toBeNull();
    });

    it('reports the page range from the server total and disables paging on one page', () => {
      const fixture = createFixture();

      expect(summary(fixture)).toBe(`Showing 1–10 of ${server.length} users`);
      expect(
        host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
      ).toBe(true);
    });

    it('asks the server to sort by a column, descending on a second click', () => {
      const fixture = createFixture();

      host(fixture).querySelector<HTMLButtonElement>('[data-column="name"] .th-sort')?.click();
      fixture.detectChanges();
      expect(flushPage(fixture).get('sort')).toBe('name');

      expect(host(fixture).querySelector('[data-column="name"]')?.getAttribute('aria-sort')).toBe(
        'ascending',
      );
      expect(rowNames(fixture)[0]).toBe('Divya Sharma');

      host(fixture).querySelector<HTMLButtonElement>('[data-column="name"] .th-sort')?.click();
      fixture.detectChanges();
      flushPage(fixture);

      expect(host(fixture).querySelector('[data-column="name"]')?.getAttribute('aria-sort')).toBe(
        'descending',
      );
      expect(rowNames(fixture)[0]).toBe('Zoya Khan');
    });

    it('sends the direction with the sort key', () => {
      const fixture = createFixture();

      host(fixture).querySelector<HTMLButtonElement>('[data-column="email"] .th-sort')?.click();
      fixture.detectChanges();

      const params = flushPage(fixture);
      expect(params.get('sort')).toBe('email');
      expect(params.get('direction')).toBe('asc');
    });

    it('pages through a roster that outgrows the page size', () => {
      server = [...ROSTER, ...extraUsers(20)];
      const fixture = createFixture();

      expect(summary(fixture)).toBe('Showing 1–25 of 30 users');
      expect(rows(fixture).length).toBe(25);

      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
      fixture.detectChanges();
      expect(flushPage(fixture).get('page')).toBe('1');

      expect(summary(fixture)).toBe('Showing 26–30 of 30 users');
      expect(rows(fixture).length).toBe(5);

      host(fixture).querySelector<HTMLButtonElement>('[aria-label="First page"]')?.click();
      fixture.detectChanges();
      flushPage(fixture);

      expect(summary(fixture)).toBe('Showing 1–25 of 30 users');
    });

    it('marks the grid busy while a page is in flight', () => {
      server = [...ROSTER, ...extraUsers(20)];
      const fixture = createFixture();

      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
      fixture.detectChanges();

      expect(host(fixture).querySelector('.table-card')?.getAttribute('aria-busy')).toBe('true');
      expect(
        host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
      ).toBe(true);

      flushPage(fixture);

      expect(host(fixture).querySelector('.table-card')?.getAttribute('aria-busy')).toBe('false');
    });
  });

  describe('the toolbar', () => {
    it('searches by name, employee id and email on the server', () => {
      const fixture = createFixture();

      typeSearch(fixture, 'meera');
      expect(rowNames(fixture)).toEqual(['Meera Nair']);

      typeSearch(fixture, '42310');
      expect(rowNames(fixture)).toEqual(['Gautham Iyer']);

      typeSearch(fixture, 'ishita.sharma@tcs.com');
      expect(rowNames(fixture)).toEqual(['Ishita Sharma']);
    });

    it('sends one debounced search, with the finished term', () => {
      vi.useFakeTimers();
      const fixture = createFixture();

      const input = searchField(fixture);
      for (const value of ['i', 'ish', 'ishit']) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      }

      // Still typing: the roster has not been asked for anything new.
      expect(http.match(`${API_BASE}/users`).length).toBe(0);

      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      vi.useRealTimers();

      const request = http.expectOne((candidate) => candidate.url === `${API_BASE}/users`);
      expect(request.request.params.get('search')).toBe('ishit');
      expect(request.request.params.get('page')).toBe('0');
      const rows = matching(new URLSearchParams(request.request.params.toString()));
      request.flush(pageOf(rows, { page: 0, size: 25, totalElements: rows.length }));
      fixture.detectChanges();

      expect(rowNames(fixture)).toEqual(['Ishita Sharma']);
    });

    it('keeps the empty state and the clear button working when nothing matches', () => {
      const fixture = createFixture();
      typeSearch(fixture, 'nobody');

      expect(rows(fixture)).toEqual([]);
      expect(host(fixture).querySelector('.empty-state-title')?.textContent?.trim()).toBe(
        'No users found',
      );

      host(fixture).querySelector<HTMLButtonElement>('.search-clear')?.click();
      fixture.detectChanges();
      flushPage(fixture);

      expect(searchField(fixture).value).toBe('');
      expect(rows(fixture).length).toBe(server.length);
      expect(host(fixture).querySelector('.search-clear')).toBeNull();
    });

    it('says there are no accounts at all when the roster is empty', () => {
      server = [];
      const fixture = createFixture();

      expect(host(fixture).querySelector('.empty-state-title')?.textContent?.trim()).toBe(
        'No user accounts yet',
      );
      // Nothing to search or filter, so the toolbar stays away.
      expect(host(fixture).querySelector('.search-input')).toBeNull();
    });

    it('says the filters found nothing, and keeps the toolbar, when a search matches nobody', () => {
      const fixture = createFixture();
      typeSearch(fixture, 'nobody');

      expect(host(fixture).querySelector('.search-input')).not.toBeNull();
      expect(host(fixture).querySelector('.empty-state-title')?.textContent?.trim()).toBe(
        'No users found',
      );
    });

    it('filters by role on the server', async () => {
      const fixture = createFixture();
      // Three Location Admins are on the roster — the inactive one included,
      // since the role filter on its own does not look at status.
      const expected = server
        .filter((user) => user.role === 'location-admin')
        .map((user) => user.name);

      await chooseFilter(fixture, 0, roleLabel('location-admin'));

      expect(expected.length).toBe(3);
      expect(rowNames(fixture)).toEqual(expected);
    });

    it('filters by status and by role at once on the server', async () => {
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

    /**
     * Opens one of the dialog's pickers and ticks its first option — the
     * first location, then the first batch of that location. The panel is
     * portaled to the document, so the option is found there, and the picker
     * is closed again so the next one starts from a clean overlay.
     */
    async function tickFirst(fixture: Fixture, fieldLabel: string): Promise<void> {
      const trigger = editDialog(fixture)?.querySelector<HTMLButtonElement>(
        `button[aria-label^="${fieldLabel}"]`,
      );
      trigger?.click();
      await flushOverlay();
      fixture.detectChanges();

      document
        .querySelector<HTMLElement>('.multi-select-panel')
        ?.querySelector<HTMLInputElement>('.panel-option input')
        ?.click();
      await flushOverlay();
      fixture.detectChanges();

      trigger?.click();
      await flushOverlay();
      fixture.detectChanges();
    }

    function saveButton(fixture: Fixture): HTMLButtonElement {
      return editDialog(fixture)?.querySelector<HTMLButtonElement>(
        '.btn-primary',
      ) as HTMLButtonElement;
    }

    it('creates the account the dialog describes', async () => {
      const fixture = createFixture();
      openAddDialog(fixture);

      expect(editDialog(fixture)).not.toBeNull();
      // A new account starts on the least access there is, which still needs
      // a location and a batch before it can be saved.
      expect(editDialog(fixture)?.textContent).toContain(roleLabel('faculty'));
      expect(saveButton(fixture).disabled).toBe(true);

      fillIdentity(fixture, '90002', 'Ananya Rao', 'ananya.rao@tcs.com');
      await tickFirst(fixture, 'Assigned locations');
      await tickFirst(fixture, 'Assigned batches');

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
      server.push({
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
      });
      fixture.detectChanges();
      flushPage(fixture);

      expect(editDialog(fixture)).toBeNull();
      expect(serverUser('90002')?.name).toBe('Ananya Rao');
      const created = rowFor(fixture, '90002');
      expect(created?.querySelector('.td-name span')?.textContent?.trim()).toBe('Ananya Rao');
      expect(created?.querySelector('.td-role')?.textContent?.trim()).toBe('Faculty');

      // The generated password is shown once, in the status notice.
      const notice = host(fixture).querySelector('.inline-notice[role="status"]');
      expect(notice?.textContent).toContain('Temporary password');
      expect(notice?.textContent).toContain('Temp-90002');
      expect(toastMessages()).toContain('Account created');
    });

    it('does not confirm an account the API rejected', async () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '90006', 'Ananya Rao', 'ananya.rao@tcs.com');
      await tickFirst(fixture, 'Assigned locations');
      await tickFirst(fixture, 'Assigned batches');

      saveButton(fixture).click();
      fixture.detectChanges();

      http
        .expectOne({ method: 'POST', url: `${API_BASE}/users` })
        .flush(
          { status: 409, message: 'An account with that employee id already exists.' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();

      expect(serverUser('90006')).toBeUndefined();
      expect(toastMessages().filter((message) => message === 'Account created')).toEqual([]);
      expect(host(fixture).querySelector('.inline-notice--error')?.textContent).toContain(
        'already exists',
      );
    });

    it('lets the API refuse a duplicate employee id, now that the roster is paged', async () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '10294', 'Someone Else', 'someone.else@tcs.com');
      await tickFirst(fixture, 'Assigned locations');
      await tickFirst(fixture, 'Assigned batches');

      // The duplicate may sit on another page, so the screen no longer guesses:
      // the server's 409 is what refuses it.
      saveButton(fixture).click();
      fixture.detectChanges();

      http.expectOne({ method: 'POST', url: `${API_BASE}/users` }).flush(
        {
          status: 409,
          message: 'An account with that employee id already exists.',
          fieldErrors: [{ field: 'employeeId', message: 'That employee id is already in use.' }],
        },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      expect(serverUser('10294')?.name).toBe('System Administrator');
      expect(toastMessages().filter((message) => message === 'Account created')).toEqual([]);
      expect(host(fixture).querySelector('.inline-notice--error')?.textContent).toContain(
        'already exists',
      );
    });

    it('refuses an invalid email address before calling the API', () => {
      const fixture = createFixture();
      openAddDialog(fixture);
      fillIdentity(fixture, '90004', 'Ananya Rao', 'not-an-email');

      expect(editDialog(fixture)?.textContent).toContain('Enter a valid email address');
      expect(saveButton(fixture).disabled).toBe(true);
      http.expectNone({ method: 'POST', url: `${API_BASE}/users` });
    });

    it('leaves the roster alone when the dialog is cancelled', () => {
      const fixture = createFixture();
      const before = server.length;
      openAddDialog(fixture);
      fillIdentity(fixture, '90003', 'Ananya Rao', 'ananya.rao@tcs.com');

      editDialog(fixture)?.querySelector<HTMLButtonElement>('.btn-secondary')?.click();
      fixture.detectChanges();

      expect(editDialog(fixture)).toBeNull();
      expect(server.length).toBe(before);
      expect(serverUser('90003')).toBeUndefined();
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
      const own = rowFor(fixture, SIGN_IN.superadmin) as HTMLTableRowElement;

      expect(own.querySelector('.self-tag')?.textContent?.trim()).toBe('You');
      const remove = own.querySelector<HTMLButtonElement>(
        '.row-action--danger',
      ) as HTMLButtonElement;
      expect(remove.disabled).toBe(true);

      remove.click();
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(serverUser(SIGN_IN.superadmin)).toBeDefined();
    });

    it('locks the role while the rest of the account stays editable', () => {
      const fixture = createFixture();

      rowFor(fixture, SIGN_IN.superadmin)
        ?.querySelector<HTMLButtonElement>('[aria-label="Edit System Administrator"]')
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
      server = server.map((user) =>
        user.employeeId === SIGN_IN.superadmin
          ? { ...user, name: 'System Administrator-Adams' }
          : user,
      );
      fixture.detectChanges();
      flushPage(fixture);

      expect(serverUser(SIGN_IN.superadmin)?.name).toBe('System Administrator-Adams');
      expect(serverUser(SIGN_IN.superadmin)?.role).toBe('superadmin');
      expect(
        rowFor(fixture, SIGN_IN.superadmin)?.querySelector('.td-name span')?.textContent?.trim(),
      ).toBe('System Administrator-Adams');
      expect(toastMessages()).toContain('Account updated');
    });
  });

  describe('deleting an account', () => {
    it('asks first, and keeps the account when the question is dismissed', () => {
      const fixture = createFixture();
      const before = server.length;
      requestDelete(fixture, '43291');

      expect(deleteDialog(fixture)?.textContent).toContain('Ishita Sharma');
      expect(deleteDialog(fixture)?.textContent).toContain('43291');

      host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(serverUser('43291')).toBeDefined();
      expect(server.length).toBe(before);
    });

    it('removes the account once confirmed', () => {
      const fixture = createFixture();
      const before = server.length;
      requestDelete(fixture, '43291');

      host(fixture).querySelector<HTMLButtonElement>('.btn-danger')?.click();
      fixture.detectChanges();

      flushDelete(fixture, '43291');

      expect(deleteDialog(fixture)).toBeNull();
      expect(serverUser('43291')).toBeUndefined();
      expect(server.length).toBe(before - 1);
      expect(rowFor(fixture, '43291')).toBeUndefined();
      expect(toastMessages()).toContain('Account for Ishita Sharma deleted');
    });

    it('closes the confirmation on Escape', () => {
      const fixture = createFixture();
      requestDelete(fixture, '43291');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(deleteDialog(fixture)).toBeNull();
      expect(serverUser('43291')).toBeDefined();
    });
  });
});
