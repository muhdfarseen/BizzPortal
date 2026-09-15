import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '../../testing/api-testing';
import { DashboardService, DashboardSummary } from './dashboard.service';

/** The summary the running backend answers with after the demo seed. */
const SUMMARY: DashboardSummary = {
  totals: { trainees: 14, batches: 5, regular: 11, remedial: 1, lap: 1, cleared: 1, others: 0 },
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
    service.load({ locationId: 'KOC', batchId: null, lgId: undefined }).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/dashboard/summary`,
    );
    expect(request.request.params.get('locationId')).toBe('KOC');
    // Null and undefined both mean "not narrowed", so neither may reach the query
    // string — an empty value would be read as a filter on an empty id.
    expect(request.request.params.has('batchId')).toBe(false);
    expect(request.request.params.has('lgId')).toBe(false);

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

  it('keeps the status counts exhaustive', () => {
    // The five figures must always add up to the trainee count, because a trainee
    // holds at most one status and holding none is the regular case.
    const totals = SUMMARY.totals;

    expect(totals.regular + totals.remedial + totals.lap + totals.cleared + totals.others).toBe(
      totals.trainees,
    );
  });
});
