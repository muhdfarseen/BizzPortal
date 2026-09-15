import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import {
  AssessmentExam,
  CefrLevel,
  TraineeAssessment,
  cefrBadge,
  cefrColor,
} from '../../../core/models/assessment.model';
import { SortDirection } from '../../../core/models/page.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { flushStartup } from '../../../testing/api-testing';
import {
  AssessmentPageChange,
  AssessmentRowAction,
  AssessmentRowActionEvent,
  AssessmentSortChange,
  AssessmentTableComponent,
} from './assessment-table';

const EXAMS: readonly AssessmentExam[] = [
  { id: 'pre', name: 'Pre', maxScore: 100 },
  { id: 'mid', name: 'Mid', maxScore: 100 },
  { id: 'post', name: 'Post', maxScore: 100 },
];

function levelFor(score: number): CefrLevel {
  if (score >= 85) {
    return 'C1';
  }
  return score >= 55 ? 'B1' : 'A2';
}

/** Builds a trainee row; exams without a score stay pending. */
function trainee(
  index: number,
  scores: Partial<Record<string, number>>,
  extra: Partial<Pick<TraineeAssessment, 'status' | 'startDate' | 'remark'>> = {},
): TraineeAssessment {
  const results: TraineeAssessment['results'] = {};
  for (const exam of EXAMS) {
    const score = scores[exam.id];
    if (score !== undefined) {
      results[exam.id] = { score, cefr: levelFor(score), assessedOn: '2026-05-04' };
    }
  }
  return { employeeId: `EMP-${1000 + index}`, name: `Trainee ${index}`, results, ...extra };
}

/** 24 trainees — two full pages of 10 plus a part page. */
const ROWS: readonly TraineeAssessment[] = Array.from({ length: 24 }, (_, position) =>
  trainee(position + 1, { pre: (position + 1) * 2, mid: 70, post: 60 }),
);

const ROWS_WITH_PENDING: readonly TraineeAssessment[] = [
  trainee(1, { pre: 42 }),
  trainee(2, { pre: 55, mid: 61 }),
];

const ROWS_WITH_REMARKS: readonly TraineeAssessment[] = [
  trainee(
    1,
    { pre: 42 },
    { status: 'remedial', remark: 'Weak pre-assessment score', startDate: '2026-09-01' },
  ),
  trainee(2, { pre: 55, mid: 61 }, { status: 'lap' }),
];

/** The icon action the Assessments page configures. */
const EDIT_ACTION: AssessmentRowAction = {
  id: 'edit',
  label: 'Edit assessment results',
  icon: 'reiconEdit2',
};

/** The text actions the Trainee status page configures on a tab. */
const TRACK_ACTIONS: readonly AssessmentRowAction[] = [
  { id: 'move-to-lap', label: 'Move to LAP', variant: 'primary' },
  { id: 'close-lap', label: 'Close LAP', variant: 'secondary' },
];

/**
 * Host that stands in for a server-paged page: it holds the whole set, applies
 * the search and order the table reports, and hands back the requested page.
 * The table itself must never slice, filter or sort.
 */
@Component({
  imports: [AssessmentTableComponent],
  template: `
    <app-assessment-table
      [data]="pageRows()"
      [exams]="exams()"
      [actions]="actions()"
      [showStartDate]="showStartDate()"
      [showRemark]="showRemark()"
      [pageIndex]="pageIndex()"
      [pageSize]="pageSize()"
      [totalElements]="totalElements()"
      [loading]="loading()"
      [searchQuery]="searchQuery()"
      [sortableColumns]="sortable()"
      (action)="triggered.push($event)"
      (pageChange)="onPageChange($event)"
      (searchChange)="onSearchChange($event)"
      (sortChange)="onSortChange($event)"
    />
  `,
})
class TestHostComponent {
  readonly dataset = signal<readonly TraineeAssessment[]>(ROWS);
  readonly exams = signal<readonly AssessmentExam[]>(EXAMS);
  readonly actions = signal<readonly AssessmentRowAction[]>([EDIT_ACTION]);
  readonly showStartDate = signal(false);
  readonly showRemark = signal(false);
  readonly loading = signal(false);

