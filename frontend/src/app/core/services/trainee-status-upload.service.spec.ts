import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AssessmentFilter, todayIsoDate } from '../models/assessment.model';
import { StatusUploadPreview, StatusUploadRow } from '../models/trainee-status-upload.model';
import { FileDownloadService } from './file-download.service';
import { TraineeStatusUploadService } from './trainee-status-upload.service';
import { API_BASE } from '../../testing/api-testing';

const FILTER: AssessmentFilter = { locationId: 'BLR', batchId: '103', lgId: '1004' };

/** Every endpoint this service talks to, under the one path it owns. */
const BASE = `${API_BASE}/assessments/trainee-status/uploads`;

/** The header the server writes, which is what a downloaded sheet carries. */
const HEADER = [
  'Emp ID',
  'Name',
  'Pre',
  'Current Status',
  'New Status',
  'Effective Date',
  'Remark',
];

/** A row of the template's shape with the columns a spec does not care about blank. */
function row(employeeId: string, status: string, date = '', remark = ''): string[] {
  return [employeeId, 'Aarav Nair', '51 - B1', 'Regular', status, date, remark];
}

describe('TraineeStatusUploadService', () => {
  let service: TraineeStatusUploadService;
  let http: HttpTestingController;
  let download: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    download = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FileDownloadService, useValue: { download } },
      ],
    });
    service = TestBed.inject(TraineeStatusUploadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('templateCsv', () => {
    it('asks for one tab of one group, and hands the file to the browser', () => {
      service.templateCsv(FILTER, 'regular', ['1', '2']).subscribe();

      const request = http.expectOne((candidate) => candidate.url === `${BASE}/template`);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('status')).toBe('regular');
      expect(request.request.params.get('locationId')).toBe('BLR');
      expect(request.request.params.get('batchId')).toBe('103');
      expect(request.request.params.get('lgId')).toBe('1004');
      // Repeated, because one column is written per assessment asked for.
      expect(request.request.params.getAll('examIds')).toEqual(['1', '2']);

      request.flush('Emp ID,Name\n41201,Aarav Nair', {
        headers: {
          'Content-Disposition': 'attachment; filename="trainee-status-template.csv"',
        },
      });

      expect(download).toHaveBeenCalledWith(
        'trainee-status-template.csv',
        'Emp ID,Name\n41201,Aarav Nair',
        expect.stringContaining('text/csv'),
      );
    });

    it('falls back to a sensible name when the server suggests none', () => {
      service.templateCsv(FILTER, 'other', []).subscribe();
      http.expectOne((candidate) => candidate.url === `${BASE}/template`).flush('a,b');

      expect(download).toHaveBeenCalledWith(
        'trainee-status-template.csv',
        'a,b',
        expect.stringContaining('text/csv'),
      );
    });

    it('leaves out the filters the user has not chosen', () => {
      service.templateCsv({ locationId: null, batchId: null, lgId: null }, 'lap', []).subscribe();

      const request = http.expectOne((candidate) => candidate.url === `${BASE}/template`);
      expect(request.request.params.has('locationId')).toBe(false);
      expect(request.request.params.has('batchId')).toBe(false);
      expect(request.request.params.has('lgId')).toBe(false);
      expect(request.request.params.get('status')).toBe('lap');
      request.flush('');
    });
  });

  describe('lookup', () => {
    it('asks what the sheet’s employees hold now', () => {
      let seen: readonly unknown[] = [];
      service.lookup(FILTER, [41201, 41202]).subscribe((group) => (seen = group.trainees));

      const request = http.expectOne((candidate) => candidate.url === `${BASE}/lookup`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ employeeIds: [41201, 41202] });
      expect(request.request.params.get('batchId')).toBe('103');

      request.flush({
        trainees: [
          { employeeId: '41201', name: 'Aarav Nair', status: null, startDate: null },
          { employeeId: '41202', name: 'Meera Iyer', status: 'remedial', startDate: '2026-02-02' },
        ],
      });

      expect(seen).toHaveLength(2);
      expect(seen[1]).toEqual({
        employeeId: '41202',
        name: 'Meera Iyer',
        status: 'remedial',
        startDate: '2026-02-02',
      });
    });

    it('asks the server nothing about nobody', () => {
      let seen: readonly unknown[] = [{ anything: true }];
      service.lookup(FILTER, []).subscribe((group) => (seen = group.trainees));

      http.expectNone(`${BASE}/lookup`);
      expect(seen).toEqual([]);
    });
  });

  describe('preview', () => {
    it('judges the sheet against what the server says each trainee holds', () => {
      let preview: StatusUploadPreview | null = null;
      service
        .preview(FILTER, [
          HEADER,
          row('41202', 'remedial', '2026-06-01', 'Typed again by mistake.'),
        ])
        .subscribe((result) => (preview = result));

      const request = http.expectOne((candidate) => candidate.url === `${BASE}/lookup`);
      expect((request.request.body as { employeeIds: number[] }).employeeIds).toEqual([41202]);
      request.flush({
        trainees: [
          { employeeId: '41202', name: 'Meera Iyer', status: 'remedial', startDate: '2026-02-02' },
        ],
      });

      expect(preview!.readyRows).toBe(0);
      expect(preview!.rows[0].errors[0].code).toBe('already-holds');
    });

    it('dates a blank cell today, the day the dialog judges the sheet on', () => {
      let preview: StatusUploadPreview | null = null;
      service
        .preview(FILTER, [HEADER, row('41201', 'lap', '', 'Needs more than remedial.')])
        .subscribe((result) => (preview = result));

      http
        .expectOne((candidate) => candidate.url === `${BASE}/lookup`)
        .flush({
          trainees: [{ employeeId: '41201', name: 'Aarav Nair', status: null, startDate: null }],
        });

      expect(preview!.rows[0].effectiveDate).toBe(todayIsoDate());
    });

    it('judges a sheet with no usable employee numbers without asking the group', () => {
      // The column checks still run, so the user is told what is wrong with the file
      // rather than with a trainee.
      let preview: StatusUploadPreview | null = null;
      service
        .preview(FILTER, [
          ['Emp ID', 'Name'],
          ['41201', 'Aarav Nair'],
        ])
        .subscribe((result) => (preview = result));

      http.expectNone((candidate) => candidate.url === `${BASE}/lookup`);
      expect(preview!.sheetError).toContain('New Status');
    });
  });

  describe('commit', () => {
    /** A judged row, ready to be committed. */
    const ready: StatusUploadRow = {
      rowNumber: 2,
      employeeId: '41201',
      rosterName: 'Aarav Nair',
      requestedText: 'lap',
      requested: 'lap',
      effectiveDateText: '2026-06-01',
      effectiveDate: '2026-06-01',
      remark: 'Needs more than remedial.',
      errors: [],
      ok: true,
    };

    it('posts the accepted rows and nothing else', () => {
      let updated = -1;
      service
        .commit(FILTER, [
          ready,
          { ...ready, rowNumber: 3, employeeId: '41999', ok: false },
          {
            ...ready,
            rowNumber: 4,
            employeeId: '41203',
            requestedText: '',
            requested: null,
            ok: false,
          },
        ])
        .subscribe((count) => (updated = count));

      const request = http.expectOne(BASE);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        locationId: 'BLR',
        batchId: 103,
        lgId: 1004,
        rows: [
          {
            employeeId: '41201',
            status: 'lap',
            remark: 'Needs more than remedial.',
            effectiveDate: '2026-06-01',
          },
        ],
      });
      request.flush({ updated: 1 });

      expect(updated).toBe(1);
    });

    it('leaves the date to the server when the sheet left it blank', () => {
      // The single-change endpoint already knows what a blank date means, so the rule
      // stays in one place rather than being restated here.
      service
        .commit(FILTER, [{ ...ready, effectiveDateText: '', effectiveDate: todayIsoDate() }])
        .subscribe();

      const request = http.expectOne(BASE);
      const body = request.request.body as { rows: readonly Record<string, unknown>[] };
      expect(body.rows[0]).not.toHaveProperty('effectiveDate');
      request.flush({ updated: 1 });
    });

    it('sends no scope for a filter the caller did not choose', () => {
      service.commit({ locationId: null, batchId: null, lgId: null }, [ready]).subscribe();

      const request = http.expectOne(BASE);
      expect(request.request.body).toEqual({
        locationId: null,
        batchId: null,
        lgId: null,
        rows: [
          {
            employeeId: '41201',
            status: 'lap',
            remark: 'Needs more than remedial.',
            effectiveDate: '2026-06-01',
          },
        ],
      });
      request.flush({ updated: 1 });
    });
  });
});
