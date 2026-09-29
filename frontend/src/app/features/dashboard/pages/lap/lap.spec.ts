import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { SIGN_IN, signInWith } from '../../../../testing/api-testing';
import { TrackPageHarness, untrackedServer } from '../../../../testing/track-page-testing';
import { LapComponent } from './lap';

describe('LapComponent', () => {
  let http: HttpTestingController;
  let harness: TrackPageHarness<LapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    harness = new TrackPageHarness<LapComponent>(http);
    // Moving trainees needs the LAP manage permission, and an `all`-scope role is
    // what offers Q4 2025 and Bangalore / Batch 01 / LG Alpha in the filter bar.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.superadmin);
  });

  afterEach(() => http.verify());

  /** A page with its startup requests already answered. */
  function createFixture() {
    return harness.createFixture(LapComponent);
  }

  it('shows the title and the pre-search guidance', () => {
    const fixture = createFixture();
    const element = harness.host(fixture);

    expect(element.querySelector('.page-title')?.textContent?.trim()).toBe('LAP');
    expect(element.querySelector('.empty-state')?.textContent).toContain('Select filters to search');
    expect(element.querySelector('.track-tabs')).toBeNull();
    expect(harness.searchButton(fixture).disabled).toBe(true);
  });

  it('offers nothing to a faculty member who may not manage LAP', async () => {
    // The Remedial-only faculty member: they may move Remedial, so the LAP page
    // must offer them no Initiate button and no row actions. The two permissions
    // are separate precisely so this screen comes out empty for them.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.facultyRemedial);
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    expect(harness.host(fixture).querySelector('.initiate-btn')).toBeNull();
    expect(harness.actionLabels(fixture)).toEqual([]);
  });

  it('offers Close LAP to a faculty member who may manage both tracks', async () => {
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.facultyLapRemedial);
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    expect(harness.actionLabels(fixture)).toEqual(['Close LAP']);
  });

  it('opens on the trainees on LAP, with an Initiate LAP button', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    expect(harness.heading(fixture)).toBe('LAP');
    // No sub-tabs and no track dropdown: the page is for LAP, so it shows LAP.
    expect(harness.host(fixture).querySelector('.track-tabs')).toBeNull();
    expect(harness.host(fixture).querySelector('.initiate-btn')?.textContent?.trim()).toBe(
      'Initiate LAP',
    );
  });

  it('lists the trainees on LAP, with only Close LAP offered', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    expect(harness.actionLabels(fixture)).toEqual(['Close LAP']);
    // The column names its track, so a date read here is never mistaken for the
    // Remedial date the same trainee has further down their history.
    expect(harness.headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'LAP Start Date',
      'Remark',
      'Action',
    ]);
  });

  it('lists the trainees on Remedial once Initiate LAP is clicked', async () => {
    const fixture = createFixture();
    // Initiate LAP draws from the Remedial track, which is how a LAP starts.
    await harness.searchBangalore(fixture, 'lap');

    harness.startInitiate(fixture, 'remedial');

    expect(harness.heading(fixture)).toBe('Initiate LAP');
    expect(harness.actionLabels(fixture)).toEqual(['Initiate LAP']);
    // The pool's dates are the Remedial ones, so the column says so — a bare
    // "Start Date" here would read as a LAP date on a LAP page.
    expect(harness.headerLabels(fixture)).toContain('Remedial Start Date');
    expect(harness.headerLabels(fixture)).toContain('Remark');
  });

  it('returns to the trainees on LAP from Initiate, on a secondary Back button', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    harness.startInitiate(fixture, 'remedial');
    expect(harness.heading(fixture)).toBe('Initiate LAP');
    // Coming back is not the page's action, so it is offered as a secondary,
    // marked by its arrow rather than by naming the track it returns to.
    const back = harness.host(fixture).querySelector('.initiate-btn');
    expect(back?.classList.contains('is-secondary')).toBe(true);
    expect(back?.textContent?.trim()).toBe('Back');
    expect(back?.querySelector('ng-icon')).not.toBeNull();

    harness.cancelInitiate(fixture, 'lap');

    expect(harness.heading(fixture)).toBe('LAP');
    expect(harness.actionLabels(fixture)).toEqual(['Close LAP']);
  });

  it('initiates LAP for a trainee, carrying the remark given', async () => {
    harness.server = untrackedServer();
    harness.seedTrack('remedial');
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    harness.startInitiate(fixture, 'remedial');

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(harness.host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe(
      'Initiate LAP',
    );

    harness.setDialogDate(fixture, '2026-10-15');
    harness.confirmDialog(fixture, 'Completed remedial support');

    // The trainee has left Remedial…
    expect(harness.toastMessages()).toContain('LAP initiated');

    harness.cancelInitiate(fixture, 'lap');

    // …and arrived on LAP with the remark given at the move.
    expect(harness.host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Completed remedial support',
    );
    // The move onto LAP recorded its own start date.
    expect(harness.host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '15 Oct 2026',
    );
  });

  it('closes a LAP track from the current view, leaving the trainee off the track', async () => {
    harness.server = untrackedServer();
    harness.seedTrack('lap');
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(harness.host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe(
      'Close LAP',
    );
    harness.confirmDialog(fixture, 'Track completed');

    expect(harness.host(fixture).querySelector('.empty-state')?.textContent).toContain(
      'No trainees are on LAP',
    );
    expect(harness.toastMessages()).toContain('Marked as Cleared');
  });

  it('says so plainly when there is nobody on Remedial to place on LAP', async () => {
    harness.server = untrackedServer();
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'lap');

    harness.startInitiate(fixture, 'remedial');

    expect(harness.host(fixture).querySelector('.empty-state')?.textContent).toContain(
      'No trainees are on Remedial',
    );
  });
});