  /** Overrides the total the page reports, to prove it never comes from the rows. */
  readonly reportedTotal = signal<number | null>(null);

  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly searchQuery = signal('');

  /** Which columns the server can order by; the default of the real component. */
  readonly sortable = signal<readonly string[]>(['employeeId', 'name']);
  readonly sort = signal<AssessmentSortChange | null>(null);

  /** What the table asked for, so a spec can assert on the events themselves. */
  readonly pageRequests: AssessmentPageChange[] = [];
  readonly searchRequests: string[] = [];
  readonly sortRequests: AssessmentSortChange[] = [];
  readonly triggered: AssessmentRowActionEvent[] = [];

  /** The rows a server would return for the applied search and order. */
  private readonly matching = computed<readonly TraineeAssessment[]>(() => {
    const term = this.searchQuery().trim().toLowerCase();
    const order = this.sort();
    const rows = this.dataset().filter(
      (row) =>
        term === '' ||
        row.name.toLowerCase().includes(term) ||
        row.employeeId.toLowerCase().includes(term),
    );
    if (!order) {
      return rows;
    }
    const factor = order.direction === 'desc' ? -1 : 1;
    return [...rows].sort(
      (first, second) =>
        factor *
        String(first[order.sort as 'name' | 'employeeId']).localeCompare(
          String(second[order.sort as 'name' | 'employeeId']),
        ),
    );
  });

  readonly totalElements = computed(() => this.reportedTotal() ?? this.matching().length);

  readonly pageRows = computed(() =>
    this.matching().slice(
      this.pageIndex() * this.pageSize(),
      this.pageIndex() * this.pageSize() + this.pageSize(),
    ),
  );

  onPageChange(change: AssessmentPageChange): void {
    this.pageRequests.push(change);
    this.pageIndex.set(change.pageIndex);
    this.pageSize.set(change.pageSize);
  }

  onSearchChange(term: string): void {
    this.searchRequests.push(term);
    this.searchQuery.set(term);
    this.pageIndex.set(0);
  }

