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

/**
 * A real .xlsx workbook (header row plus one trainee), base64-encoded so the
 * spec needs no filesystem access. Generated once with a zip writer; the
 * numeric score 70 is stored as a number, as Excel stores a typed score.
 */
const XLSX_BASE64 =
  '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';

/** Decodes the workbook into the bytes a file input would hand over. */
function xlsxBytes(): ArrayBuffer {
  const binary = atob(XLSX_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

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

  it('reads a CSV file into a matrix of cells', async () => {
    const file = new File(['Emp ID,Name,Score\r\n41201,Aarav Nair,45'], 'scores.csv', {
      type: 'text/csv',
    });

    expect(await service.readSheet(file)).toEqual([
      ['Emp ID', 'Name', 'Score'],
      ['41201', 'Aarav Nair', '45'],
    ]);
  });

  it('refuses a file that is neither CSV nor Excel', async () => {
    const file = new File(['%PDF-1.4'], 'scores.pdf');

    await expect(service.readSheet(file)).rejects.toThrow('is not a CSV or Excel file');
  });

  it('reads an Excel workbook, keeping scores as numbers', async () => {
    const file = new File([xlsxBytes()], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(await service.readSheet(file)).toEqual([
      ['Emp ID', 'Name', 'Score'],
      ['EMP-1', 'Aarav Nair', 70],
    ]);
  });

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
    service.commit(FILTER, '1', preview.rows).subscribe((count) => (saved = count));

    const upload = http.expectOne(`${API_BASE}/assessments/uploads`);
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body).toEqual({
      examId: '1',
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
      .commit(FILTER, '1', [
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
      ])
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
      .commit(FILTER, '1', [
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
      ])
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
