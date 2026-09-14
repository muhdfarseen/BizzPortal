import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { formatIsoDate, todayIsoDate } from '../../../../core/models/assessment.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/ui/toast.service';
import {
  API_BASE,
  ApiTraineeFixture,
  SIGN_IN,
  flushStartup,
  flushTrainees,
  signInWith,
  traineeRows,
} from '../../../../testing/api-testing';
import { LapRemedialComponent } from './lap-remedial';

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Strips the track from a roster, so every tab but one starts empty. */
function untracked(rows: readonly ApiTraineeFixture[]): ApiTraineeFixture[] {
  return rows.map(({ employeeId, name, results }) => ({ employeeId, name, results }));
}

/** Twelve trainees on no track: the No LAP / Remedial tab fills its first page of ten. */
const UNTRACKED_ROSTER: readonly ApiTraineeFixture[] = untracked(traineeRows(12));

/** Twelve trainees with a lap, a remedial and ten without: every tab has rows. */
const TRACKED_ROSTER: readonly ApiTraineeFixture[] = traineeRows(12);

describe('LapRemedialComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LapRemedialComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    // Moving trainees needs `lap-remedial.manage`, and an `all`-scope role is
    // what offers Bangalore / Batch 01 / LG Alpha in the filter bar.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.superadmin);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(LapRemedialComponent);
    // The exams and the CEFR mapping are read from the API when the page is
    // constructed — before the filter bar first renders, so a full selection
    // leaves Search enabled.
    flushStartup(http);
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
  async function searchBangalore(
    fixture: ReturnType<typeof createFixture>,
    rows: readonly ApiTraineeFixture[] = UNTRACKED_ROSTER,
  ): Promise<void> {
    await chooseFilter(fixture, 0, 'Bangalore');
    await chooseFilter(fixture, 1, 'Batch 01');
    await chooseFilter(fixture, 2, 'LG Alpha');
    searchButton(fixture).click();
    fixture.detectChanges();
    // The roster only arrives from `GET /api/assessments/trainees`.
    flushTrainees(http, rows, (params) => params.get('lgId') === '1004');
    fixture.detectChanges();
  }

  /** The track tab button with the given label. */
  function tabButton(fixture: ReturnType<typeof createFixture>, label: string): HTMLButtonElement {
    const button = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.track-tab')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) {
      throw new Error(`No track tab labelled "${label}"`);
    }
    return button;
  }

  /** Employee ids of the rows on screen. */
  function rowIds(fixture: ReturnType<typeof createFixture>): string[] {
    return Array.from(host(fixture).querySelectorAll('.td-empid')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  /** Column headers of the table on screen. */
  function headerLabels(fixture: ReturnType<typeof createFixture>): string[] {
    return Array.from(host(fixture).querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
  }

  /** Confirms the open track-change dialog with the given remark. */
  function confirmDialog(fixture: ReturnType<typeof createFixture>, remark: string): void {
    const element = host(fixture);
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = remark;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    // The move is a PATCH; the page re-reads the service's cache once it settles.
    const request = http.expectOne(
      (candidate) =>
        candidate.method === 'PATCH' &&
        candidate.url.startsWith(`${API_BASE}/assessments/trainees/`) &&
        candidate.url.endsWith('/lap-remedial'),
    );
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
  }

  /** Sets the start date of the open track-change dialog. */
  function setDialogDate(fixture: ReturnType<typeof createFixture>, iso: string): void {
    const input = host(fixture).querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;
    input.value = iso;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Moves the first trainee on screen onto the next track; returns their id. */
  async function moveFirstTrainee(
    fixture: ReturnType<typeof createFixture>,
    remark: string,
  ): Promise<string> {
    const employeeId = rowIds(fixture)[0];
    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    confirmDialog(fixture, remark);
    return employeeId;
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('shows the title, the pre-search guidance and a disabled search button', () => {
    const fixture = createFixture();
    const element = host(fixture);

    expect(element.querySelector('.page-title')?.textContent?.trim()).toBe('LAP / Remedial');
    expect(element.querySelector('.empty-state')?.textContent).toContain(
      'Select filters to search',
    );
    expect(element.querySelector('app-assessment-table')).toBeNull();
    expect(element.querySelector('.track-tabs')).toBeNull();

    const search = searchButton(fixture);
    expect(search.disabled).toBe(true);
    expect(search.querySelector('.filter-search-icon')).not.toBeNull();
  });

  it('offers the three track tabs once a group is searched', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture, TRACKED_ROSTER);

    const tabs = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.track-tab'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'No LAP / Remedial',
      'Remedial',
      'LAP',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(host(fixture).querySelector('app-assessment-table')).not.toBeNull();

    // Each tab holds the slice of the roster that is on its track.
    expect(rowIds(fixture)).toEqual([
      '41203',
      '41204',
      '41205',
      '41206',
      '41207',
      '41208',
      '41209',
      '41210',
      '41211',
      '41212',
    ]);

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();
    expect(rowIds(fixture)).toEqual(['41202']);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Below threshold.',
    );

    tabButton(fixture, 'LAP').click();
    fixture.detectChanges();
    expect(rowIds(fixture)).toEqual(['41201']);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'No improvement.',
    );
  });

  it('lists the group on the No LAP / Remedial tab with a Move to Remedial action', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Action',
    ]);

    const actions = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text'),
    );
    expect(actions.length).toBe(10);
    expect(actions[0].textContent?.trim()).toBe('Move to Remedial');
    expect(actions[0].getAttribute('data-variant')).toBe('primary');
  });

  it('hints when a tab holds no trainees', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-assessment-table')).toBeNull();
    expect(host(fixture).querySelector('.empty-state')?.textContent?.trim()).toBe(
      'No trainees are on Remedial for this group.',
    );
  });

  it('moves a trainee to Remedial after confirming with a remark', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const employeeId = rowIds(fixture)[0];
    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();

    const dialog = host(fixture).querySelector('[role="dialog"]');
    expect(dialog?.querySelector('.modal-title')?.textContent?.trim()).toBe('Move to Remedial');
    expect(dialog?.querySelector('.modal-subtitle')?.textContent).toContain(employeeId);
    expect((dialog?.querySelector('.btn-primary') as HTMLButtonElement)?.disabled).toBe(true);

    confirmDialog(fixture, 'Weak pre-assessment score');

    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(rowIds(fixture)).not.toContain(employeeId);
    expect(toastMessages()).toContain('Moved to Remedial');

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();

    expect(rowIds(fixture)).toContain(employeeId);
    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Start Date',
      'Remark',
      'Action',
    ]);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Weak pre-assessment score',
    );
    // The date field defaulted to today, so that is the recorded start date.
    expect(host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      formatIsoDate(todayIsoDate()),
    );
  });

  it('records a chosen start date and shows it in the track table', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();

    const dateInput = host(fixture).querySelector<HTMLInputElement>(
      '.date-input',
    ) as HTMLInputElement;
    expect(dateInput.value).toBe(todayIsoDate());

    setDialogDate(fixture, '2026-03-04');
    confirmDialog(fixture, 'Weak pre-assessment score');

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '4 Mar 2026',
    );
  });

  it('offers Move to LAP on the Remedial tab', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);
    await moveFirstTrainee(fixture, 'Needs support');

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();

    const actions = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text'),
    );
    expect(actions.map((action) => action.textContent?.trim())).toEqual(['Move to LAP']);
  });

  it('carries the remark given when moving from Remedial to LAP', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);
    await moveFirstTrainee(fixture, 'Needs support');

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe('Move to LAP');

    setDialogDate(fixture, '2026-10-15');
    confirmDialog(fixture, 'Completed remedial support');

    // The trainee has left Remedial…
    expect(host(fixture).querySelector('.empty-state')?.textContent).toContain(
      'No trainees are on Remedial',
    );
    expect(toastMessages()).toContain('Moved to LAP');

    tabButton(fixture, 'LAP').click();
    fixture.detectChanges();

    // …and arrived on LAP with the remark given at the move.
    const actions = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text'),
    );
    expect(actions.map((action) => action.textContent?.trim())).toEqual(['Close LAP']);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Completed remedial support',
    );
    // The move onto LAP recorded its own start date.
    expect(host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '15 Oct 2026',
    );
  });

  it('closes a LAP track and returns the trainee to No LAP / Remedial', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);
    const employeeId = await moveFirstTrainee(fixture, 'Needs support');

    tabButton(fixture, 'Remedial').click();
    fixture.detectChanges();
    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    confirmDialog(fixture, 'Completed remedial support');

    tabButton(fixture, 'LAP').click();
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe('Close LAP');
    confirmDialog(fixture, 'Track completed');

    tabButton(fixture, 'No LAP / Remedial').click();
    fixture.detectChanges();

    expect(rowIds(fixture)).toContain(employeeId);
    expect(toastMessages()).toContain('Removed from LAP / Remedial');
  });

  it('keeps the trainee on their tab when the dialog is cancelled', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);
    const employeeId = rowIds(fixture)[0];

    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();

    const textarea = host(fixture).querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Typed, then abandoned';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(rowIds(fixture)[0]).toBe(employeeId);
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
});