  onSortChange(change: AssessmentSortChange): void {
    this.sortRequests.push(change);
    this.sort.set(change);
    this.pageIndex.set(0);
  }
}

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AssessmentTableComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    // The table reads the CEFR mapping from the API when it is created.
    flushStartup(http);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function headerLabels(fixture: ReturnType<typeof createFixture>): (string | null)[] {
    return Array.from(host(fixture).querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? null,
    );
  }

  function bodyRows(fixture: ReturnType<typeof createFixture>): HTMLTableRowElement[] {
    return Array.from(host(fixture).querySelectorAll('tbody tr'));
  }

  function firstCellText(fixture: ReturnType<typeof createFixture>): string | undefined {
    return bodyRows(fixture)[0]?.querySelector('td')?.textContent?.trim();
  }

  /** jsdom reports applied colours as `rgb(...)`, not the authored hex. */
  function rgb(hex: string): string {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(value.slice(offset, offset + 2), 16),
    );
    return `rgb(${channels.join(', ')})`;
  }

  function summary(fixture: ReturnType<typeof createFixture>): string | undefined {
    return host(fixture).querySelector('.table-summary')?.textContent?.trim();
  }

  function searchInput(fixture: ReturnType<typeof createFixture>): HTMLInputElement {
    return host(fixture).querySelector<HTMLInputElement>('.table-search-input') as HTMLInputElement;
  }

  /** Types into the search box the way a user does — one `input` event. */
  function typeSearch(fixture: ReturnType<typeof createFixture>, value: string): void {
    const input = searchInput(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Names of the real result rows, ignoring the full-width empty-state row. */
  function namesShown(fixture: ReturnType<typeof createFixture>): string[] {
    return bodyRows(fixture)
      .map((row) => row.querySelector('.td-name')?.textContent?.trim())
      .filter((name): name is string => name !== undefined);
  }

  function clickLabel(fixture: ReturnType<typeof createFixture>, label: string): void {
    host(fixture).querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
    fixture.detectChanges();
  }

  function sortButton(fixture: ReturnType<typeof createFixture>, label: string): HTMLButtonElement {
    const button = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.th-sort')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) {
      throw new Error(`No sort button labelled "${label}"`);
    }
    return button;
  }

  it('renders a column per configured exam plus identity and action columns', () => {
    expect(headerLabels(createFixture())).toEqual([
      'Emp ID',
      'Name',
      'Pre',
      'Mid',
      'Post',
      'Action',
    ]);
  });

  it('renders exactly the page the server sent, with the score of every exam', () => {
    const fixture = createFixture();
    const rows = bodyRows(fixture);

    expect(rows.length).toBe(10);
    expect(firstCellText(fixture)).toBe('EMP-1001');

    const cells = Array.from(rows[0].querySelectorAll('.td-result'));
    expect(cells.map((cell) => cell.querySelector('.result-score')?.textContent?.trim())).toEqual([
      '2',
      '70',
      '60',
    ]);
    expect(cells[0].querySelector('.cefr-pill')?.textContent?.trim()).toBe('A2');
  });

  it('paints the CEFR pill with the level colour from the configured mapping', () => {
    const fixture = createFixture();

    // The mapping lives behind the API, so a save round-trips before the grid
    // re-renders with the new colour.
    const bands = [
      { level: 'A2', min: 0, max: 50, color: 'green' },
      { level: 'B1', min: 51, max: 100, color: 'red' },
      { level: 'C1', min: 51, max: 100, color: 'amber' },
    ];
    TestBed.inject(CefrMappingService)
      .save(bands)
      .subscribe({ error: () => undefined });
    http.expectOne((request) => request.method === 'PUT').flush(bands);
    fixture.detectChanges();

    const pill = bodyRows(fixture)[0].querySelector<HTMLElement>('.cefr-pill');
    const style = cefrBadge(cefrColor('green').accent);

    expect(pill?.style.background).toBe(rgb(style.background));
    expect(pill?.style.color).toBe(rgb(style.color));
  });

  it('keeps the exam maximum out of the cell and in its tooltip', () => {
    const cell = bodyRows(createFixture())[0].querySelector('.td-result');

    // A bare score reads cleaner than "2/100" repeated in every cell…
    expect(cell?.textContent).not.toContain('/100');
    // …while the scale stays available on hover, exam by exam, along with the
    // day the exam was conducted.
    expect(cell?.getAttribute('title')).toBe('Pre: 2 out of 100 · conducted 4 May 2026');
  });

  it('says an exam not taken yet without inventing a conducted date', () => {
    const fixture = createFixture();
    fixture.componentInstance.dataset.set(ROWS_WITH_PENDING);
    fixture.detectChanges();
    fixture.detectChanges();

    const cells = bodyRows(fixture)[0].querySelectorAll('.td-result');
    // The exam that was sat carries its date; the one that was not carries none.
    expect(cells[0].getAttribute('title')).toBe('Pre: 42 out of 100 · conducted 4 May 2026');
    expect(cells[1].getAttribute('title')).toBe('Mid not taken yet');
  });

  it('shows a placeholder for an exam the trainee has not taken', () => {
    const fixture = createFixture();
    fixture.componentInstance.dataset.set(ROWS_WITH_PENDING);
    fixture.detectChanges();
    fixture.detectChanges();

    const pending = bodyRows(fixture)[0].querySelectorAll('.result-pending');
    expect(pending.length).toBe(2);
    expect(pending[0].textContent?.trim()).toBe('—');
    expect(pending[0].closest('.td-result')?.getAttribute('title')).toBe('Mid not taken yet');
  });

  it('summarises the page from the server total, never from the rows on screen', () => {
    const fixture = createFixture();
    // Ten rows on screen, but the server says twenty-four matched.
    fixture.componentInstance.dataset.set(ROWS.slice(0, 10));
    fixture.componentInstance.reportedTotal.set(24);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(bodyRows(fixture).length).toBe(10);
    expect(summary(fixture)).toBe('Showing 1–10 of 24 trainees');
  });

  it('reports what was typed once typing settles, not once per keystroke', () => {
    vi.useFakeTimers();
    const fixture = createFixture();

    typeSearch(fixture, 'trainee');
    typeSearch(fixture, 'trainee 1');
    typeSearch(fixture, 'trainee 12');

    // Nothing is sent while the user is still typing…
    expect(fixture.componentInstance.searchRequests).toEqual([]);

    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    // …then one request carries the finished term.
    expect(fixture.componentInstance.searchRequests).toEqual(['trainee 12']);
    expect(searchInput(fixture).value).toBe('trainee 12');
  });

  it('shows the server page of a search and keeps the box as typed', () => {
    vi.useFakeTimers();
    const fixture = createFixture();

    typeSearch(fixture, 'Trainee 7');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(namesShown(fixture)).toEqual(['Trainee 7']);
    expect(summary(fixture)).toBe('Showing 1–1 of 1 trainees');
    expect(searchInput(fixture).value).toBe('Trainee 7');
  });

  it('asks the server for the next page rather than slicing the loaded rows', () => {
    const fixture = createFixture();

    expect(
      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Previous page"]')?.disabled,
    ).toBe(true);

    clickLabel(fixture, 'Next page');

    expect(fixture.componentInstance.pageRequests).toEqual([{ pageIndex: 1, pageSize: 10 }]);
    expect(summary(fixture)).toBe('Showing 11–20 of 24 trainees');
    expect(firstCellText(fixture)).toBe('EMP-1011');

    clickLabel(fixture, 'Last page');
    expect(fixture.componentInstance.pageRequests.at(-1)).toEqual({
      pageIndex: 2,
      pageSize: 10,
    });
    expect(summary(fixture)).toBe('Showing 21–24 of 24 trainees');
    expect(
      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
    ).toBe(true);

    clickLabel(fixture, 'First page');
    expect(summary(fixture)).toBe('Showing 1–10 of 24 trainees');
  });

  it('jumps to a page from its number, windowing the numbers with gaps', () => {
    const fixture = createFixture();
    fixture.componentInstance.dataset.set(
      Array.from({ length: 100 }, (_, position) => trainee(position + 1, { pre: 40 })),
    );
    fixture.componentInstance.pageIndex.set(4);
    fixture.detectChanges();
    fixture.detectChanges();

    // Page 5 of 10 shows itself and its neighbours, with the ends in reach.
    const labels = Array.from(host(fixture).querySelectorAll('.pagination-page')).map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).toEqual(['1', '4', '5', '6', '10']);
    expect(host(fixture).querySelectorAll('.pagination-gap').length).toBe(2);

    clickLabel(fixture, 'Page 10');

    expect(fixture.componentInstance.pageRequests.at(-1)).toEqual({
      pageIndex: 9,
      pageSize: 10,
    });
    expect(firstCellText(fixture)).toBe('EMP-1091');
  });

  it('resizes the page from the rows-per-page select and returns to the first page', async () => {
    const fixture = createFixture();
    clickLabel(fixture, 'Next page');
    expect(summary(fixture)).toBe('Showing 11–20 of 24 trainees');

    host(fixture).querySelector<HTMLElement>('.page-size')?.click();
    await flushOverlay();
    fixture.detectChanges();

    const option = Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]')).find(
      (candidate) => candidate.textContent?.trim() === '25 / page',
    );
    option?.click();
    await flushOverlay();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(fixture.componentInstance.pageRequests.at(-1)).toEqual({
      pageIndex: 0,
      pageSize: 25,
    });
    expect(bodyRows(fixture).length).toBe(24);
    expect(summary(fixture)).toBe('Showing 1–24 of 24 trainees');
  });

  it('reports the order a header asks for instead of sorting the page itself', () => {
    const fixture = createFixture();
    // Deliberately in the wrong order, so only the server's answer can reorder it.
    fixture.componentInstance.dataset.set([...ROWS].reverse());
    fixture.detectChanges();
    fixture.detectChanges();

    sortButton(fixture, 'Emp ID').click();
    fixture.detectChanges();

    const requested: AssessmentSortChange = { sort: 'employeeId', direction: 'asc' };
    expect(fixture.componentInstance.sortRequests).toEqual([requested]);
    expect(
      host(fixture).querySelector('th[data-column="employeeId"]')?.getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(firstCellText(fixture)).toBe('EMP-1001');

    sortButton(fixture, 'Emp ID').click();
    fixture.detectChanges();

    const descending: SortDirection = 'desc';
    expect(fixture.componentInstance.sortRequests.at(-1)).toEqual({
      sort: 'employeeId',
      direction: descending,
    });
    expect(firstCellText(fixture)).toBe('EMP-1024');
  });

  it('offers no sort control on an exam column, which the server cannot order by', () => {
    const fixture = createFixture();

    // The exam columns are still there...
    expect(headerLabels(fixture)).toContain('Pre');
    // ...but they do not pretend to be sortable. A control whose click is ignored
    // is worse than no control: the arrow moves and the order does not.
    expect(host(fixture).querySelector('th[data-column="pre"] .th-sort')).toBeNull();
    expect(host(fixture).querySelector('th[data-column="mid"] .th-sort')).toBeNull();
  });

  it('offers sorting only on the columns the host declares', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.sortable.set(['name']);
    fixture.detectChanges();
    flushStartup(http);
    fixture.detectChanges();

    expect(host(fixture).querySelector('th[data-column="name"] .th-sort')).not.toBeNull();
    expect(host(fixture).querySelector('th[data-column="employeeId"] .th-sort')).toBeNull();
  });

  it('does not offer sorting on the action column', () => {
    expect(host(createFixture()).querySelector('th[data-column="actions"] .th-sort')).toBeNull();
  });

  it('says a search found nobody, and offers a way back', () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    typeSearch(fixture, 'nobody by this name');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(summary(fixture)).toBe('No trainees');
    expect(host(fixture).querySelector('.td-empty')?.textContent).toContain(
      'No trainees match “nobody by this name”.',
    );

    host(fixture).querySelector<HTMLButtonElement>('.td-empty-clear')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.searchRequests.at(-1)).toBe('');
    expect(searchInput(fixture).value).toBe('');
    expect(bodyRows(fixture)).toHaveLength(10);
  });

  it('shows the clear button only while a search is applied', () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();

    typeSearch(fixture, 'Trainee 7');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    const clear = host(fixture).querySelector<HTMLButtonElement>('.table-search-clear');
    expect(clear).not.toBeNull();

    clear?.click();
    fixture.detectChanges();

    expect(searchInput(fixture).value).toBe('');
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();
    expect(fixture.componentInstance.searchRequests.at(-1)).toBe('');
  });

  it('treats a whitespace-only term as no search at all', () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    typeSearch(fixture, '   ');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(bodyRows(fixture)).toHaveLength(10);
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();
  });

  it('keeps the empty-selection wording when there was no search', () => {
    const fixture = createFixture();
    fixture.componentInstance.dataset.set([]);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.td-empty')?.textContent).toContain(
      'No trainees match this selection.',
    );
    // Nothing was searched for, so there is nothing to clear.
    expect(host(fixture).querySelector('.td-empty-clear')).toBeNull();
  });

  it('keeps the summary on the left and the rows-per-page control beside the page controls', () => {
    const fixture = createFixture();
    const card = host(fixture).querySelector('.table-card');
    const footer = host(fixture).querySelector('.table-footer');

    // The card reads top to bottom: search, then the grid, then the footer.
    expect(card?.firstElementChild?.classList.contains('table-toolbar')).toBe(true);
    expect(card?.querySelector('.table-toolbar + .table-scroll')).not.toBeNull();
    expect(card?.lastElementChild).toBe(footer);

    // The summary sits alone on the left…
    const summaryCell = footer?.firstElementChild;
    expect(summaryCell?.classList.contains('table-summary')).toBe(true);
    expect(summaryCell?.textContent?.trim()).toBe('Showing 1–10 of 24 trainees');

    // …and rows per page sits beside the page controls on the right, in that
    // order, outside the pagination landmark.
    const controls = Array.from(footer?.lastElementChild?.children ?? []);
    expect(controls[0]?.classList.contains('page-size')).toBe(true);
    expect(controls[0]?.getAttribute('aria-label')).toBe('Rows per page');
    expect(controls[1]?.classList.contains('pagination-pages')).toBe(true);
    expect(controls[1]?.querySelector('[aria-label="Next page"]')).not.toBeNull();
    expect(controls[1]?.querySelector('.page-size')).toBeNull();
  });

  it('marks itself busy and holds the pager while a page is in flight', () => {
    const fixture = createFixture();
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();

    const card = host(fixture).querySelector('.table-card');
    expect(card?.getAttribute('aria-busy')).toBe('true');
    expect(
      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
    ).toBe(true);

    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    expect(card?.getAttribute('aria-busy')).toBeNull();
  });

  it('emits the action and its trainee when the edit action is used', () => {
    const fixture = createFixture();

    const button = host(fixture).querySelector<HTMLButtonElement>(
      '.row-action',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Edit assessment results — Trainee 1');
    button.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.triggered.length).toBe(1);
    expect(fixture.componentInstance.triggered[0].action.id).toBe('edit');
    expect(fixture.componentInstance.triggered[0].trainee.employeeId).toBe('EMP-1001');
  });

  it('renders an empty state when the selection has no trainees', () => {
    const fixture = createFixture();
    fixture.componentInstance.dataset.set([]);
    fixture.detectChanges();
    fixture.detectChanges();

    const empty = host(fixture).querySelector<HTMLTableCellElement>('.td-empty');
    expect(empty?.textContent?.trim()).toBe('No trainees match this selection.');
    expect(empty?.getAttribute('colspan')).toBe('6');
    expect(summary(fixture)).toBe('No trainees');
  });

  it('adds a column when the configuration gains an exam', () => {
    const fixture = createFixture();
    fixture.componentInstance.exams.set([...EXAMS, { id: 'final', name: 'Final', maxScore: 50 }]);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre',
      'Mid',
      'Post',
      'Final',
      'Action',
    ]);
  });

  it('renders text action buttons that emit their action and trainee', () => {
    const fixture = createFixture();
    fixture.componentInstance.actions.set(TRACK_ACTIONS);
    fixture.detectChanges();
    fixture.detectChanges();

    const firstRow = host(fixture).querySelector('tbody tr') as HTMLTableRowElement;
    const buttons = Array.from(firstRow.querySelectorAll<HTMLButtonElement>('.row-action-text'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Move to LAP',
      'Close LAP',
    ]);
    expect(buttons[0].getAttribute('data-variant')).toBe('primary');
    expect(buttons[1].getAttribute('data-variant')).toBe('secondary');

    buttons[0].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.triggered[0].action.id).toBe('move-to-lap');
    expect(fixture.componentInstance.triggered[0].trainee.employeeId).toBe('EMP-1001');
  });

  it('shows the start date column only when the host asks for it', () => {
    const fixture = createFixture();

    expect(host(fixture).querySelector('.td-start-date')).toBeNull();

    fixture.componentInstance.showStartDate.set(true);
    fixture.componentInstance.dataset.set(ROWS_WITH_REMARKS);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre',
      'Mid',
      'Post',
      'Start Date',
      'Action',
    ]);
    expect(host(fixture).querySelector('th[data-column="startDate"] .th-sort')).toBeNull();

    const dates = Array.from(host(fixture).querySelectorAll('.td-start-date'));
    expect(dates[0].textContent?.trim()).toBe('1 Sep 2026');
    expect(dates[1].textContent?.trim()).toBe('—');
  });

  it('shows the remark column only when the host asks for it', () => {
    const fixture = createFixture();

    expect(headerLabels(fixture)).toEqual(['Emp ID', 'Name', 'Pre', 'Mid', 'Post', 'Action']);
    expect(host(fixture).querySelector('.td-remark')).toBeNull();

    fixture.componentInstance.showRemark.set(true);
    fixture.componentInstance.dataset.set(ROWS_WITH_REMARKS);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre',
      'Mid',
      'Post',
      'Remark',
      'Action',
    ]);
    expect(host(fixture).querySelector('th[data-column="remark"] .th-sort')).toBeNull();

    const remarks = Array.from(host(fixture).querySelectorAll('.td-remark'));
    expect(remarks[0].textContent?.trim()).toBe('Weak pre-assessment score');
    expect(remarks[1].textContent?.trim()).toBe('—');
  });

  it('drops the action column when the host configures no actions', () => {
    const fixture = createFixture();
    fixture.componentInstance.actions.set([]);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(headerLabels(fixture)).toEqual(['Emp ID', 'Name', 'Pre', 'Mid', 'Post']);
    expect(host(fixture).querySelector('.td-actions')).toBeNull();
  });
});
