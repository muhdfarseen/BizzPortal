import { Component, DestroyRef, computed, inject, linkedSignal, signal } from '@angular/core';
import {
  ColumnDef,
  Header,
  createPaginatedRowModel,
  createSortedRowModel,
  injectTable,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
} from '@tanstack/angular-table';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconAnglesLeft,
  reiconAnglesRight,
  reiconChevronLeft,
  reiconChevronRight,
  reiconCloseCircle,
  reiconSearchNormal,
  reiconSearchNormal2,
  reiconSort,
  reiconSortAsc,
  reiconSortDesc,
  reiconTrash,
  reiconUserAdd,
  reiconUserEdit,
  reiconUsers,
} from '@ng-icons/reicon';
import {
  PortalUser,
  UserDraft,
  accessSummary,
  roleLabel,
} from '../../../../core/models/user.model';
import { DEFAULT_PAGE_SIZE, FIRST_PAGE, SortDirection } from '../../../../core/models/page.model';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { AuthService } from '../../../../core/services/auth.service';
import { UserService } from '../../../../core/services/user.service';
import { ToastService } from '../../../../core/ui/toast.service';
import { SelectComponent, SelectOption } from '../../../../shared/ui/select/select';
import { UserEditDialogComponent } from '../../../../shared/ui/user-edit-dialog/user-edit-dialog';
import { ConfirmDialogComponent } from '../../../../shared/ui/confirm-dialog/confirm-dialog';

/**
 * Registered TanStack Table features — the same set the assessments grid uses:
 * core rows/columns/headers, sorting and pagination, both driven by the server.
 */
const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

type UserTableFeatures = typeof features;

/** How long typing settles before the search is sent to the server. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Columns of the user grid.
 *
 * Only the three fields the API can order are sortable. The role, access and
 * status columns stay plain labels: offering a sort that the server cannot
 * honour would reorder nothing and still look like it had worked.
 */
const COLUMNS: ColumnDef<UserTableFeatures, PortalUser>[] = [
  { id: 'employeeId', accessorKey: 'employeeId', header: 'Employee ID', sortFn: 'alphanumeric' },
  { id: 'name', accessorKey: 'name', header: 'Name', sortFn: 'alphanumeric' },
  { id: 'email', accessorKey: 'email', header: 'Email', sortFn: 'alphanumeric' },
  {
    id: 'role',
    header: 'Role',
    accessorFn: (row) => roleLabel(row.role),
    enableSorting: false,
  },
  {
    id: 'access',
    header: 'Access',
    accessorFn: (row) => accessSummary(row),
    enableSorting: false,
  },
  { id: 'status', accessorKey: 'status', header: 'Status', enableSorting: false },
  { id: 'actions', header: 'Actions', enableSorting: false },
];

/** The table's column ids, mapped onto the keys the API sorts by. */
const SORT_KEYS: Record<string, string> = {
  employeeId: 'employeeId',
  name: 'name',
  email: 'email',
};

/** One rendered pagination entry: a page number or an ellipsis gap. */
type PageItem = { kind: 'page'; key: string; index: number } | { kind: 'gap'; key: string };

/** Value of the role / status filters while no narrowing is applied. */
const ALL = 'all';

