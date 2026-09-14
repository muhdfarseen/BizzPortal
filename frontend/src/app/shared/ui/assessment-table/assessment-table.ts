import { Component, computed, inject, input, output, signal } from '@angular/core';
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
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { SelectComponent, SelectOption } from '../select/select';

/**
 * Registered TanStack Table features — only what the assessments grid needs, so
 * the bundle carries no unused row models: core rows/columns/headers, sorting
 * and client-side pagination.
 */
const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

type AssessmentTableFeatures = typeof features;

/** Rows per page until the user picks another size in the table footer. */
const DEFAULT_PAGE_SIZE = 10;

/**
 * Sort sentinel for an exam a trainee has not taken. Keeping a number here lets
 * exam columns sort by score without a custom sort function; pending results
 * sort before scored ones ascending, and after them descending.
 */
const PENDING_SCORE = -1;

/** Builds the column definitions: identity, one column per configured exam, start date, remark, actions. */
function createColumns(
  exams: readonly AssessmentExam[],
  options: { showStartDate: boolean; showRemark: boolean; showActions: boolean },
): ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] {
  const identityColumns: ColumnDef<AssessmentTableFeatures, TraineeAssessment>[] = [
    {
      id: 'employeeId',
      accessorKey: 'employeeId',
      header: 'Emp ID',
      sortFn: 'alphanumeric',
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Name',
      sortFn: 'alphanumeric',
    },
  ];

  // Exam columns are derived from the configuration, so adding an exam in the
  // Configuration screen adds a column here — no code change required.
  const examColumns = exams.map<ColumnDef<AssessmentTableFeatures, TraineeAssessment>>((exam) => ({
    id: exam.id,
    header: exam.name,
    accessorFn: (row) => row.results[exam.id]?.score ?? PENDING_SCORE,
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

/** One rendered pagination entry: a page number or an ellipsis gap. */
type PageItem = { kind: 'page'; key: string; index: number } | { kind: 'gap'; key: string };

/**
 * Assessment table — a paginated, sortable grid of trainee results.
 *
 * TanStack Table owns the row model (sorting and pagination); the markup lives
 * here so the score/CEFR cells and the configured exam columns stay in Angular
 * templates. Adding or removing an exam in the configuration changes the
 * columns without touching this component, and the action cells render
 * whatever row actions the host page passes in.
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

  /** Trainee rows of the searched group. */
  readonly data = input.required<readonly TraineeAssessment[]>();

  /** Configured exams — rendered as one column each (Pre / Mid / Post today). */
  readonly exams = input.required<readonly AssessmentExam[]>();

  /** Row actions rendered in every row's action cell. */
  readonly actions = input<readonly AssessmentRowAction[]>([]);

  /** Whether rows show the start date of their current track (LAP / Remedial tracks). */
  readonly showStartDate = input(false);

  /** Whether rows show the remark they arrived with (LAP / Remedial tracks). */
  readonly showRemark = input(false);

  /** Emitted when a row action is triggered. */
  readonly action = output<AssessmentRowActionEvent>();

  /** What the user has typed into the search box. */
  readonly query = signal('');

  /**
   * Rows matching the current search.
   *
   * Matching is case-insensitive and substring-based against the name or the
   * employee id, because those are the two things a user has in front of them
   * when they are hunting for one person in a long roster — they will type
   * either "aarav" or "41207" without thinking about which column it lives in.
   * The search runs over the rows already loaded for the selected group, so it
   * is instant and needs no round trip.
   */
  private readonly filteredData = computed<readonly TraineeAssessment[]>(() => {
    const query = this.query().trim().toLowerCase();
    if (query === '') {
      return this.data();
    }
    return this.data().filter(
      (trainee) =>
        trainee.name.toLowerCase().includes(query) ||
        trainee.employeeId.toLowerCase().includes(query),
    );
  });

  /** Whether a search term is currently narrowing the grid. */
  readonly isSearching = computed(() => this.query().trim() !== '');

  /**
   * Whether the selection has trainees but none of them match the search. Kept
   * apart from "the selection is empty", which is the host page's empty state.
   */
  readonly hasNoMatches = computed(
    () => this.isSearching() && this.data().length > 0 && this.filteredData().length === 0,
  );

  /** Page-size choices offered in the table footer. */
  readonly pageSizeOptions: SelectOption[] = [
    { value: '10', label: '10 / page' },
    { value: '25', label: '25 / page' },
    { value: '50', label: '50 / page' },
  ];

  private readonly columns = computed(() =>
    createColumns(this.exams(), {
      showStartDate: this.showStartDate(),
      showRemark: this.showRemark(),
      showActions: this.actions().length > 0,
    }),
  );

  /**
   * The table instance. `autoResetPageIndex` is off because a page keeps its
   * position when a row is edited; {@link resetPage} runs after each search.
   */
  readonly table = injectTable(() => ({
    features,
    columns: this.columns(),
    data: this.filteredData(),
    getRowId: (row) => row.employeeId,
    initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE } },
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  }));

  private readonly pagination = computed(() => this.table.atoms.pagination.get());

  /** Zero-based index of the page on screen. */
  readonly currentPage = computed(() => this.pagination().pageIndex);

  /** Headers of the grid (a single header row — no column groups). */
  readonly headerGroups = computed<HeaderGroup<AssessmentTableFeatures, TraineeAssessment>[]>(() =>
    this.table.getHeaderGroups(),
  );

  /** Rows of the current page. */
  readonly rows = computed(() => this.table.getRowModel().rows);

  /** Number of columns, used by the empty-state cell. */
  readonly columnCount = computed(() => this.headerGroups()[0]?.headers.length ?? 0);

  /** Currently selected page size, as required by the footer select. */
  readonly pageSizeValue = computed(() => String(this.pagination().pageSize));

  /** e.g. "Showing 11–20 of 57 trainees". */
  readonly pageSummary = computed(() => {
    const total = this.table.getRowCount();
    if (total === 0) {
      return 'No trainees';
    }
    const { pageIndex, pageSize } = this.pagination();
    const first = pageIndex * pageSize + 1;
    const last = Math.min(total, first + pageSize - 1);
    return `Showing ${first}–${last} of ${total} trainees`;
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

  /** Returns the grid to the first page — called after each new search. */
  resetPage(): void {
    this.table.setPageIndex(0);
  }

  /**
   * Applies a new search term.
   *
   * The grid is returned to its first page because the filtered set is usually
   * shorter: staying on page 4 of a result that now has one page would show an
   * empty grid and read as "nothing found".
   */
  onSearchInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.resetPage();
  }

  /** Shows every trainee of the selection again. */
  clearSearch(): void {
    if (!this.isSearching()) {
      return;
    }
    this.query.set('');
    this.resetPage();
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
  onSort(header: Header<AssessmentTableFeatures, TraineeAssessment>, event: Event): void {
    header.column.getToggleSortingHandler()?.(event);
    this.resetPage();
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
}
