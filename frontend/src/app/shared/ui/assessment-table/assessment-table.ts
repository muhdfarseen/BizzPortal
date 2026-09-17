import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  ColumnDef,
  Header,
  HeaderGroup,
  createPaginatedRowModel,
  createSortedRowModel,
  injectTable,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
} from '@tanstack/angular-table';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconAnglesLeft,
  reiconAnglesRight,
  reiconChevronLeft,
  reiconChevronRight,
  reiconCloseCircle,
  reiconEdit2,
  reiconSearchNormal2,
  reiconSort,
  reiconSortAsc,
  reiconSortDesc,
} from '@ng-icons/reicon';
import {
  AssessmentExam,
  AssessmentResult,
  CefrBadgeStyle,
  TraineeAssessment,
  cefrBadge,
  formatIsoDate,
} from '../../../core/models/assessment.model';
import { DEFAULT_PAGE_SIZE, SortDirection } from '../../../core/models/page.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { SelectComponent, SelectOption } from '../select/select';

/**
 * Registered TanStack Table features — only what the assessments grid needs, so
 * the bundle carries no unused row models: core rows/columns/headers, sorting
 * and pagination.
 *
 * The grid is server-driven, so both are in manual mode: the rows the server
 * sent are shown as they arrived, and the pager's arithmetic is taken from the
 * total the server reported rather than from the page on screen.
 */
const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

type AssessmentTableFeatures = typeof features;

/** How long typing settles before the search is sent to the server. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sort sentinel for an exam a trainee has not taken. Keeping a number here lets
 * exam columns sort by score without a custom sort function; pending results
 * sort before scored ones ascending, and after them descending.
 */
const PENDING_SCORE = -1;

/** Builds the column definitions: identity, one column per configured exam, start date, remark, actions. */
function createColumns(
  exams: readonly AssessmentExam[],
  options: {
    showStartDate: boolean;
    showRemark: boolean;
    showActions: boolean;
    sortableColumns: readonly string[];
  },
): ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] {
  // Only the columns the host can actually order by offer a sort control. A
  // header that looks sortable but silently does nothing is worse than one that
  // does not: the user clicks it, sees the arrow change, and concludes the data
  // is ordered when it is not.
  const isSortable = (id: string) => options.sortableColumns.includes(id);

  const identityColumns: ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] = [
    {
      id: 'employeeId',
      accessorKey: 'employeeId',
      header: 'Emp ID',
      enableSorting: isSortable('employeeId'),
      sortFn: 'alphanumeric',
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Name',
      enableSorting: isSortable('name'),
      sortFn: 'alphanumeric',
    },
  ];

  // Exam columns are derived from the configuration, so adding an exam in the
  // Configuration screen adds a column here — no code change required.
  const examColumns = exams.map<ColumnDef<AssessmentTableFeatures, TraineeAssessment>>((exam) => ({
    id: exam.id,
    header: exam.name,
    accessorFn: (row) => row.results[exam.id]?.score ?? PENDING_SCORE,
    // Off unless a host says the server can order by this exam.
    enableSorting: isSortable(exam.id),
    sortFn: 'basic',
  }));

  // The start date of a trainee's current track is shown only while a LAP /
  // Remedial track tab is on screen, so the column comes and goes with the
  // page's tabs.
  const startDateColumn: ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] =
    options.showStartDate ? [{ id: 'startDate', header: 'Start Date', enableSorting: false }] : [];

  // The remark a trainee arrived with is shown only while a LAP / Remedial
  // track tab is on screen, so the column comes and goes with the page's tabs.
  const remarkColumn: ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] = options.showRemark
    ? [{ id: 'remark', header: 'Remark', enableSorting: false }]
    : [];

  // The action column exists only while the host page offers row actions.
  const actionColumn: ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] = options.showActions
    ? [{ id: 'actions', header: 'Action', enableSorting: false }]
    : [];

  return [...identityColumns, ...examColumns, ...startDateColumn, ...remarkColumn, ...actionColumn];
}

/** A row-level action offered from every row's action cell. */
export interface AssessmentRowAction {
  /** Identifier emitted on {@link AssessmentTableComponent.action} when used. */
  id: string;
  /** Button text — or the accessible label when {@link icon} renders instead. */
  label: string;
  /**
   * Icon name rendered instead of the label (icon-only button). The icon must
   * be registered in this component's `provideIcons` call to resolve.
   */
  icon?: string;
  /** Text-button treatment; icon buttons ignore this. */
  variant?: 'primary' | 'secondary';
}

/** A row action triggered for one trainee row. */
export interface AssessmentRowActionEvent {
  action: AssessmentRowAction;
  trainee: TraineeAssessment;
}

/** A page the footer asked for: where to go, and how large a page is. */
export interface AssessmentPageChange {
  pageIndex: number;
  pageSize: number;
}

