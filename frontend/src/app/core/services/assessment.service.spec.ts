import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AssessmentFilter,
  DEFAULT_MAX_SCORE,
  DEFAULT_MIN_SCORE,
  cefrFromScore,
  clampScore,
  formatIsoDate,
  isValidScore,
  todayIsoDate,
} from '../models/assessment.model';
import { AssessmentService } from './assessment.service';
import {
  API_BASE,
  ApiTraineeFixture,
  flushStartup,
  flushTrainees,
  traineeRows,
} from '../../testing/api-testing';

const FILTER: AssessmentFilter = { locationId: 'BLR', batchId: '103', lgId: '1004' };

/** Matches the query the service is expected to send for {@link FILTER}. */
function matchesFilter(params: URLSearchParams): boolean {
  return (
    params.get('locationId') === FILTER.locationId &&
    params.get('batchId') === FILTER.batchId &&
    params.get('lgId') === FILTER.lgId
  );
}

describe('AssessmentService', () => {
  let service: AssessmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssessmentService);
    http = TestBed.inject(HttpTestingController);
    // The scoreable assessments, and their CEFR mapping, load on construction.
    flushStartup(http);
  });

  afterEach(() => http.verify());

  /** Loads a roster for {@link FILTER} and returns it. */
  function loadRoster(rows: readonly ApiTraineeFixture[] = traineeRows(3)) {
    let result: readonly unknown[] = [];
    service.getTrainees(FILTER).subscribe((trainees) => (result = trainees));
    flushTrainees(http, rows, matchesFilter);
    return result;
  }

  it('loads the scoreable exams from the configuration endpoint', () => {
    expect(service.exams().map((exam) => exam.id)).toEqual(['1', '2', '3']);
    expect(service.exams().map((exam) => exam.name)).toEqual([
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
    ]);
    expect(service.exams().every((exam) => exam.maxScore === DEFAULT_MAX_SCORE)).toBe(true);
  });

  it('reads a group roster with the location, batch and LG as query parameters', () => {
    let received: readonly { employeeId: string }[] = [];
    service.getTrainees(FILTER).subscribe((trainees) => (received = trainees));

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('locationId')).toBe('BLR');
    expect(request.request.params.get('batchId')).toBe('103');
    expect(request.request.params.get('lgId')).toBe('1004');

    request.flush([
      { employeeId: '41201', name: 'Aarav Nair', results: { '1': { score: 34, cefr: 'A2' } } },
      { employeeId: '41202', name: 'Meera Iyer', results: {}, status: 'remedial' },
    ]);

    expect(received.map((trainee) => trainee.employeeId)).toEqual(['41201', '41202']);
  });

  it('omits exams with no score and drops a "none" track status', () => {
    loadRoster([
      {
        employeeId: '41201',
        name: 'Aarav Nair',
        results: { '1': { score: 34, cefr: 'A2' }, '2': { score: null, cefr: null } },
      },
    ]);

    const [trainee] = service.cachedTrainees(FILTER);
    expect(trainee.results['1']).toEqual({ score: 34, cefr: 'A2' });
    expect(trainee.results['2']).toBeUndefined();
    expect(trainee.status).toBeUndefined();
  });

  it('caches the loaded roster by filter', () => {
    const rows = traineeRows(4);
    loadRoster(rows);

    expect(service.cachedTrainees(FILTER).length).toBe(4);
    expect(service.cachedTrainees({ locationId: 'ZZZ', batchId: null, lgId: null })).toEqual([]);
  });

  it('ignores unknown exams and writes only scores to the API', () => {
    loadRoster();

    service
      .saveResults(FILTER, '41201', {
        '1': { score: 88, cefr: 'C1' },
        '3': { score: 44, cefr: 'A2' },
        nope: { score: 50, cefr: 'B1' },
      })
      .subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201`);
    expect(request.request.method).toBe('PATCH');
    // The server derives the CEFR level, so it is never sent.
    expect(request.request.body).toEqual({ results: { '1': { score: 88 }, '3': { score: 44 } } });
    request.flush(null, { status: 204, statusText: 'No Content' });

    const trainee = service.cachedTrainees(FILTER).find((row) => row.employeeId === '41201');
    expect(trainee?.results['1']?.score).toBe(88);
    expect(trainee?.results['nope']).toBeUndefined();
  });

  it('clears a result when a null score is sent', () => {
    loadRoster([
      { employeeId: '41201', name: 'Aarav Nair', results: { '1': { score: 34, cefr: 'A2' } } },
    ]);

    service.saveResults(FILTER, '41201', { '1': undefined }).subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201`);
    expect(request.request.body).toEqual({ results: { '1': { score: null } } });
    request.flush(null, { status: 204, statusText: 'No Content' });

    const trainee = service.cachedTrainees(FILTER).find((row) => row.employeeId === '41201');
    expect(trainee?.results['1']).toBeUndefined();
  });

  it('records a track change with its remark and dates', () => {
    loadRoster();

    service
      .saveLapRemedial(FILTER, '41201', 'remedial', '  Weak pre-assessment  ', '2026-09-01')
      .subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201/lap-remedial`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      status: 'remedial',
      remark: 'Weak pre-assessment',
      startDate: '2026-09-01',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });

    const moved = service.cachedTrainees(FILTER).find((row) => row.employeeId === '41201');
    expect(moved?.status).toBe('remedial');
    expect(moved?.remark).toBe('Weak pre-assessment');
    expect(moved?.startDate).toBe('2026-09-01');
  });

  it('closing a track clears its start date and records the close date', () => {
    loadRoster([
      {
        employeeId: '41201',
        name: 'Aarav Nair',
        results: {},
        status: 'lap',
        startDate: '2026-03-02',
        remark: 'No improvement.',
      },
    ]);

    service
      .saveLapRemedial(FILTER, '41201', 'none', 'Track closed', undefined, '2026-11-20')
      .subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201/lap-remedial`);
    expect(request.request.body).toEqual({
      status: 'none',
      remark: 'Track closed',
      closeDate: '2026-11-20',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });

    const reloaded = service.cachedTrainees(FILTER).find((row) => row.employeeId === '41201');
    expect(reloaded?.status).toBe('none');
    expect(reloaded?.startDate).toBeUndefined();
    expect(reloaded?.closeDate).toBe('2026-11-20');
  });

  it('scores a stored level with the configured CEFR mapping', () => {
    expect(service.levelFor(88)).toBe(cefrFromScore(88));
  });
});

describe('track start date helpers', () => {
  it('formats ISO dates for display', () => {
    expect(formatIsoDate('2026-03-02')).toBe('2 Mar 2026');
    expect(formatIsoDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('builds today as an ISO date', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('validates whole-number scores inside the exam range', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(DEFAULT_MAX_SCORE)).toBe(true);
    expect(isValidScore(60, 60)).toBe(true);
    expect(isValidScore(DEFAULT_MIN_SCORE, DEFAULT_MAX_SCORE, DEFAULT_MIN_SCORE)).toBe(true);
    expect(isValidScore(DEFAULT_MIN_SCORE - 1, DEFAULT_MAX_SCORE, DEFAULT_MIN_SCORE)).toBe(false);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(DEFAULT_MAX_SCORE + 1)).toBe(false);
    expect(isValidScore(61, 60)).toBe(false);
    expect(isValidScore(12.5)).toBe(false);
    expect(isValidScore(Number.NaN)).toBe(false);
  });

  it('clamps scores into the exam range', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(120)).toBe(DEFAULT_MAX_SCORE);
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore(30, 25)).toBe(25);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
