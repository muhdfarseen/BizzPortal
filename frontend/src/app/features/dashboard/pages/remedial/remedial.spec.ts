import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { formatIsoDate, todayIsoDate } from '../../../../core/models/assessment.model';
import { AuthService } from '../../../../core/services/auth.service';
import { SIGN_IN, signInWith } from '../../../../testing/api-testing';
import { TrackPageHarness, untrackedServer } from '../../../../testing/track-page-testing';
import { RemedialComponent } from './remedial';

describe('RemedialComponent', () => {
  let http: HttpTestingController;
  let harness: TrackPageHarness<RemedialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RemedialComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    harness = new TrackPageHarness<RemedialComponent>(http);
    // Moving trainees needs `lap-remedial.manage`, and an `all`-scope role is
    // what offers Q4 2025 and Bangalore / Batch 01 / LG Alpha in the filter bar.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.superadmin);
  });

  afterEach(() => http.verify());

  /** A page with its startup requests already answered. */
  function createFixture() {
    return harness.createFixture(RemedialComponent);
  }

  it('shows the title, the pre-search guidance and a disabled search button', () => {
    const fixture = createFixture();
    const element = harness.host(fixture);

    expect(element.querySelector('.page-title')?.textContent?.trim()).toBe('Remedial');
    expect(element.querySelector('.empty-state')?.textContent).toContain('Select filters to search');
    expect(element.querySelector('app-assessment-table')).toBeNull();
    expect(element.querySelector('.track-tabs')).toBeNull();

    const search = harness.searchButton(fixture);
    expect(search.disabled).toBe(true);
    expect(search.querySelector('.filter-search-icon')).not.toBeNull();
  });

  it('opens on the initiating tab and offers the two Remedial views', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    const tabs = Array.from(harness.host(fixture).querySelectorAll<HTMLButtonElement>('.track-tab'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Initiate Remedial',
      'Current Remedial',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('lists the untracked trainees on Initiate Remedial, with no track columns', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    // The initiating tab shows the pool a placement is made from, so it carries
    // no start date or remark — neither exists before the move.
    expect(harness.headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Action',
    ]);
    expect(harness.actionLabels(fixture)).toEqual(['Initiate Remedial']);
  });

  it('lists the trainees on the track on Current Remedial, with their track columns', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    harness.openTab(fixture, 'Current Remedial', 'remedial');

    expect(harness.headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Start Date',
      'Remark',
      'Action',
    ]);
    expect(harness.actionLabels(fixture)).toEqual(['Initiate LAP', 'Close Remedial']);
  });

  it('initiates Remedial for a trainee after confirming with a remark', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    const employeeId = harness.rowIds(fixture)[0];
    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();

    const dialog = harness.host(fixture).querySelector('[role="dialog"]');
    expect(dialog?.querySelector('.modal-title')?.textContent?.trim()).toBe('Initiate Remedial');
    expect(dialog?.querySelector('.modal-subtitle')?.textContent).toContain(employeeId);
    expect((dialog?.querySelector('.btn-primary') as HTMLButtonElement)?.disabled).toBe(true);

    harness.confirmDialog(fixture, 'Weak pre-assessment score');

    expect(harness.host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(harness.rowIds(fixture)).not.toContain(employeeId);
    expect(harness.toastMessages()).toContain('Remedial initiated');

    harness.openTab(fixture, 'Current Remedial', 'remedial');

    // The trainee is now on the track, carrying the remark given at the move.
    expect(harness.rowIds(fixture)).toContain(employeeId);
    expect(harness.host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Weak pre-assessment score',
    );
    // The date field defaulted to today, so that is the recorded start date.
    expect(harness.host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      formatIsoDate(todayIsoDate()),
    );
  });

  it('records a chosen start date and shows it in the track table', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(harness.dialogDateValue(fixture)).toBe(todayIsoDate());

    harness.setDialogDate(fixture, '2026-03-04');
    harness.confirmDialog(fixture, 'Weak pre-assessment score');

    harness.openTab(fixture, 'Current Remedial', 'remedial');

    expect(harness.host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '4 Mar 2026',
    );
  });

  it('closes a Remedial track from the current view', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');
    harness.runFirstAction(fixture, 'Needs support');

    harness.openTab(fixture, 'Current Remedial', 'remedial');
    harness.host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text')[1].click();
    fixture.detectChanges();
    expect(harness.host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe(
      'Close Remedial',
    );
    harness.confirmDialog(fixture, 'Support completed');

    // The trainee has left the track, so the current view is empty.
    expect(harness.host(fixture).querySelector('.empty-state')?.textContent).toContain(
      'No trainees are on Remedial',
    );
    expect(harness.toastMessages()).toContain('Marked as Cleared');

    // A closed track is remembered, so the trainee is not back among the
    // untracked: the initiating view is a first placement, not a re-entry.
    harness.openTab(fixture, 'Initiate Remedial', 'none');
    expect(harness.rowIds(fixture)).not.toContain('41201');
  });

  it('keeps the trainee on their view when the dialog is cancelled', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');
    const employeeId = harness.rowIds(fixture)[0];

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();

    const textarea = harness.host(fixture).querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Typed, then abandoned';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    harness.host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    http.expectNone((candidate) => candidate.method === 'PATCH');
    expect(harness.host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(harness.rowIds(fixture)[0]).toBe(employeeId);
  });

  it('flags results as stale once the filters change', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'none');

    expect(harness.host(fixture).querySelector('.results-notice')).toBeNull();

    await harness.chooseFilter(fixture, 'LG', 'LG Beta');

    expect(harness.host(fixture).querySelector('.results-notice')?.textContent).toContain(
      'Filters changed',
    );
  });
});

