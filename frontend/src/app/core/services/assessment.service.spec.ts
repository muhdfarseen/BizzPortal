import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AssessmentFilter,
  DEFAULT_MAX_SCORE,
  DEFAULT_MIN_SCORE,
  TraineeAssessment,
  cefrFromScore,
  clampScore,
  formatIsoDate,
  isValidScore,
  todayIsoDate,
} from '../models/assessment.model';
import { Page } from '../models/page.model';
import { AssessmentService } from './assessment.service';
import {
  API_BASE,
  ApiTraineeFixture,
  flushStartup,
  flushTrainees,
  pageOf,
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

  /** Loads a page for {@link FILTER} and returns it. */
  function loadPage(rows: readonly ApiTraineeFixture[] = traineeRows(3)): Page<TraineeAssessment> {
    let result: Page<TraineeAssessment> | undefined;
    service.getTrainees(FILTER).subscribe((page) => (result = page));
    flushTrainees(http, rows, matchesFilter);
    return result as Page<TraineeAssessment>;
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

  it('reads a page with the group, paging, search and order as query parameters', () => {
    let received: Page<TraineeAssessment> | undefined;
    service
      .getTrainees(FILTER, {
        page: 2,
        size: 25,
        search: '  aarav  ',
        status: 'remedial',
        sort: 'name',
        direction: 'desc',
      })
      .subscribe((page) => (received = page));

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('locationId')).toBe('BLR');
    expect(request.request.params.get('batchId')).toBe('103');
    expect(request.request.params.get('lgId')).toBe('1004');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('25');
    expect(request.request.params.get('search')).toBe('aarav');
    expect(request.request.params.get('status')).toBe('remedial');
    expect(request.request.params.get('sort')).toBe('name');
    expect(request.request.params.get('direction')).toBe('desc');

    const rows = traineeRows(25);
    request.flush({
      items: rows,
      page: 2,
      size: 25,
      totalElements: 60,
      totalPages: 3,
      hasNext: true,
    });

    expect(received?.items.map((trainee) => trainee.employeeId)).toEqual(
      rows.map((trainee) => trainee.employeeId),
    );
    expect(received?.totalElements).toBe(60);
  });

  it('leaves out a blank search and an unset order', () => {
    service.getTrainees(FILTER, { page: 0, size: 10, search: '   ' }).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees`,
    );
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('sort')).toBe(false);
    expect(request.request.params.has('direction')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    request.flush(pageOf(traineeRows(1), { page: 0, size: 10 }));
  });

  it('maps the page envelope and omits exams with no score', () => {
    const page = loadPage([
      {
        employeeId: '41201',
        name: 'Aarav Nair',
        results: { '1': { score: 34, cefr: 'A2' }, '2': { score: null, cefr: null } },
      },
    ]);

    const [trainee] = page.items;
    expect(trainee.results['1']).toEqual({ score: 34, cefr: 'A2' });
    expect(trainee.results['2']).toBeUndefined();
    expect(trainee.status).toBeUndefined();
    expect(page.page).toBe(0);
    expect(page.size).toBe(25);
    expect(page.totalElements).toBe(1);
    expect(page.hasNext).toBe(false);
  });

  it('resolves sheet employee numbers against the group with a lookup', () => {
    let group: { groupSize: number; trainees: readonly { employeeId: string }[] } | undefined;
    service.lookupTrainees(FILTER, [41201, 41202, 99999]).subscribe((lookup) => (group = lookup));

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees/lookup`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('lgId')).toBe('1004');
    expect(request.request.body).toEqual({ employeeIds: [41201, 41202, 99999] });

    request.flush({
      groupSize: 12,
      trainees: [{ employeeId: '41201', name: 'Aarav Nair' }],
    });

    expect(group?.groupSize).toBe(12);
    expect(group?.trainees).toEqual([{ employeeId: '41201', name: 'Aarav Nair' }]);
  });

  it('ignores unknown exams and writes only scores to the API', () => {
    service
      .saveResults('41201', {
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
  });

  it('clears a result when a null score is sent', () => {
    service.saveResults('41201', { '1': undefined }).subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201`);
    expect(request.request.body).toEqual({ results: { '1': { score: null } } });
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('records a track change with its remark and dates', () => {
    service
      .saveLapRemedial('41201', 'remedial', '  Weak pre-assessment  ', '2026-09-01')
      .subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201/lap-remedial`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      status: 'remedial',
      remark: 'Weak pre-assessment',
      startDate: '2026-09-01',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('closing a track records the close date without a start date', () => {
    service.saveLapRemedial('41201', 'none', 'Track closed', undefined, '2026-11-20').subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/trainees/41201/lap-remedial`);
    expect(request.request.body).toEqual({
      status: 'none',
      remark: 'Track closed',
      closeDate: '2026-11-20',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
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
