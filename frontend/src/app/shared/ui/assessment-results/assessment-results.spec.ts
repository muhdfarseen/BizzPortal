import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/ui/toast.service';
import { AssessmentResultsComponent } from './assessment-results';
import {
  API_BASE,
  CEFR_BANDS,
  SIGN_IN,
  pageOf,
  signInWith,
  traineeRows,
} from '../../../testing/api-testing';

@Component({
  imports: [AssessmentResultsComponent],
  template: ` <app-assessment-results title="Assessments" /> `,
})
class TestHostComponent {}

/** The seeded exams, named as the old mock named them for the table headers. */
const EXAMS = [
  { id: '1', name: 'Pre', description: 'Baseline.', maxScore: 90, sortOrder: 1, status: 'active' },
  {
    id: '2',
    name: 'Mid',
    description: 'Checkpoint.',
    maxScore: 90,
    sortOrder: 2,
    status: 'active',
  },
  { id: '3', name: 'Post', description: 'Final.', maxScore: 90, sortOrder: 3, status: 'active' },
];

/** Thirty trainees — the first page of 25 plus a part page. */
const ROSTER = traineeRows(30);

/** The envelope the first page answers with. */
const FIRST_PAGE = { page: 0, size: 25, totalElements: ROSTER.length };

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AssessmentResultsComponent', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    signInWith(http, auth, SIGN_IN.superadmin);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    // The services behind the page read their configuration on construction.
    http
      .match(`${API_BASE}/configuration/assessments/active`)
      .forEach((request) => request.flush(EXAMS));
    http
      .match(`${API_BASE}/configuration/cefr-mapping`)
      .forEach((request) => request.flush(CEFR_BANDS));
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function searchButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>(
      '.filter-search-btn',
    ) as HTMLButtonElement;
  }

  /** Picks the option with the given label from the filter dropdown so labelled. */
  async function chooseFilter(
    fixture: ReturnType<typeof createFixture>,
    filter: string,
    label: string,
  ): Promise<void> {
    // Found by label, never by position: the bar is laid out to suit the screen,
    // so an index would break every time a filter is moved or added.
    host(fixture).querySelector<HTMLElement>(`app-select[aria-label="${filter}"]`)?.click();
    await flushOverlay();
    fixture.detectChanges();

    const option = Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    option?.click();
    await flushOverlay();
    fixture.detectChanges();
  }

  /** The trainees request a paged page is expected to make. */
  function traineesRequest(match: (params: URLSearchParams) => boolean) {
    return http.expectOne(
      (candidate) =>
        candidate.url === `${API_BASE}/assessments/trainees` &&
        match(new URLSearchParams(candidate.params.toString())),
    );
  }

  /**
   * Selects Q4 2025, Bangalore / Batch 01 / LG Alpha, searches and approves the
   * first page. The period is named because the bar opens on the quarter in
   * progress, which holds none of the fixture's batches.
   */
  async function searchBangalore(fixture: ReturnType<typeof createFixture>): Promise<void> {
    await chooseFilter(fixture, 'Year', '2025');
    await chooseFilter(fixture, 'Quarter', 'Q4');
    await chooseFilter(fixture, 'Location', 'Bangalore');
    await chooseFilter(fixture, 'Batch', 'Batch 01');
    await chooseFilter(fixture, 'LG', 'LG Alpha');
    searchButton(fixture).click();
    fixture.detectChanges();
    flushTraineesPage(fixture, '1004', FIRST_PAGE);
  }

  /** Flushes the pending trainees request for one LG with the given envelope metadata. */
  function flushTraineesPage(
    fixture: ReturnType<typeof createFixture>,
    lgId: string,
    page: { page: number; size: number; totalElements: number },
  ): void {
    const rows = ROSTER.slice(page.page * page.size, page.page * page.size + page.size);
    traineesRequest((params) => params.get('lgId') === lgId).flush(pageOf(rows, page));
    fixture.detectChanges();
  }

  function summary(fixture: ReturnType<typeof createFixture>): string | undefined {
    return host(fixture).querySelector('.table-summary')?.textContent?.trim();
  }

  function typeSearch(fixture: ReturnType<typeof createFixture>, value: string): void {
    const input = host(fixture).querySelector<HTMLInputElement>(
      '.table-search-input',
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
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

  it('shows the title and the pre-search guidance', () => {
    const fixture = createFixture();

    expect(host(fixture).querySelector('.page-title')?.textContent?.trim()).toBe('Assessments');
    expect(host(fixture).querySelector('.empty-state-title')?.textContent?.trim()).toBe(
      'Select filters to search',
    );
    expect(host(fixture).querySelector('.empty-state-text')?.textContent).toContain(
      'click Search to load the trainee records',
    );
    expect(host(fixture).querySelector('app-assessment-table')).toBeNull();
  });

  it('offers a search button with a search icon, disabled until every filter is chosen', async () => {
    const fixture = createFixture();

    expect(host(fixture).querySelector('.filter-search-icon')).not.toBeNull();
    expect(searchButton(fixture).disabled).toBe(true);

    await chooseFilter(fixture, 'Year', '2025');
    await chooseFilter(fixture, 'Quarter', 'Q4');
    await chooseFilter(fixture, 'Location', 'Bangalore');
    await chooseFilter(fixture, 'Batch', 'Batch 01');
    expect(searchButton(fixture).disabled).toBe(true);

    await chooseFilter(fixture, 'LG', 'LG Alpha');
    expect(searchButton(fixture).disabled).toBe(false);
  });

  it('does not search while the selection is incomplete', async () => {
    const fixture = createFixture();

    await chooseFilter(fixture, 'Location', 'Bangalore');
    searchButton(fixture).click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-assessment-table')).toBeNull();
  });

  it('loads the first page of the group after a search', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const headers = Array.from(host(fixture).querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual(['Emp ID', 'Name', 'Pre', 'Mid', 'Post', 'Action']);
    expect(host(fixture).querySelectorAll('tbody tr').length).toBe(25);
    // The server said thirty matched, so the pager counts thirty even though
    // only twenty-five rows came back.
    expect(summary(fixture)).toBe(`Showing 1–25 of ${ROSTER.length} trainees`);
  });

  it('renders only the exams selected before searching', async () => {
    const fixture = createFixture();
    const examTrigger = host(fixture).querySelector<HTMLButtonElement>('.exam-multi-trigger');
    examTrigger?.click();
    fixture.detectChanges();

    const midOption = Array.from(
      host(fixture).querySelectorAll<HTMLLabelElement>('.exam-option'),
    ).find((option) => option.textContent?.trim() === 'Mid');
    midOption?.querySelector('input')?.click();
    fixture.detectChanges();

    await searchBangalore(fixture);

    const headers = Array.from(host(fixture).querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual(['Emp ID', 'Name', 'Pre', 'Post', 'Action']);
  });

  it('asks the server for the next page, with the page and size', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
    fixture.detectChanges();

    const request = traineesRequest(
      (params) => params.get('page') === '1' && params.get('size') === '25',
    );
    request.flush(pageOf(ROSTER.slice(25), { page: 1, size: 25, totalElements: ROSTER.length }));
    fixture.detectChanges();

    expect(summary(fixture)).toBe('Showing 26–30 of 30 trainees');
    expect(host(fixture).querySelectorAll('tbody tr').length).toBe(5);
  });

  it('sends one debounced search to the server and returns to the first page', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    vi.useFakeTimers();
    typeSearch(fixture, 'trainee 1');
    typeSearch(fixture, 'trainee 12');

    // Still typing: no request has been made.
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    const request = traineesRequest(
      (params) => params.get('search') === 'trainee 12' && params.get('page') === '0',
    );
    request.flush(pageOf(ROSTER.slice(0, 1), { page: 0, size: 25, totalElements: 1 }));
    fixture.detectChanges();

    expect(summary(fixture)).toBe('Showing 1–1 of 1 trainees');
    expect(host(fixture).querySelectorAll('tbody tr').length).toBe(1);
  });

  it('sends the order a header asked for rather than sorting the page', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    sortButton(fixture, 'Name').click();
    fixture.detectChanges();

    const request = traineesRequest(
      (params) => params.get('sort') === 'name' && params.get('direction') === 'asc',
    );
    request.flush(pageOf(ROSTER.slice(0, 25), FIRST_PAGE));
    fixture.detectChanges();

    expect(host(fixture).querySelector('th[data-column="name"]')?.getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('returns to the first page when a new search runs', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
    fixture.detectChanges();
    traineesRequest((params) => params.get('page') === '1').flush(
      pageOf(ROSTER.slice(25), { page: 1, size: 25, totalElements: ROSTER.length }),
    );
    fixture.detectChanges();
    expect(summary(fixture)).toContain('Showing 26–30');

    await chooseFilter(fixture, 'LG', 'LG Beta');
    searchButton(fixture).click();
    fixture.detectChanges();
    flushTraineesPage(fixture, '1005', FIRST_PAGE);

    expect(summary(fixture)).toContain('Showing 1–25');
  });

  it('flags results as stale once the filters change', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    expect(host(fixture).querySelector('.results-notice')).toBeNull();

    await chooseFilter(fixture, 'LG', 'LG Beta');

    expect(host(fixture).querySelector('.results-notice')?.textContent).toContain(
      'Filters changed',
    );
  });

  it('saves only the exam that was sat and shows it in the table', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const firstRow = host(fixture).querySelector<HTMLTableRowElement>(
      'tbody tr',
    ) as HTMLTableRowElement;
    const employeeId = firstRow.querySelector('td')?.textContent?.trim();

    firstRow.querySelector<HTMLButtonElement>('.row-action')?.click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="dialog"]')).not.toBeNull();
    expect(host(fixture).querySelector('.modal-subtitle')?.textContent).toContain(employeeId);

    // Exams are sat one at a time, so scoring the one that just happened is
    // enough. The others are deliberately left as they are.
    const firstInput = host(fixture).querySelectorAll<HTMLInputElement>('.score-input')[0];
    firstInput.value = '89';
    firstInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveButton = host(fixture).querySelector<HTMLButtonElement>(
      '.btn-primary',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    fixture.detectChanges();

    // The save is a PATCH carrying only the exam that changed; the server
    // derives the level, so only scores are sent.
    const request = http.expectOne(`${API_BASE}/assessments/trainees/${employeeId}`);
    expect(request.request.method).toBe('PATCH');
    const body = request.request.body as { results: Record<string, { score: number }> };
    expect(body.results).toEqual({ '1': { score: 89 } });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(
      host(fixture).querySelector('tbody tr .td-result .result-score')?.textContent?.trim(),
    ).toBe('89');

    // The action that used to pass silently now confirms itself.
    expect(toastMessages()).toEqual(['Scores saved']);
    // A saved score is folded into the page on screen, so no extra read is made.
    http.expectNone(`${API_BASE}/assessments/trainees`);
  });

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('keeps the editor open when the save fails, so the work is not lost', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const firstRow = host(fixture).querySelector<HTMLTableRowElement>(
      'tbody tr',
    ) as HTMLTableRowElement;
    const employeeId = firstRow.querySelector('td')?.textContent?.trim();

    firstRow.querySelector<HTMLButtonElement>('.row-action')?.click();
    fixture.detectChanges();

    const firstInput = host(fixture).querySelectorAll<HTMLInputElement>('.score-input')[0];
    firstInput.value = '70';
    firstInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.btn-primary')?.click();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/assessments/trainees/${employeeId}`)
      .flush(
        { status: 422, message: 'Score must be between 0 and 90.' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();

    // Closing on failure would throw away scores the user had just typed.
    expect(host(fixture).querySelector('[role="dialog"]')).not.toBeNull();
    expect(toastMessages().filter((message) => message === 'Scores saved')).toEqual([]);
  });

  it('closes the editor without saving when cancelled', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const before = host(fixture).querySelector('tbody tr .td-result .result-score')?.textContent;

    host(fixture).querySelector<HTMLButtonElement>('.row-action')?.click();
    fixture.detectChanges();

    const score = host(fixture).querySelector<HTMLInputElement>('.score-input') as HTMLInputElement;
    score.value = '11';
    score.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    http.expectNone((candidate) => candidate.url.startsWith(`${API_BASE}/assessments/trainees/`));
    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(host(fixture).querySelector('tbody tr .td-result .result-score')?.textContent).toBe(
      before,
    );
  });

  it('offers the bulk upload and opens it from the header', () => {
    const fixture = createFixture();

    const upload = host(fixture).querySelector<HTMLButtonElement>('.btn-upload');
    expect(upload?.textContent).toContain('Upload data');

    upload?.click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-assessment-upload-dialog')).not.toBeNull();
    expect(host(fixture).textContent).toContain('Upload assessment data');
  });

  it('closes the upload dialog when it is dismissed', () => {
    const fixture = createFixture();

    host(fixture).querySelector<HTMLButtonElement>('.btn-upload')?.click();
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.modal-close-btn')?.click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-assessment-upload-dialog')).toBeNull();
  });
});