/**
 * A sort a header asked for. `sort` is the table's own column id, which the
 * host maps onto the key the API sorts by: only the host knows which columns
 * the server can order.
 */
export interface AssessmentSortChange {
  sort: string;
  direction: SortDirection;
}

/** One rendered pagination entry: a page number or an ellipsis gap. */
type PageItem = { kind: 'page'; key: string; index: number } | { kind: 'gap'; key: string };

/**
 * Assessment table — a server-paged, server-sorted grid of trainee results.
 *
 * The page owns what is on screen: the rows it passes in are already the
 * current page and already in the requested order, so this component never
 * slices, filters or reorders them. Its search box, pager and headers report
 * what the user asked for and wait for the host to bring the answer back,
 * because a client that filtered or sorted a single page would report "no
 * matches" for a trainee sitting on another one.
 *
 * TanStack still owns the columns and the header sort indicators; the markup
 * lives here so the score/CEFR cells and the configured exam columns stay in
 * Angular templates.
 */
@Component({
  selector: 'app-assessment-table',
  standalone: true,
  imports: [NgIcon, SelectComponent],
  providers: [
    provideIcons({
      reiconAnglesLeft,
      reiconAnglesRight,
      reiconChevronLeft,
      reiconChevronRight,
      reiconCloseCircle,
      reiconEdit2,
      reiconSearchNormal2,
      reiconSort,
      reiconSortAsc,
      reiconSortDesc,
    }),
  ],
  templateUrl: './assessment-table.html',
  styleUrl: './assessment-table.css',
})
export class AssessmentTableComponent {
  /** The configured mapping, so each CEFR badge uses its level's colour. */
  private readonly cefrMapping = inject(CefrMappingService);
  private readonly destroyRef = inject(DestroyRef);

  /** The current page of trainee rows, as the server returned them. */
  readonly data = input.required<readonly TraineeAssessment[]>();

  /** Configured exams — rendered as one column each (Pre / Mid / Post today). */
  readonly exams = input.required<readonly AssessmentExam[]>();

  /** Row actions rendered in every row's action cell. */
  readonly actions = input<readonly AssessmentRowAction[]>([]);

  /** Whether rows show the start date of their current track (LAP / Remedial tracks). */
  readonly showStartDate = input(false);

  /** Whether rows show the remark they arrived with (LAP / Remedial tracks). */
  readonly showRemark = input(false);

  /** Zero-based index of the page on screen. */
  readonly pageIndex = input(0);

  /** Rows per page. */
  readonly pageSize = input(DEFAULT_PAGE_SIZE);

  /** Rows matching the current query across every page — never the page's length. */
  readonly totalElements = input(0);

  /** Whether a page is in flight, so the grid can say so and hold its controls. */
  readonly loading = input(false);

  /** The search the rows were loaded for; `''` when none is applied. */
  readonly searchQuery = input('');

  /** Whether the search toolbar should be hidden. */
  readonly hideSearch = input(false);

  /**
   * Column ids the host can order by server-side.
   *
   * <p>Defaults to the two identity columns, which both the results and the LAP /
   * Remedial screens support. Exam columns are absent because the API has no sort
   * key for a per-exam score, so they are not offered rather than offered and
   * ignored.
   */
  readonly sortableColumns = input<readonly string[]>(['employeeId', 'name']);

  /** Emitted when a row action is triggered. */
  readonly action = output<AssessmentRowActionEvent>();

  /** Emitted when the footer asks for another page, or another page size. */
  readonly pageChange = output<AssessmentPageChange>();

  /** Emitted when the search should run, debounced so typing is one request. */
  readonly searchChange = output<string>();

  /** Emitted when a header asks for a new order. */
  readonly sortChange = output<AssessmentSortChange>();

  /**
   * What the search box shows. Follows {@link searchQuery} when the host
   * applies a search, but leads it while the user is still typing — otherwise
   * an in-flight page for an earlier term would overwrite what was typed since.
   */
  protected readonly draftQuery = linkedSignal(() => this.searchQuery());

  /** Whether an applied search is narrowing the grid. */
  readonly isSearching = computed(() => this.searchQuery().trim() !== '');

  /**
   * Whether a search found nothing. Under server paging that is simply an empty
   * page while a search is applied, which is kept apart from "the selection is
   * empty" — the host page's own empty state.
   */
  readonly hasNoMatches = computed(() => this.isSearching() && this.totalElements() === 0);

  /** Page-size choices offered in the table footer. */
  readonly pageSizeOptions: SelectOption[] = [
    { value: '10', label: '10 / page' },
    { value: String(DEFAULT_PAGE_SIZE), label: `${DEFAULT_PAGE_SIZE} / page` },
    { value: '50', label: '50 / page' },
  ];

  private readonly columns = computed(() =>
    createColumns(this.exams(), {
      showStartDate: this.showStartDate(),
      showRemark: this.showRemark(),
      showActions: this.actions().length > 0,
      sortableColumns: this.sortableColumns(),
    }),
  );

