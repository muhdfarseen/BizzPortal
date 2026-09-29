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
    // Moving trainees needs the Remedial manage permission, and an `all`-scope
    // role is what offers Q4 2025 and Bangalore / Batch 01 / LG Alpha.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.superadmin);
  });

  afterEach(() => http.verify());

  /** A page with its startup requests already answered. */
  function createFixture() {
    return harness.createFixture(RemedialComponent);
  }

  it('offers Initiate and Close to a faculty member who may manage Remedial', async () => {
    // A Remedial-only faculty member: assigned batches are in scope, and the
    // Remedial permission lets them both open and close the track.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.facultyRemedial);
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.actionLabels(fixture)).toEqual(['Close Remedial']);
    expect(harness.host(fixture).querySelector('.initiate-btn')?.textContent?.trim()).toBe(
      'Initiate Remedial',
    );
  });

  it('still shows the trainees, but no actions, to a faculty member who may not', async () => {
    // The base faculty role can read the tracks and move nobody. Reading must
    // survive the split, or "view but do not initiate" would be impossible.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.faculty);
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.rowIds(fixture).length).toBeGreaterThan(0);
    expect(harness.actionLabels(fixture)).toEqual([]);
    expect(harness.host(fixture).querySelector('.initiate-btn')).toBeNull();
  });

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

  it('opens on the trainees on Remedial, with an Initiate Remedial button', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.heading(fixture)).toBe('Remedial');
    // No sub-tabs and no track dropdown: the page is for Remedial, so it shows
    // Remedial.
    expect(harness.host(fixture).querySelector('.track-tabs')).toBeNull();
    expect(harness.host(fixture).querySelector('.initiate-btn')?.textContent?.trim()).toBe(
      'Initiate Remedial',
    );
  });

  it('lists the trainees on Remedial, with their track columns', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    // The column names its track, so the date is never ambiguous.
    expect(harness.headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Remedial Start Date',
      'Remark',
      'Action',
    ]);
    // Only the track this page owns is closable here. The LAP placement is made
    // from the LAP page, so it is not offered on this table.
    expect(harness.actionLabels(fixture)).toEqual(['Close Remedial']);
  });

  it('lists the untracked trainees once Initiate Remedial is clicked', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    harness.startInitiate(fixture, 'none');

    // The heading follows the action, so the two views are never confused.
    expect(harness.heading(fixture)).toBe('Initiate Remedial');
    // The pool shows who a placement is made from, so it carries no start date
    // or remark — neither exists before the move.
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

  it('returns to the trainees on Remedial from Initiate, on a secondary Back button', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    harness.startInitiate(fixture, 'none');
    expect(harness.heading(fixture)).toBe('Initiate Remedial');
    // Coming back is not the page's action, so it is offered as a secondary,
    // marked by its arrow rather than by naming the track it returns to.
    const back = harness.host(fixture).querySelector('.initiate-btn');
    expect(back?.classList.contains('is-secondary')).toBe(true);
    expect(back?.textContent?.trim()).toBe('Back');
    expect(back?.querySelector('ng-icon')).not.toBeNull();

    harness.cancelInitiate(fixture, 'remedial');

    expect(harness.heading(fixture)).toBe('Remedial');
    expect(harness.actionLabels(fixture)).toEqual(['Close Remedial']);
  });

  it('initiates Remedial for a trainee after confirming with a remark', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');
    harness.startInitiate(fixture, 'none');

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

    harness.cancelInitiate(fixture, 'remedial');

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
    await harness.searchBangalore(fixture, 'remedial');
    harness.startInitiate(fixture, 'none');

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(harness.dialogDateValue(fixture)).toBe(todayIsoDate());

    harness.setDialogDate(fixture, '2026-03-04');
    harness.confirmDialog(fixture, 'Weak pre-assessment score');

    harness.cancelInitiate(fixture, 'remedial');

    expect(harness.host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '4 Mar 2026',
    );
  });

  it('closes a Remedial track from the current view', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');
    harness.startInitiate(fixture, 'none');
    harness.runFirstAction(fixture, 'Needs support');

    harness.cancelInitiate(fixture, 'remedial');
    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
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
    // untracked: Initiate is a first placement, not a re-entry.
    harness.startInitiate(fixture, 'none');
    expect(harness.rowIds(fixture)).not.toContain('41201');
  });

  it('keeps the trainee on their view when the dialog is cancelled', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');
    harness.startInitiate(fixture, 'none');
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
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.host(fixture).querySelector('.results-notice')).toBeNull();

    await harness.chooseFilter(fixture, 'LG', 'LG Beta');

    expect(harness.host(fixture).querySelector('.results-notice')?.textContent).toContain(
      'Filters changed',
    );
  });
});

