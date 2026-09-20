import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TraineeReport } from '../../../../core/models/report.model';
import { AuthService } from '../../../../core/services/auth.service';
import { API_BASE, SIGN_IN, flushCefr, signInWith } from '../../../../testing/api-testing';
import { ReportsComponent } from './reports';

/** A trainee report as the API answers it: one exam sat, one still pending. */
const TRAINEE_REPORT: TraineeReport = {
  employeeId: '70001',
  name: 'Aarav Nair',
  referenceId: 'KOC-1',
  recruitBranch: 'Kochi',
  phase: 'P1',
  batchId: '9001',
  batchName: 'Batch 01',
  batchStartDate: '2026-01-06',
  lgId: '8001',
  lgName: 'LG Alpha',
  locationId: 'KOC',
  locationName: 'Kochi',
  currentTrack: 'remedial',
  currentTrackSince: '2026-03-06',
  exams: [
    {
      assessmentId: '1',
      assessmentName: 'Pre Assessment',
      maxScore: 90,
      score: 62,
      cefr: 'B2',
      assessedOn: '2026-03-04',
    },
    { assessmentId: '2', assessmentName: 'Mid Assessment', maxScore: 90 },
  ],
  tracks: [
    {
      track: 'remedial',
      status: 'open',
      startDate: '2026-03-06',
      remark: 'Below threshold.',
      assessmentName: 'Pre Assessment',
    },
  ],
};

describe('ReportsComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.locationAdmin);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof createFixture>;

  function host(fixture: Fixture): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(fixture: Fixture): HTMLElement[] {
    return Array.from(host(fixture).querySelectorAll<HTMLElement>('.report-card'));
  }

  function openCard(fixture: Fixture, title: string): void {
    const card = cards(fixture).find((candidate) =>
      candidate.querySelector('.report-card-title')?.textContent?.includes(title),
    );
    card?.click();
    fixture.detectChanges();
  }

  function typeSearch(fixture: Fixture, term: string): void {
    const input = host(fixture).querySelector<HTMLInputElement>('.trainee-search-input')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
  }

  it('offers the trainee report card, named and nothing else', () => {
    const fixture = createFixture();

    expect(cards(fixture).length).toBe(1);
    // The card is the report's name; the blurb and the "open" caption were noise on
    // a card that already opens the report when clicked.
    expect(cards(fixture)[0].textContent?.trim()).toBe('Trainee report');
  });

  it('opens the trainee report behind its card and asks for a trainee first', () => {
    const fixture = createFixture();

    openCard(fixture, 'Trainee report');

    // A report with nobody chosen is not an empty report: the page says what to do
    // rather than rendering blank timelines.
    expect(host(fixture).querySelector('.empty-state-title')?.textContent).toContain(
      'Search for a trainee',
    );
    http.expectNone(`${API_BASE}/reports/trainees/70001`);
  });

  it('renders the chosen trainee with both timelines', () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    openCard(fixture, 'Trainee report');

    typeSearch(fixture, 'aarav');
    // Nothing is sent while the user is still typing.
    http.expectNone((candidate) => candidate.url === `${API_BASE}/reports/trainees`);

    vi.advanceTimersByTime(300);
    http
      .expectOne((candidate) => candidate.url === `${API_BASE}/reports/trainees`)
      .flush([{ employeeId: '70001', name: 'Aarav Nair', batchName: 'Batch 01' }]);
    fixture.detectChanges();

    host(fixture).querySelector<HTMLElement>('.match-item')?.click();
    http.expectOne(`${API_BASE}/reports/trainees/70001`).flush(TRAINEE_REPORT);
    // Rendering the report is what creates the component that reads the CEFR
    // mapping, so the request only exists after this change detection.
    fixture.detectChanges();
    flushCefr(http);
    fixture.detectChanges();

    const text = host(fixture).textContent ?? '';
    expect(text).toContain('Aarav Nair');
    expect(text).toContain('Employee ID 70001');
    expect(text).toContain('Batch 01');
    expect(text).toContain('LG Alpha');
    // The exam timeline, with the level the API derived and the pending exam still on it.
    expect(text).toContain('Pre Assessment');
    expect(text).toContain('62 / 90');
    expect(text).toContain('B2');
    expect(text).toContain('Mid Assessment');
    expect(text).toContain('Not yet sat');
    // The track timeline, with why they were placed.
    expect(text).toContain('On Remedial');
    expect(text).toContain('Below threshold.');
  });

  it('says when a search matches nobody rather than showing nothing', () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    openCard(fixture, 'Trainee report');

    typeSearch(fixture, 'nobodyhere');
    vi.advanceTimersByTime(300);
    http.expectOne((candidate) => candidate.url === `${API_BASE}/reports/trainees`).flush([]);
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('No trainee matches that search.');
  });

  it('returns to the card grid', () => {
    const fixture = createFixture();
    openCard(fixture, 'Trainee report');
    expect(cards(fixture).length).toBe(0);

    host(fixture).querySelector<HTMLButtonElement>('.back-button')?.click();
    fixture.detectChanges();

    expect(cards(fixture).length).toBe(1);
  });
});
