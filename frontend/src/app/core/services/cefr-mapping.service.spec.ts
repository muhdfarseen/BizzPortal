import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_CEFR_MAPPING, cefrFromScore } from '../models/assessment.model';
import { CefrMappingService } from './cefr-mapping.service';
import { API_BASE, CEFR_BANDS } from '../../testing/api-testing';

describe('CefrMappingService', () => {
  let service: CefrMappingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CefrMappingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the configured mapping from the API', () => {
    expect(service.bands()).toEqual(DEFAULT_CEFR_MAPPING);

    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush([
      { level: 'A1', min: 0, max: 50, color: 'red' },
      { level: 'C1', min: 51, max: 100, color: 'green' },
    ]);

    expect(service.bands()).toEqual([
      { level: 'A1', min: 0, max: 50, color: 'red' },
      { level: 'C1', min: 51, max: 100, color: 'green' },
    ]);
    expect(service.isDefault()).toBe(false);
    expect(service.levelFor(40)).toBe('A1');
  });

  it('hands out copies rather than the shipped default', () => {
    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush(CEFR_BANDS);

    expect(service.bands()).not.toBe(DEFAULT_CEFR_MAPPING);
    expect(service.bands()[0]).not.toBe(DEFAULT_CEFR_MAPPING[0]);
  });

  it('saves a replacement mapping to the API and scores against it', () => {
    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush(CEFR_BANDS);

    let saved: readonly unknown[] = [];
    service.save([{ level: 'C2', min: 0, max: 100, color: 'green' }]).subscribe((bands) => {
      saved = bands;
    });

    const request = http.expectOne(`${API_BASE}/configuration/cefr-mapping`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual([{ level: 'C2', min: 0, max: 100, color: 'green' }]);
    request.flush([{ level: 'C2', min: 0, max: 100, color: 'green' }]);

    expect(saved).toEqual([{ level: 'C2', min: 0, max: 100, color: 'green' }]);
    expect(service.isDefault()).toBe(false);
    expect(service.bands()).toEqual([{ level: 'C2', min: 0, max: 100, color: 'green' }]);
    expect(service.levelFor(40)).toBe('C2');
  });

  it('resolves the badge colour of a configured level', () => {
    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush(CEFR_BANDS);

    expect(service.colorFor('C2').id).toBe('green-dark');
    expect(service.colorFor('not-a-level').id).toBe('slate');
    expect(service.colorFor(null).id).toBe('slate');
  });

  it('restores the shipped mapping on reset', () => {
    http
      .expectOne(`${API_BASE}/configuration/cefr-mapping`)
      .flush([{ level: 'C2', min: 0, max: 100, color: 'green' }]);

    service.reset();

    expect(service.bands()).toEqual(DEFAULT_CEFR_MAPPING);
    expect(service.isDefault()).toBe(true);
    expect(service.levelFor(76)).toBe(cefrFromScore(76));
  });
});