/**
 * User Management — the roster of portal accounts and what each one reaches.
 *
 * An account's abilities come from its role: the role fixes the permissions,
 * and the locations and batches assigned here decide which data those
 * permissions apply to. Only a Super Admin reaches this screen (see
 * `permissionGuard` on the route), and nobody can delete their own account or
 * change its role — that would lock the portal's last admin out.
 *
 * The list is paged, searched, filtered and sorted by the server. That means an
 * employee number cannot be checked for uniqueness against the rows on screen —
 * the account it collides with may be on another page — so the API's own 409 is
 * what refuses a duplicate.
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [NgIcon, SelectComponent, UserEditDialogComponent, ConfirmDialogComponent],
  providers: [
    provideIcons({
      reiconAnglesLeft,
      reiconAnglesRight,
      reiconChevronLeft,
      reiconChevronRight,
      reiconCloseCircle,
      reiconSearchNormal,
      reiconSearchNormal2,
      reiconSort,
      reiconSortAsc,
      reiconSortDesc,
      reiconTrash,
      reiconUserAdd,
      reiconUserEdit,
      reiconUsers,
    }),
  ],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
  host: {
    // Escape closes whichever overlay is open: the delete confirmation first,
    // then the add / edit dialog (which also closes itself).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class UserManagementComponent {
  private readonly users = inject(UserService);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /* ── Toolbar state ───────────────────────────────────────── */

  /** The search the rows were loaded for; `''` when none is applied. */
  readonly search = signal('');

  /** What the search box shows, leading {@link search} while the user types. */
  protected readonly draftSearch = linkedSignal(() => this.search());

  readonly roleFilter = signal(ALL);
  readonly statusFilter = signal(ALL);

  /** The generated password of the last created account; shown once. */
  readonly temporaryPassword = signal<string | null>(null);

  /** Why the last load or change failed, or `null` when it did not. */
  readonly errorMessage = signal<string | null>(null);

  /** Role choices, taken from the matrix the API serves. */
  readonly roleFilterOptions = computed<SelectOption[]>(() => [
    { value: ALL, label: 'All roles' },
    ...this.users.roles().map((role) => ({ value: role.id, label: role.label })),
  ]);

  readonly statusFilterOptions: SelectOption[] = [
    { value: ALL, label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  /** Page-size choices offered in the table footer. */
  readonly pageSizeOptions: SelectOption[] = [
    { value: '10', label: '10 / page' },
    { value: String(DEFAULT_PAGE_SIZE), label: `${DEFAULT_PAGE_SIZE} / page` },
    { value: '50', label: '50 / page' },
  ];

  /* ── Paging state ────────────────────────────────────────── */

  /** The current page of accounts, exactly as the server returned it. */
  private readonly pageUsers = signal<readonly PortalUser[]>([]);

  /** Rows matching the search and filters across every page — never the page's length. */
  readonly totalElements = signal(0);

  /** Whether a page is in flight. */
  readonly loading = signal(false);

  /** Whether the first page has been read, so the empty state does not flash. */
  readonly loaded = signal(false);

  readonly pageIndex = signal(FIRST_PAGE);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  /** Sort the rows were loaded in; omitted means the API's own order. */
  private readonly sort = signal<string | undefined>(undefined);
  private readonly direction = signal<SortDirection | undefined>(undefined);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // The role matrix and permission list come from the API; the accounts are a
    // paged read the toolbar drives.
    this.users.loadAll().subscribe({
      error: (error: unknown) => this.errorMessage.set(apiErrorMessage(error)),
    });
    this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** Whether the toolbar is narrowing the roster at all. */
  private readonly isFiltered = computed(
    () => this.search().trim() !== '' || this.roleFilter() !== ALL || this.statusFilter() !== ALL,
  );

  /**
   * Whether any account exists at all, as opposed to none matching the filters.
   *
   * With the roster paged, only an unfiltered empty page proves there are no
   * accounts; an empty page under a filter or search says nothing beyond "none
   * matched", so the two states stay apart.
   */
  readonly hasUsers = computed(
    () => this.totalElements() > 0 || this.isFiltered() || !this.loaded(),
  );

  /* ── Dialog state ────────────────────────────────────────── */

  /** The account the edit dialog is open on, or `null` while it is closed. */
  readonly editingUser = signal<PortalUser | null>(null);

  /** Whether the dialog is open on a new account rather than an existing one. */
  readonly isAdding = signal(false);

  /** The account awaiting delete confirmation. */
  readonly pendingDelete = signal<PortalUser | null>(null);

  /** Whether the edit dialog is on screen. */
  readonly isDialogOpen = computed(() => this.isAdding() || this.editingUser() !== null);

  /** Whether the dialog's role field is locked — true for one's own account. */
  readonly isEditingSelf = computed(() => {
    const editing = this.editingUser();
    return editing !== null && this.isSelf(editing);
  });

  /* ── Table ───────────────────────────────────────────────── */

  readonly table = injectTable(() => ({
    features,
    columns: COLUMNS,
    data: this.pageUsers(),
    getRowId: (row) => row.employeeId,
    manualPagination: true,
    manualSorting: true,
    rowCount: this.totalElements(),
    state: { pagination: { pageIndex: this.pageIndex(), pageSize: this.pageSize() } },
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  }));

  /** Zero-based index of the page on screen. */
  readonly currentPage = computed(() => this.pageIndex());

  /** Number of pages the server total divides into. */
  readonly pageCount = computed(() => {
    const size = this.pageSize();
    return size > 0 ? Math.ceil(this.totalElements() / size) : 0;
  });

  /** Headers of the grid (a single header row — no column groups). */
  readonly headers = computed(() => this.table.getHeaderGroups()[0]?.headers ?? []);

  /** Rows of the current page. */
  readonly rows = computed(() => this.table.getRowModel().rows);

  /** Number of columns, used by the empty-state cell. */
  readonly columnCount = computed(() => this.headers().length);

  /** Currently selected page size, as required by the footer select. */
  readonly pageSizeValue = computed(() => String(this.pageSize()));

  /** Whether the pager can step back. */
  readonly canPreviousPage = computed(() => this.pageIndex() > 0);

  /** Whether the pager can step forward. */
  readonly canNextPage = computed(
    () => this.pageCount() > 0 && this.pageIndex() < this.pageCount() - 1,
  );

  /** e.g. "Showing 11–20 of 57 users". */
  readonly pageSummary = computed(() => {
    const total = this.totalElements();
    if (total === 0) {
      return 'No users';
    }
    const pageIndex = this.pageIndex();
    const pageSize = this.pageSize();
    const first = pageIndex * pageSize + 1;
    const last = Math.min(total, first + pageSize - 1);
    return `Showing ${first}–${last} of ${total} ${total === 1 ? 'user' : 'users'}`;
  });

  /** Page numbers to render, windowed around the current page with gaps. */
  readonly pageItems = computed<PageItem[]>(() => {
    const pageCount = this.pageCount();
    const current = this.pageIndex();
    const candidates = [0, current - 1, current, current + 1, pageCount - 1];
    const visible = Array.from(new Set(candidates))
      .filter((index) => index >= 0 && index < pageCount)
      .sort((a, b) => a - b);

    const items: PageItem[] = [];
    let previous = -1;
    for (const index of visible) {
      if (previous !== -1 && index - previous > 1) {
        items.push({ kind: 'gap', key: `gap-${previous}` });
      }
      items.push({ kind: 'page', key: `page-${index}`, index });
      previous = index;
    }
    return items;
  });

  /* ── Loading ─────────────────────────────────────────────── */

  /** Reads the page the toolbar and pager are pointing at. */
  private load(): void {
    this.loading.set(true);
    this.users
      .load({
        page: this.pageIndex(),
        size: this.pageSize(),
        search: this.search(),
        role: this.roleFilter() === ALL ? undefined : this.roleFilter(),
        status: this.statusFilter() === ALL ? undefined : this.statusFilter(),
        sort: this.sort(),
        direction: this.direction(),
      })
      .subscribe({
        next: (page) => {
          this.pageUsers.set(page.items);
          this.totalElements.set(page.totalElements);
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          this.pageUsers.set([]);
          this.totalElements.set(0);
          this.loading.set(false);
          this.loaded.set(true);
          this.errorMessage.set(apiErrorMessage(error));
        },
      });
  }

  /* ── Toolbar actions ─────────────────────────────────────── */

  /**
   * Delays the search until typing settles: a request per keystroke would spend
   * most of its answers on prefixes nobody asked to see.
   */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftSearch.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search.set(value);
      // A narrower roster usually has fewer pages, so start again from the top.
      this.pageIndex.set(FIRST_PAGE);
      this.load();
    }, SEARCH_DEBOUNCE_MS);
  }

  onRoleFilterChange(value: string | undefined): void {
    this.roleFilter.set(value || ALL);
    this.pageIndex.set(FIRST_PAGE);
    this.load();
  }

  onStatusFilterChange(value: string | undefined): void {
    this.statusFilter.set(value || ALL);
    this.pageIndex.set(FIRST_PAGE);
    this.load();
  }

  /** Empties the search field, showing every account the filters allow again. */
  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.draftSearch.set('');
    this.search.set('');
    this.pageIndex.set(FIRST_PAGE);
    this.load();
  }

  /* ── Row helpers ─────────────────────────────────────────── */

  /** Whether a row is the signed-in user's own account. */
  isSelf(user: PortalUser): boolean {
    return user.employeeId === this.auth.employeeId();
  }

  /** Display name of a user's role, e.g. `Location Admin`. */
  roleLabel(user: PortalUser): string {
    return roleLabel(user.role);
  }

  /** One line describing the locations or batches a user reaches. */
  accessSummary(user: PortalUser): string {
    return accessSummary(user);
  }

  /* ── CRUD ────────────────────────────────────────────────── */

  openAddDialog(): void {
    this.editingUser.set(null);
    this.isAdding.set(true);
  }

  openEditDialog(user: PortalUser): void {
    this.isAdding.set(false);
    this.editingUser.set(user);
  }

  closeDialog(): void {
    this.isAdding.set(false);
    this.editingUser.set(null);
  }

  /** Applies the dialog's result — a new account, or edits to an existing one. */
  onDialogSave(draft: UserDraft): void {
    const editing = this.editingUser();
    this.errorMessage.set(null);

    if (editing) {
      const { employeeId, ...changes } = draft;
      // Your own role is locked in the dialog; ignore any role that arrives
      // with it anyway, so self-demotion has no route in.
      this.users
        .updateUser(
          editing.employeeId,
          this.isSelf(editing) ? { ...changes, role: editing.role } : changes,
        )
        .subscribe({
          next: () => {
            this.toasts.success('Account updated');
            this.closeDialog();
            this.load();
          },
          // Kept inline as well: the banner stays on screen while the user fixes
          // the field, where the toast would have already faded.
          error: (error: unknown) => {
            this.errorMessage.set(apiErrorMessage(error));
            this.closeDialog();
          },
        });
    } else {
      this.temporaryPassword.set(null);
      this.users.createUser(draft).subscribe({
        next: (created) => {
          // The generated password can be read this one time only.
          this.temporaryPassword.set(created.temporaryPassword);
          this.toasts.success('Account created');
          this.closeDialog();
          // A new account is not necessarily on the page on screen, so the
          // roster is re-read from the top with the toolbar's filters.
          this.pageIndex.set(FIRST_PAGE);
          this.load();
        },
        error: (error: unknown) => {
          // A duplicate employee number arrives here as the API's own 409.
          this.errorMessage.set(apiErrorMessage(error));
          this.closeDialog();
        },
      });
    }
  }

  /** Hides the generated-password notice once it has been passed on. */
  dismissTemporaryPassword(): void {
    this.temporaryPassword.set(null);
  }

  /** Hides the failure notice. */
  dismissError(): void {
    this.errorMessage.set(null);
  }

  /** Asks for confirmation before removing an account. */
  requestDelete(user: PortalUser): void {
    if (this.isSelf(user)) {
      return;
    }
    this.pendingDelete.set(user);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const user = this.pendingDelete();
    if (!user) {
      return;
    }
    this.errorMessage.set(null);
    this.users.deleteUser(user.employeeId).subscribe({
      next: () => {
        this.toasts.success(`Account for ${user.name} deleted`);
        this.pendingDelete.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.errorMessage.set(apiErrorMessage(error));
        this.pendingDelete.set(null);
      },
    });
  }

  /** Escape closes the delete confirmation, or the dialog behind it. */
  onEscape(): void {
    if (this.pendingDelete()) {
      this.cancelDelete();
      return;
    }
    if (this.isDialogOpen()) {
      this.closeDialog();
    }
  }

  /* ── Pagination and sorting ──────────────────────────────── */

  /** Returns the grid to the first page — called when a filter is replaced. */
  resetPage(): void {
    this.requestPage(FIRST_PAGE);
  }

  goToPage(index: number): void {
    this.requestPage(index);
  }

  previousPage(): void {
    this.requestPage(Math.max(0, this.currentPage() - 1));
  }

  nextPage(): void {
    this.requestPage(this.currentPage() + 1);
  }

  goToFirstPage(): void {
    this.requestPage(FIRST_PAGE);
  }

  goToLastPage(): void {
    const last = this.pageCount() - 1;
    if (last >= 0) {
      this.requestPage(last);
    }
  }

  onPageSizeChange(value: string | undefined): void {
    const pageSize = Number(value);
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      return;
    }
    this.requestPage(FIRST_PAGE, pageSize);
  }

  /**
   * Reports the order a header asks for. The rows are not reordered here: under
   * manual sorting they are the server's page and stay as it sent them.
   */
  onSort(header: Header<UserTableFeatures, PortalUser>, event: Event): void {
    header.column.getToggleSortingHandler()?.(event);
    const direction = header.column.getIsSorted();
    const sort = SORT_KEYS[header.column.id];
    if (!sort || (direction !== 'asc' && direction !== 'desc')) {
      return;
    }
    this.sort.set(sort);
    this.direction.set(direction);
    // Ties are broken by the server, so a new order starts at its first page —
    // and the page is read again even when that is the page already on screen,
    // because the order on it has just changed.
    this.pageIndex.set(FIRST_PAGE);
    this.load();
  }

  /** `aria-sort` value of a header cell. */
  ariaSort(header: Header<UserTableFeatures, PortalUser>): 'ascending' | 'descending' | 'none' {
    const sorted = header.column.getIsSorted();
    if (sorted === 'asc') {
      return 'ascending';
    }
    return sorted === 'desc' ? 'descending' : 'none';
  }

  /** Icon reflecting the current sort state of a column. */
  sortIcon(header: Header<UserTableFeatures, PortalUser>): string {
    const sorted = header.column.getIsSorted();
    if (sorted === 'asc') {
      return 'reiconSortAsc';
    }
    return sorted === 'desc' ? 'reiconSortDesc' : 'reiconSort';
  }

  /** Accessible label of a sort button, describing what activating it does next. */
  sortLabel(header: Header<UserTableFeatures, PortalUser>): string {
    const name = String(header.column.columnDef.header);
    const sorted = header.column.getIsSorted();
    if (sorted === 'asc') {
      return `${name}, sorted ascending. Activate to sort descending.`;
    }
    if (sorted === 'desc') {
      return `${name}, sorted descending. Activate to sort ascending.`;
    }
    return `Sort by ${name} ascending.`;
  }

  /** Reports a requested page, keeping the size unless the footer changed it. */
  private requestPage(pageIndex: number, pageSize = this.pageSize()): void {
    const unchanged = pageIndex === this.pageIndex() && pageSize === this.pageSize();
    this.pageIndex.set(pageIndex);
    this.pageSize.set(pageSize);
    if (!unchanged) {
      this.load();
    }
  }
}
