import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '../../testing/api-testing';
import { DashboardService, DashboardSummary } from './dashboard.service';

/** The summary the running backend answers with after the demo seed. */
const SUMMARY: DashboardSummary = {
  totals: { trainees: 14, batches: 5, regular: 12, remedial: 1, lap: 1 },
  locations: [
    {
      locationId: 'BLR',
      locationName: 'Bangalore',
      totalBatch: 2,
      totalTrainee: 5,
      remedialCount: 0,
      lapCount: 0,
    },
    {
      locationId: 'KOC',
      locationName: 'Kochi',
      totalBatch: 1,
      totalTrainee: 5,
      remedialCount: 1,
      lapCount: 1,
    },
  ],
};

describe('DashboardService', () => {
  let service: DashboardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts empty rather than guessing at figures', () => {
    expect(service.summary().totals.trainees).toBe(0);
    expect(service.summary().locations).toEqual([]);
  });

  it('loads the summary and exposes it through the signal', () => {
    service.load().subscribe();

    http.expectOne(`${API_BASE}/dashboard/summary`).flush(SUMMARY);

    expect(service.summary()).toEqual(SUMMARY);
    expect(service.loading()).toBe(false);
    expect(service.failed()).toBe(false);
  });

  it('sends only the filter parameters that are set', () => {
    service
      .load({ locationId: 'KOC', batchId: null, lgId: undefined, year: null, quarter: null })
      .subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/dashboard/summary`,
    );
    expect(request.request.params.get('locationId')).toBe('KOC');
    // Null and undefined both mean "not narrowed", so neither may reach the query
    // string — an empty value would be read as a filter on an empty id.
    expect(request.request.params.has('batchId')).toBe(false);
    expect(request.request.params.has('lgId')).toBe(false);
    // A period that is really absent must not arrive as "the year 0".
    expect(request.request.params.has('year')).toBe(false);
    expect(request.request.params.has('quarter')).toBe(false);

    request.flush(SUMMARY);
  });

  it('sends the period, so an unscoped All is still one quarter', () => {
    // The page's own bug report: the period narrowed the batch dropdown but not the
    // figures, so "All batches" counted every batch in the portal. The server can
    // only apply the period if it is told which one.
    service.load({ year: 2026, quarter: 3 }).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/dashboard/summary`,
    );
    expect(request.request.params.get('year')).toBe('2026');
    expect(request.request.params.get('quarter')).toBe('3');

    request.flush(SUMMARY);
  });

  it('sends all three when the selection is complete', () => {
    service.load({ locationId: 'KOC', batchId: '101', lgId: '1001' }).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/dashboard/summary`,
    );
    expect(request.request.params.get('locationId')).toBe('KOC');
    expect(request.request.params.get('batchId')).toBe('101');
    expect(request.request.params.get('lgId')).toBe('1001');

    request.flush(SUMMARY);
  });

  it('keeps the newest answer when an older request answers last', () => {
    // Refresh issues one request; a second follows the moment the bar reports the
    // quarter it opens on. They are two requests over one connection, so the order
    // they come back in is not the order they left in — the slower, unscoped reply
    // must not paint over the quarter the page is showing.
    service.load().subscribe();
    const unscoped = http.expectOne((candidate) => candidate.url === `${API_BASE}/dashboard/summary`);

    const scoped: DashboardSummary = {
      totals: { trainees: 2, batches: 1, regular: 2, remedial: 0, lap: 0 },
      locations: [],
    };
    service.load({ year: 2026, quarter: 3 }).subscribe();
    const quarter = http.expectOne((candidate) => candidate.url === `${API_BASE}/dashboard/summary`);

    quarter.flush(scoped);
    unscoped.flush(SUMMARY);

    expect(service.summary()).toEqual(scoped);
  });

  it('does not call a good quarter a failure because a stale request failed', () => {
    service.load().subscribe({ error: () => undefined });
    const stale = http.expectOne((candidate) => candidate.url === `${API_BASE}/dashboard/summary`);

    service.load({ year: 2026, quarter: 3 }).subscribe({ error: () => undefined });
    const current = http.expectOne((candidate) => candidate.url === `${API_BASE}/dashboard/summary`);

    current.flush(SUMMARY);
    stale.error(new ProgressEvent('error'));

    // Otherwise the page would show "could not be loaded" over figures that did load.
    expect(service.failed()).toBe(false);
  });

  it('reports a failure instead of leaving zeroes that read as "no trainees"', () => {
    service.load().subscribe({ error: () => undefined });

    http.expectOne(`${API_BASE}/dashboard/summary`).error(new ProgressEvent('error'));

    expect(service.failed()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('clears a previous failure when a later load succeeds', () => {
    service.load().subscribe({ error: () => undefined });
    http.expectOne(`${API_BASE}/dashboard/summary`).error(new ProgressEvent('error'));
    expect(service.failed()).toBe(true);

    service.load().subscribe();
    http.expectOne(`${API_BASE}/dashboard/summary`).flush(SUMMARY);

    expect(service.failed()).toBe(false);
    expect(service.summary().totals.trainees).toBe(14);
  });

  it('keeps the track counts exhaustive', () => {
    // regular + remedial + lap must always equal the trainee count, because a
    // trainee is on at most one track.
    const totals = SUMMARY.totals;

    expect(totals.regular + totals.remedial + totals.lap).toBe(totals.trainees);
  });
});
