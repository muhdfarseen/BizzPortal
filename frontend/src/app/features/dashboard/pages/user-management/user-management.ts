import { Component, computed, inject, signal } from '@angular/core';
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
import { apiErrorMessage } from '../../../../core/http/api-error';
import { AuthService } from '../../../../core/services/auth.service';
import { UserService } from '../../../../core/services/user.service';
import { ToastService } from '../../../../core/ui/toast.service';
import { SelectComponent, SelectOption } from '../../../../shared/ui/select/select';
import { UserEditDialogComponent } from '../../../../shared/ui/user-edit-dialog/user-edit-dialog';

/**
 * Registered TanStack Table features — the same set the assessments grid uses:
 * core rows/columns/headers, sorting and client-side pagination.
 */
const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

type UserTableFeatures = typeof features;

/** Rows per page until the user picks another size in the table footer. */
const DEFAULT_PAGE_SIZE = 10;

/** Columns of the user grid. */
const COLUMNS: ColumnDef<UserTableFeatures, PortalUser>[] = [
  { id: 'employeeId', accessorKey: 'employeeId', header: 'Employee ID', sortFn: 'alphanumeric' },
  { id: 'name', accessorKey: 'name', header: 'Name', sortFn: 'alphanumeric' },
  { id: 'email', accessorKey: 'email', header: 'Email', sortFn: 'alphanumeric' },
  {
    id: 'role',
    header: 'Role',
    accessorFn: (row) => roleLabel(row.role),
    sortFn: 'alphanumeric',
  },
  {
    id: 'access',
    header: 'Access',
    accessorFn: (row) => accessSummary(row),
    enableSorting: false,
  },
  { id: 'status', accessorKey: 'status', header: 'Status', sortFn: 'alphanumeric' },
  { id: 'actions', header: 'Actions', enableSorting: false },
];

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
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [NgIcon, SelectComponent, UserEditDialogComponent],
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

  /* ── Toolbar state ───────────────────────────────────────── */

  readonly search = signal('');
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
    { value: '25', label: '25 / page' },
    { value: '50', label: '50 / page' },
  ];

  constructor() {
    // The roster, the role matrix and the permission list all come from the API.
    this.users.loadAll().subscribe({
      error: (error: unknown) => this.errorMessage.set(apiErrorMessage(error)),
    });
  }

  /** Accounts matching the search text and the role / status filters. */
  readonly filteredUsers = computed<PortalUser[]>(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();

    return this.users.users().filter((user) => {
      if (role !== ALL && user.role !== role) {
        return false;
      }
      if (status !== ALL && user.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        user.name.toLowerCase().includes(term) ||
        user.employeeId.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    });
  });

  /** Whether any account exists at all, as opposed to none matching the filters. */
  readonly hasUsers = computed(() => this.users.users().length > 0);

  /** Employee ids already in use — the dialog rejects a duplicate. */
  readonly takenEmployeeIds = computed(() => this.users.users().map((user) => user.employeeId));

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
    data: this.filteredUsers(),
    getRowId: (row) => row.employeeId,
    initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE } },
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  }));

  private readonly pagination = computed(() => this.table.atoms.pagination.get());

  /** Zero-based index of the page on screen. */
  readonly currentPage = computed(() => this.pagination().pageIndex);

  /** Headers of the grid (a single header row — no column groups). */
  readonly headers = computed(() => this.table.getHeaderGroups()[0]?.headers ?? []);

  /** Rows of the current page. */
  readonly rows = computed(() => this.table.getRowModel().rows);

  /** Number of columns, used by the empty-state cell. */
  readonly columnCount = computed(() => this.headers().length);

  /** Currently selected page size, as required by the footer select. */
  readonly pageSizeValue = computed(() => String(this.pagination().pageSize));

  /** e.g. "Showing 11–20 of 57 users". */
  readonly pageSummary = computed(() => {
    const total = this.table.getRowCount();
    if (total === 0) {
      return 'No users';
    }
    const { pageIndex, pageSize } = this.pagination();
    const first = pageIndex * pageSize + 1;
    const last = Math.min(total, first + pageSize - 1);
    return `Showing ${first}–${last} of ${total} ${total === 1 ? 'user' : 'users'}`;
  });

  /** Page numbers to render, windowed around the current page with gaps. */
  readonly pageItems = computed<PageItem[]>(() => {
    const pageCount = this.table.getPageCount();
    const current = this.pagination().pageIndex;
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

  /* ── Toolbar actions ─────────────────────────────────────── */

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.resetPage();
  }

  onRoleFilterChange(value: string | undefined): void {
    this.roleFilter.set(value || ALL);
    this.resetPage();
  }

  onStatusFilterChange(value: string | undefined): void {
    this.statusFilter.set(value || ALL);
    this.resetPage();
  }

  /** Empties the search field, showing every account the filters allow again. */
  clearSearch(): void {
    this.search.set('');
    this.resetPage();
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
        },
        error: (error: unknown) => {
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

  resetPage(): void {
    this.table.setPageIndex(0);
  }

  goToPage(index: number): void {
    this.table.setPageIndex(index);
  }

  previousPage(): void {
    this.table.previousPage();
  }

  nextPage(): void {
    this.table.nextPage();
  }

  goToFirstPage(): void {
    this.table.firstPage();
  }

  goToLastPage(): void {
    this.table.lastPage();
  }

  onPageSizeChange(value: string | undefined): void {
    const pageSize = Number(value);
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      return;
    }
    this.table.setPageSize(pageSize);
    this.resetPage();
  }

  /** Toggles the sort of a column, then returns the grid to its first page. */
  onSort(header: Header<UserTableFeatures, PortalUser>, event: Event): void {
    header.column.getToggleSortingHandler()?.(event);
    this.resetPage();
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
}