  /**
   * The table instance. Pagination and sorting are manual: the server has
   * already cut the page and ordered it, so the table must not do either again.
   * `rowCount` is the server total, which is what the pager's maths needs, and
   * the page index and size are the host's, passed straight through.
   */
  readonly table = injectTable(() => ({
    features,
    columns: this.columns(),
    data: this.data(),
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
  readonly headerGroups = computed<HeaderGroup<AssessmentTableFeatures, TraineeAssessment>[]>(() =>
    this.table.getHeaderGroups(),
  );

  /** Rows of the current page. */
  readonly rows = computed(() => this.table.getRowModel().rows);

  /** Number of columns, used by the empty-state cell. */
  readonly columnCount = computed(() => this.headerGroups()[0]?.headers.length ?? 0);

  /** Currently selected page size, as required by the footer select. */
  readonly pageSizeValue = computed(() => String(this.pageSize()));

  /** Whether the pager can step back. */
  readonly canPreviousPage = computed(() => this.pageIndex() > 0);

  /** Whether the pager can step forward. */
  readonly canNextPage = computed(
    () => this.pageCount() > 0 && this.pageIndex() < this.pageCount() - 1,
  );

  /** e.g. "Showing 11–20 of 57 trainees". */
  readonly pageSummary = computed(() => {
    const total = this.totalElements();
    if (total === 0) {
      return 'No trainees';
    }
    const pageIndex = this.pageIndex();
    const pageSize = this.pageSize();
    const first = pageIndex * pageSize + 1;
    const last = Math.min(total, first + pageSize - 1);
    return `Showing ${first}–${last} of ${total} trainees`;
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

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** Returns the grid to the first page — called when what is on screen is replaced. */
  resetPage(): void {
    this.requestPage(0);
  }

  /**
   * Applies a new search term.
   *
   * Emitting is delayed until typing settles: a request per keystroke would
   * spend most of its answers on prefixes nobody asked to see, and the last one
   * to arrive would not necessarily be the last one typed.
   */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftQuery.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchChange.emit(value), SEARCH_DEBOUNCE_MS);
  }

  /** Shows every trainee of the selection again. */
  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.draftQuery.set('');
    this.searchChange.emit('');
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
    this.requestPage(0);
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
    // A bigger page holds rows that used to be on later pages, so the current
    // index may no longer exist; the host is asked for the first page instead.
    this.requestPage(0, pageSize);
  }

  /**
   * Reports the order a header asks for. The rows are not reordered here: under
   * manual sorting they are the server's page and stay as it sent them.
   */
  onSort(header: Header<AssessmentTableFeatures, TraineeAssessment>, event: Event): void {
    header.column.getToggleSortingHandler()?.(event);
    const direction = header.column.getIsSorted();
    if (direction === 'asc' || direction === 'desc') {
      this.sortChange.emit({ sort: header.column.id, direction });
    }
  }

  /** Forwards a triggered row action to the page that configured it. */
  onAction(rowAction: AssessmentRowAction, trainee: TraineeAssessment): void {
    this.action.emit({ action: rowAction, trainee });
  }

  /**
   * Tooltip of a result cell. The cell shows only the score and its CEFR pill,
   * so the exam's maximum — and the reason an empty cell is empty — live here.
   */
  resultTitle(exam: AssessmentExam, result: AssessmentResult | undefined): string {
    return result
      ? `${exam.name}: ${result.score} out of ${exam.maxScore}`
      : `${exam.name} not taken yet`;
  }

  /** Start date of a trainee's current track, formatted for display. */
  startDateLabel(startDate: string): string {
    return formatIsoDate(startDate);
  }

  /** Badge colours of a CEFR level, taken from the configured mapping. */
  pillStyle(level: string): CefrBadgeStyle {
    return cefrBadge(this.cefrMapping.colorFor(level).accent);
  }

  /** `aria-sort` value of a header cell. */
  ariaSort(
    header: Header<AssessmentTableFeatures, TraineeAssessment>,
  ): 'ascending' | 'descending' | 'none' {
    const sorted = header.column.getIsSorted();
    if (sorted === 'asc') {
      return 'ascending';
    }
    return sorted === 'desc' ? 'descending' : 'none';
  }

  /** Icon reflecting the current sort state of a column. */
  sortIcon(header: Header<AssessmentTableFeatures, TraineeAssessment>): string {
    const sorted = header.column.getIsSorted();
    if (sorted === 'asc') {
      return 'reiconSortAsc';
    }
    return sorted === 'desc' ? 'reiconSortDesc' : 'reiconSort';
  }

  /** Accessible label of a sort button, describing what activating it does next. */
  sortLabel(header: Header<AssessmentTableFeatures, TraineeAssessment>): string {
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
    this.pageChange.emit({ pageIndex, pageSize });
  }
}
