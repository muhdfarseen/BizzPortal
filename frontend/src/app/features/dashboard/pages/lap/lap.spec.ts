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
    // Moving trainees needs `lap-remedial.manage`, and an `all`-scope role is
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

  it('opens on the initiating tab and offers the two LAP views', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    const tabs = Array.from(harness.host(fixture).querySelectorAll<HTMLButtonElement>('.track-tab'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Initiate LAP', 'Current LAP']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('lists the trainees on Remedial on Initiate LAP, ready to be moved', async () => {
    const fixture = createFixture();
    // Initiate LAP draws from the Remedial track, which is how a LAP starts.
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.actionLabels(fixture)).toEqual(['Initiate LAP']);
    // The pool carries the Remedial track it is on, so the columns are present.
    expect(harness.headerLabels(fixture)).toContain('Start Date');
    expect(harness.headerLabels(fixture)).toContain('Remark');
  });

  it('lists the trainees on LAP on Current LAP, with only Close LAP offered', async () => {
    const fixture = createFixture();
    await harness.searchBangalore(fixture, 'remedial');

    harness.openTab(fixture, 'Current LAP', 'lap');

    expect(harness.actionLabels(fixture)).toEqual(['Close LAP']);
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
  });

  it('initiates LAP for a trainee, carrying the remark given', async () => {
    harness.server = untrackedServer();
    harness.seedTrack('remedial');
    const fixture = createFixture();
    // Initiate LAP draws from the Remedial track, which is how a LAP starts.
    await harness.searchBangalore(fixture, 'remedial');

    harness.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    expect(harness.host(fixture).querySelector('.modal-title')?.textContent?.trim()).toBe(
      'Initiate LAP',
    );

    harness.setDialogDate(fixture, '2026-10-15');
    harness.confirmDialog(fixture, 'Completed remedial support');

    // The trainee has left Remedial…
    expect(harness.toastMessages()).toContain('LAP initiated');

    harness.openTab(fixture, 'Current LAP', 'lap');

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
    await harness.searchBangalore(fixture, 'remedial');

    harness.openTab(fixture, 'Current LAP', 'lap');

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
    await harness.searchBangalore(fixture, 'remedial');

    expect(harness.host(fixture).querySelector('.empty-state')?.textContent).toContain(
      'No trainees are on Remedial',
    );
  });
});
