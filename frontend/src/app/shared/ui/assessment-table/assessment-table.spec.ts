import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AssessmentExam,
  CefrLevel,
  TraineeAssessment,
  cefrBadge,
  cefrColor,
} from '../../../core/models/assessment.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { flushStartup } from '../../../testing/api-testing';
import {
  AssessmentRowAction,
  AssessmentRowActionEvent,
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
      results[exam.id] = { score, cefr: levelFor(score) };
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

/** The text actions the LAP / Remedial page configures on its Remedial tab. */
const TRACK_ACTIONS: readonly AssessmentRowAction[] = [
  { id: 'move-to-lap', label: 'Move to LAP', variant: 'primary' },
  { id: 'close-lap', label: 'Close LAP', variant: 'secondary' },
];

@Component({
  imports: [AssessmentTableComponent],
  template: `
    <app-assessment-table
      [data]="data()"
      [exams]="exams()"
      [actions]="actions()"
      [showStartDate]="showStartDate()"
      [showRemark]="showRemark()"
      (action)="triggered.push($event)"
    />
  `,
})
class TestHostComponent {
  readonly data = signal<readonly TraineeAssessment[]>(ROWS);
  readonly exams = signal<readonly AssessmentExam[]>(EXAMS);
  readonly actions = signal<readonly AssessmentRowAction[]>([EDIT_ACTION]);
  readonly showStartDate = signal(false);
  readonly showRemark = signal(false);
  readonly triggered: AssessmentRowActionEvent[] = [];
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

  afterEach(() => http.verify());

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

  it('renders the requested page of rows with the score of every exam', () => {
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
    // …while the scale stays available on hover, exam by exam.
    expect(cell?.getAttribute('title')).toBe('Pre: 2 out of 100');
  });

  it('shows a placeholder for an exam the trainee has not taken', () => {
    const fixture = createFixture();
    fixture.componentInstance.data.set(ROWS_WITH_PENDING);
    fixture.detectChanges();
    fixture.detectChanges();

    const pending = bodyRows(fixture)[0].querySelectorAll('.result-pending');
    expect(pending.length).toBe(2);
    expect(pending[0].textContent?.trim()).toBe('—');
    expect(pending[0].closest('.td-result')?.getAttribute('title')).toBe('Mid not taken yet');
  });

  it('summarises the visible slice of the result set', () => {
    expect(summary(createFixture())).toBe('Showing 1–10 of 24 trainees');
  });

  it('finds a trainee by name, ignoring case', () => {
    const fixture = createFixture();
    typeSearch(fixture, 'trainee 7');

    expect(namesShown(fixture)).toEqual(['Trainee 7']);
    expect(summary(fixture)).toBe('Showing 1–1 of 1 trainees');
  });

  it('finds a trainee by employee id just as readily', () => {
    const fixture = createFixture();
    typeSearch(fixture, '1007');

    expect(bodyRows(fixture)).toHaveLength(1);
    expect(bodyRows(fixture)[0].querySelector('.td-empid')?.textContent?.trim()).toBe('EMP-1007');
  });

  it('matches a partial term anywhere in the field, paginating the result', () => {
    const fixture = createFixture();
    // Matches Trainee 1 and Trainee 10–19: eleven rows, so still two pages.
    typeSearch(fixture, 'Trainee 1');

    expect(summary(fixture)).toBe('Showing 1–10 of 11 trainees');
    expect(namesShown(fixture)[0]).toBe('Trainee 1');
  });

  it('returns to the first page so a narrow result is never shown as empty', () => {
    const fixture = createFixture();

    clickLabel(fixture, 'Last page');
    expect(bodyRows(fixture)).toHaveLength(4);

    typeSearch(fixture, 'Trainee 24');

    // Staying on page 3 of a result that now has one page would render an empty
    // grid and read as "not found".
    expect(namesShown(fixture)).toEqual(['Trainee 24']);
  });

  it('says a search found nobody, and offers a way back', () => {
    const fixture = createFixture();
    typeSearch(fixture, 'nobody by this name');

    expect(summary(fixture)).toBe('No trainees');
    expect(host(fixture).querySelector('.td-empty')?.textContent).toContain(
      'No trainees match “nobody by this name”.',
    );

    host(fixture).querySelector<HTMLButtonElement>('.td-empty-clear')?.click();
    fixture.detectChanges();

    expect(bodyRows(fixture)).toHaveLength(10);
    expect(searchInput(fixture).value).toBe('');
  });

  it('shows the clear button only while a search is active', () => {
    const fixture = createFixture();
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();

    typeSearch(fixture, 'Trainee 7');
    const clear = host(fixture).querySelector<HTMLButtonElement>('.table-search-clear');
    expect(clear).not.toBeNull();

    clear?.click();
    fixture.detectChanges();

    expect(searchInput(fixture).value).toBe('');
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();
    expect(bodyRows(fixture)).toHaveLength(10);
  });

  it('treats a whitespace-only term as no search at all', () => {
    const fixture = createFixture();
    typeSearch(fixture, '   ');

    expect(bodyRows(fixture)).toHaveLength(10);
    expect(host(fixture).querySelector('.table-search-clear')).toBeNull();
  });

  it('keeps the empty-selection wording when there was no search', () => {
    const fixture = createFixture();
    fixture.componentInstance.data.set([]);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.td-empty')?.textContent).toContain(
      'No trainees match this selection.',
    );
    // Nothing was searched for, so there is nothing to clear.
    expect(host(fixture).querySelector('.td-empty-clear')).toBeNull();
  });

  it('searches the newly selected group, not the one before it', () => {
    const fixture = createFixture();
    typeSearch(fixture, 'Trainee 7');
    expect(namesShown(fixture)).toEqual(['Trainee 7']);

    // A new selection arrives with the search still applied to it.
    fixture.componentInstance.data.set(ROWS_WITH_PENDING);
    fixture.detectChanges();

    expect(namesShown(fixture)).toEqual([]);
    expect(host(fixture).querySelector('.td-empty')?.textContent).toContain('No trainees match');
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

  it('pages through the result set with the pagination controls', () => {
    const fixture = createFixture();

    expect(
      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Previous page"]')?.disabled,
    ).toBe(true);

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
    fixture.detectChanges();

    expect(summary(fixture)).toBe('Showing 11–20 of 24 trainees');
    expect(firstCellText(fixture)).toBe('EMP-1011');

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Last page"]')?.click();
    fixture.detectChanges();

    expect(summary(fixture)).toBe('Showing 21–24 of 24 trainees');
    expect(
      host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.disabled,
    ).toBe(true);

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="First page"]')?.click();
    fixture.detectChanges();

    expect(summary(fixture)).toBe('Showing 1–10 of 24 trainees');
  });

  it('jumps to a page from its number', () => {
    const fixture = createFixture();

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Page 3"]')?.click();
    fixture.detectChanges();

    expect(firstCellText(fixture)).toBe('EMP-1021');
    expect(host(fixture).querySelector('[aria-label="Page 3"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('resizes the page from the rows-per-page select', async () => {
    const fixture = createFixture();

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

    expect(bodyRows(fixture).length).toBe(24);
    expect(summary(fixture)).toBe('Showing 1–24 of 24 trainees');
  });

  it('sorts by an exam score and back again', () => {
    const fixture = createFixture();

    // Score columns open on the highest mark (TanStack sorts numbers descending first).
    sortButton(fixture, 'Pre').click();
    fixture.detectChanges();

    expect(firstCellText(fixture)).toBe('EMP-1024');
    expect(host(fixture).querySelector('th[data-column="pre"]')?.getAttribute('aria-sort')).toBe(
      'descending',
    );

    sortButton(fixture, 'Pre').click();
    fixture.detectChanges();

    expect(firstCellText(fixture)).toBe('EMP-1001');
    expect(host(fixture).querySelector('th[data-column="pre"]')?.getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('does not offer sorting on the action column', () => {
    expect(host(createFixture()).querySelector('th[data-column="actions"] .th-sort')).toBeNull();
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
    fixture.componentInstance.data.set([]);
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
    fixture.componentInstance.data.set(ROWS_WITH_REMARKS);
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
    fixture.componentInstance.data.set(ROWS_WITH_REMARKS);
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
