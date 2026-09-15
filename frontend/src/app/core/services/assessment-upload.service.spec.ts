import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AssessmentFilter, cefrFromScore } from '../models/assessment.model';
import { UploadPreview } from '../models/assessment-upload.model';
import { AssessmentUploadService } from './assessment-upload.service';
import { FileDownloadService } from './file-download.service';
import {
  API_BASE,
  ApiTraineeFixture,
  flushCefr,
  flushExams,
  traineeRows,
} from '../../testing/api-testing';

const FILTER: AssessmentFilter = { locationId: 'BLR', batchId: '103', lgId: '1004' };

const ROSTER: readonly ApiTraineeFixture[] = traineeRows(2);

describe('AssessmentUploadService', () => {
  let service: AssessmentUploadService;
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
    service = TestBed.inject(AssessmentUploadService);
    http = TestBed.inject(HttpTestingController);
    // The two services behind this one read their configuration on construction.
    flushExams(http);
    flushCefr(http);
  });

  afterEach(() => http.verify());

  /** The lookup a preview makes, so its body can be asserted before it is flushed. */
  function lookupRequest() {
    return http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees/lookup`,
    );
  }

  it('downloads the server-generated template for the group and assessment', () => {
    service.templateCsv(FILTER, '1').subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/uploads/template`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('examId')).toBe('1');
    expect(request.request.params.get('locationId')).toBe('BLR');
    expect(request.request.params.get('batchId')).toBe('103');
    expect(request.request.params.get('lgId')).toBe('1004');

    request.flush('Emp ID,Name,Score\r\n41201,Aarav Nair,34\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="assessment-template.csv"' },
    });

    expect(download).toHaveBeenCalledWith(
      'assessment-template.csv',
      'Emp ID,Name,Score\r\n41201,Aarav Nair,34\r\n',
      'text/csv;charset=utf-8',
    );
  });

  it('validates a sheet against the group the lookup answers with', () => {
    const [trainee] = ROSTER;

    let validRows = -1;
    let cefr: string | null = null;
    service
      .preview(FILTER, '1', [
        ['Emp ID', 'Name', 'Score'],
        [trainee.employeeId, trainee.name, '70'],
      ])
      .subscribe((preview) => {
        validRows = preview.validRows;
        cefr = preview.rows[0].cefr;
      });

    // Only the number the sheet named is asked about — never the whole group.
    const request = lookupRequest();
    expect((request.request.body as { employeeIds: number[] }).employeeIds).toEqual([
      Number(trainee.employeeId),
    ]);
    request.flush({ groupSize: ROSTER.length, trainees: [{ ...trainee }] });

    expect(validRows).toBe(1);
    expect(cefr).toBe(cefrFromScore(70));
  });

  it('rejects a sheet validated against an assessment that is not configured', () => {
    let sheetError: string | null = null;
    service.preview(FILTER, 'unknown-exam', [['Emp ID', 'Name', 'Score']]).subscribe((preview) => {
      sheetError = preview.sheetError;
    });

    http.expectNone((candidate) => candidate.url === `${API_BASE}/assessments/trainees/lookup`);
    expect(sheetError).toContain('Choose an assessment');
  });

  it('refuses ids that are not in the selected group', () => {
    let preview: { validRows: number; rows: readonly { errors: readonly { code: string }[] }[] } = {
      validRows: -1,
      rows: [],
    };
    service
      .preview(FILTER, '1', [
        ['Emp ID', 'Name', 'Score'],
        ['99999', 'Nobody', '40'],
      ])
      .subscribe((result) => (preview = result));

    const request = lookupRequest();
    expect((request.request.body as { employeeIds: number[] }).employeeIds).toEqual([99999]);
    request.flush({ groupSize: ROSTER.length, trainees: [] });

    expect(preview.validRows).toBe(0);
    expect(preview.rows[0].errors[0].code).toBe('unknown-empid');
  });

  it('posts the accepted rows and skips the rejected ones', () => {
    const [trainee] = ROSTER;

    let preview: UploadPreview = {
      sheetError: null,
      rows: [],
      validRows: 0,
      errorRows: 0,
      missingFromSheet: 0,
    };
    service
      .preview(FILTER, '1', [
        ['Emp ID', 'Name', 'Score'],
        [trainee.employeeId, trainee.name, '70'],
        ['99999', 'Nobody', '40'],
      ])
      .subscribe((result) => (preview = result));

    const request = lookupRequest();
    expect((request.request.body as { employeeIds: number[] }).employeeIds).toEqual([
      Number(trainee.employeeId),
      99999,
    ]);
    request.flush({ groupSize: ROSTER.length, trainees: [{ ...trainee }] });
    expect(preview.validRows).toBe(1);

    let saved = -1;
    service.commit(FILTER, '1', preview.rows, '2026-05-04').subscribe((count) => (saved = count));

    const upload = http.expectOne(`${API_BASE}/assessments/uploads`);
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body).toEqual({
      examId: '1',
      assessedOn: '2026-05-04',
      locationId: 'BLR',
      batchId: 103,
      lgId: 1004,
      rows: [{ employeeId: trainee.employeeId, score: 70 }],
    });
    upload.flush({ saved: 1 });

    expect(saved).toBe(1);
  });

  it('names the assessment being uploaded, so no other result is touched', () => {
    const [trainee] = ROSTER;

    service
      .commit(
        FILTER,
        '1',
        [
          {
            rowNumber: 2,
            employeeId: trainee.employeeId,
            name: trainee.name,
            rosterName: trainee.name,
            score: '70',
            cefr: cefrFromScore(70),
            ok: true,
            errors: [],
            warnings: [],
          },
        ],
        '2026-05-04',
      )
      .subscribe();

    const request = http.expectOne(`${API_BASE}/assessments/uploads`);
    const body = request.request.body as { examId: string; rows: readonly unknown[] };
    expect(body.examId).toBe('1');
    expect(JSON.stringify(body)).not.toContain('"2"');
    request.flush({ saved: 1 });
  });

  it('reports how many of the group the sheet left out from the group size', () => {
    const [trainee] = ROSTER;

    let missingFromSheet = -1;
    service
      .preview(FILTER, '1', [
        ['Emp ID', 'Name', 'Score'],
        [trainee.employeeId, trainee.name, '70'],
      ])
      .subscribe((preview) => (missingFromSheet = preview.missingFromSheet));

    // The lookup sends only the ids it found, so the count of the whole group
    // is the only thing that can say the other 249 were not in the sheet.
    lookupRequest().flush({ groupSize: 250, trainees: [{ ...trainee }] });

    expect(missingFromSheet).toBe(249);
  });

  it('explains a sheet that is missing the Score column without asking the group', () => {
    let sheetError: string | null = null;
    service
      .preview(FILTER, '1', [
        ['Emp ID', 'Name'],
        [ROSTER[0].employeeId, ROSTER[0].name],
      ])
      .subscribe((preview) => (sheetError = preview.sheetError));

    // The employee-id column cannot be read either, so there is nothing to look up.
    http.expectNone((candidate) => candidate.url === `${API_BASE}/assessments/trainees/lookup`);

    expect(sheetError).toContain('Score');
  });

  it('surfaces the API error when an upload is rejected', () => {
    let status = 0;
    let message = '';
    service
      .commit(
        FILTER,
        '1',
        [
          {
            rowNumber: 2,
            employeeId: ROSTER[0].employeeId,
            name: ROSTER[0].name,
            rosterName: ROSTER[0].name,
            score: '70',
            cefr: null,
            ok: true,
            errors: [],
            warnings: [],
          },
        ],
        '2026-05-04',
      )
      .subscribe({
        error: (error: HttpErrorResponse) => {
          status = error.status;
          message = error.error?.message ?? '';
        },
      });

    http.expectOne(`${API_BASE}/assessments/uploads`).flush(
      {
        timestamp: '2026-09-13T09:32:09.844162Z',
        status: 400,
        error: 'Bad Request',
        message: 'Row 2 could not be saved.',
        path: '/api/assessments/uploads',
        fieldErrors: [{ field: 'rows[1].employeeId', message: 'Unknown trainee.' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(status).toBe(400);
    expect(message).toContain('Row 2');
  });
});
