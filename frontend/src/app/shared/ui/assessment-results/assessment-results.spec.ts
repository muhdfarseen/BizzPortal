import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/ui/toast.service';
import { AssessmentResultsComponent } from './assessment-results';
import {
  API_BASE,
  CEFR_BANDS,
  SIGN_IN,
  flushTrainees,
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

const ROSTER = traineeRows(25);

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

  afterEach(() => http.verify());

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

  /** Picks the option with the given label from the nth filter dropdown. */
  async function chooseFilter(
    fixture: ReturnType<typeof createFixture>,
    index: number,
    label: string,
  ): Promise<void> {
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

  /** Selects Bangalore / Batch 01 / LG Alpha and runs the search. */
  async function searchBangalore(fixture: ReturnType<typeof createFixture>): Promise<void> {
    await chooseFilter(fixture, 0, 'Bangalore');
    await chooseFilter(fixture, 1, 'Batch 01');
    await chooseFilter(fixture, 2, 'LG Alpha');
    searchButton(fixture).click();
    fixture.detectChanges();
    flushTrainees(http, ROSTER, (params) => params.get('lgId') === '1004');
    fixture.detectChanges();
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

    await chooseFilter(fixture, 0, 'Bangalore');
    await chooseFilter(fixture, 1, 'Batch 01');
    expect(searchButton(fixture).disabled).toBe(true);

    await chooseFilter(fixture, 2, 'LG Alpha');
    expect(searchButton(fixture).disabled).toBe(false);
  });

  it('does not search while the selection is incomplete', async () => {
    const fixture = createFixture();

    await chooseFilter(fixture, 0, 'Bangalore');
    searchButton(fixture).click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-assessment-table')).toBeNull();
  });

  it('loads the results table after a search', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const headers = Array.from(host(fixture).querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual(['Emp ID', 'Name', 'Pre', 'Mid', 'Post', 'Action']);
    expect(host(fixture).querySelectorAll('tbody tr').length).toBe(10);
    expect(host(fixture).querySelector('.table-summary')?.textContent?.trim()).toBe(
      `Showing 1–10 of ${ROSTER.length} trainees`,
    );
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

  it('returns to the first page when a new search runs', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    host(fixture).querySelector<HTMLButtonElement>('[aria-label="Next page"]')?.click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('.table-summary')?.textContent).toContain('Showing 11–20');

    await chooseFilter(fixture, 2, 'LG Beta');
    searchButton(fixture).click();
    fixture.detectChanges();
    flushTrainees(http, ROSTER, (params) => params.get('lgId') === '1005');
    fixture.detectChanges();

    expect(host(fixture).querySelector('.table-summary')?.textContent).toContain('Showing 1–10');
  });

  it('flags results as stale once the filters change', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    expect(host(fixture).querySelector('.results-notice')).toBeNull();

    await chooseFilter(fixture, 2, 'LG Beta');

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
