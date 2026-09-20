import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '../../testing/api-testing';
import { TraineeReport } from '../models/report.model';
import { ReportService } from './report.service';

/** A trainee report as the API answers it. */
const TRAINEE_REPORT: TraineeReport = {
  employeeId: '70001',
  name: 'Aarav Nair',
  batchId: '9001',
  batchName: 'Batch 01',
  lgName: 'LG Alpha',
  locationId: 'KOC',
  locationName: 'Kochi',
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
    { track: 'remedial', status: 'open', startDate: '2026-03-06', remark: 'Below threshold.' },
  ],
};

describe('ReportService', () => {
  let service: ReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with nothing on screen rather than guessing at a report', () => {
    expect(service.trainee()).toBeNull();
    expect(service.matches()).toEqual([]);
  });

  it('searches for a trainee by name or employee number', () => {
    service.searchTrainees('meera').subscribe();

    const request = http.expectOne((candidate) => candidate.url === `${API_BASE}/reports/trainees`);
    expect(request.request.params.get('search')).toBe('meera');
    // Bounded: the search fills a dropdown, not a table, so it must never ask for
    // an unbounded page of the organisation.
    expect(Number(request.request.params.get('size'))).toBeLessThanOrEqual(10);

    request.flush([{ employeeId: '70002', name: 'Meera Iyer', batchName: 'Batch 01' }]);

    expect(service.matches().length).toBe(1);
    expect(service.searching()).toBe(false);
  });

  it('does not ask the API about an empty box', () => {
    // An empty term reads as "no narrowing" to the API, which would answer with
    // the first page of the whole organisation — not a useful dropdown.
    service.searchTrainees('   ').subscribe();

    expect(service.matches()).toEqual([]);
    http.expectNone((candidate) => candidate.url === `${API_BASE}/reports/trainees`);
  });

  it('loads one trainee report, addressed by employee number', () => {
    service.loadTrainee('70001').subscribe();

    const request = http.expectOne(`${API_BASE}/reports/trainees/70001`);
    request.flush(TRAINEE_REPORT);

    expect(service.trainee()?.name).toBe('Aarav Nair');
    expect(service.traineeFailed()).toBe(false);
    expect(service.loadingTrainee()).toBe(false);
  });

  it('keeps the newest trainee when an older report answers last', () => {
    service.loadTrainee('70001').subscribe({ error: () => undefined });
    const first = http.expectOne(`${API_BASE}/reports/trainees/70001`);

    service.loadTrainee('70002').subscribe();
    const second = http.expectOne(`${API_BASE}/reports/trainees/70002`);

    second.flush({ ...TRAINEE_REPORT, employeeId: '70002', name: 'Meera Iyer' });
    first.flush(TRAINEE_REPORT);

    expect(service.trainee()?.name).toBe('Meera Iyer');
  });

  it('drops the previous trainee when a report fails, rather than showing the wrong one', () => {
    service.loadTrainee('70001').subscribe();
    http.expectOne(`${API_BASE}/reports/trainees/70001`).flush(TRAINEE_REPORT);
    expect(service.trainee()).not.toBeNull();

    service.loadTrainee('70003').subscribe({ error: () => undefined });
    http.expectOne(`${API_BASE}/reports/trainees/70003`).error(new ProgressEvent('error'));

    expect(service.trainee()).toBeNull();
    expect(service.traineeFailed()).toBe(true);
  });

  it('clears the report when the page is left', () => {
    service.loadTrainee('70001').subscribe();
    http.expectOne(`${API_BASE}/reports/trainees/70001`).flush(TRAINEE_REPORT);
    expect(service.trainee()).not.toBeNull();

    service.clear();

    expect(service.trainee()).toBeNull();
    expect(service.matches()).toEqual([]);
    expect(service.traineeFailed()).toBe(false);
  });
});
