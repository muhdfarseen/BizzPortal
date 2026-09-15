import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AssessmentExam, AssessmentFilter } from '../models/assessment.model';
import {
  UploadPreview,
  UploadPreviewRow,
  sheetEmployeeIds,
  validateUpload,
} from '../models/assessment-upload.model';
import { SheetCell } from '../models/sheet.model';
import { AssessmentService } from './assessment.service';
import { CefrMappingService } from './cefr-mapping.service';
import { CSV_MIME_TYPE, FileDownloadService } from './file-download.service';

/** A preview of a sheet that could not be read at all. */
function rejected(sheetError: string): UploadPreview {
  return { sheetError, rows: [], validRows: 0, errorRows: 0, missingFromSheet: 0 };
}

/** The file name a `Content-Disposition` header suggests, when it carries one. */
function suggestedFileName(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1]?.trim() || fallback;
}

/** A numeric id as the API expects it, or `null` when the value is not numeric. */
function numericOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Bulk score upload, backed by the API.
 *
 * Reading and validating still happen in the browser, where the file already is
 * — the preview is a convenience for the user — but the template comes from the
 * server and the write is a POST, because the commit is authoritative:
 *
 * - {@link templateCsv} → `GET /api/assessments/uploads/template?examId=…`
 * - {@link commit}      → `POST /api/assessments/uploads`
 */
@Injectable({ providedIn: 'root' })
export class AssessmentUploadService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileDownloadService);
  private readonly assessments = inject(AssessmentService);
  private readonly cefrMapping = inject(CefrMappingService);

  private readonly baseUrl = `${environment.apiBaseUrl}/assessments/uploads`;

  /**
   * Downloads the server-generated template for one assessment and hands it to
   * the browser, keeping the file name the server suggested.
   */
  templateCsv(filter: AssessmentFilter, examId: string): Observable<void> {
    let params = new HttpParams().set('examId', examId);
    if (filter.locationId) {
      params = params.set('locationId', filter.locationId);
    }
    if (filter.batchId) {
      params = params.set('batchId', filter.batchId);
    }
    if (filter.lgId) {
      params = params.set('lgId', filter.lgId);
    }

    return this.http
      .get(`${this.baseUrl}/template`, { params, observe: 'response', responseType: 'text' })
      .pipe(
        tap((response) => {
          const fileName = suggestedFileName(
            response.headers.get('Content-Disposition'),
            'assessment-template.csv',
          );
          this.files.download(fileName, response.body ?? '', CSV_MIME_TYPE);
        }),
        map(() => undefined),
      );
  }

  /**
   * Validates a sheet against the group and the assessment it was read for.
   *
   * The group is asked only about the employee numbers the sheet names, so a
   * preview costs one lookup no matter how large the roster is, and the count it
   * answers with is what reports the trainees the sheet left out.
   */
  preview(
    filter: AssessmentFilter,
    examId: string,
    sheet: readonly (readonly SheetCell[])[],
  ): Observable<UploadPreview> {
    const exam = this.examById(examId);
    if (!exam) {
      return of(rejected('Choose an assessment before uploading.'));
    }

    const employeeIds = sheetEmployeeIds(sheet);
    const levelFor = (score: number) => this.cefrMapping.levelFor(score);
    // A sheet with nothing to look up is judged against an empty group: the
    // column and score checks still run, and no request is made for no ids.
    if (employeeIds.length === 0) {
      return of(
        validateUpload({
          rows: sheet,
          group: { groupSize: 0, trainees: [] },
          exam,
          levelFor,
        }),
      );
    }

    return this.assessments.lookupTrainees(filter, employeeIds).pipe(
      map((group) =>
        validateUpload({
          rows: sheet,
          group,
          exam,
          levelFor,
        }),
      ),
    );
  }

  /**
   * Writes the accepted rows as this assessment's results and returns how many
   * were stored. Only rows that passed validation are sent; the server refuses
   * the whole sheet if any of them is a problem, so a partial write is not
   * possible.
   *
   * @param assessedOn ISO date the exam was conducted, recorded against every row
   *                   of the sheet.
   */
  commit(
    filter: AssessmentFilter,
    examId: string,
    rows: readonly UploadPreviewRow[],
    assessedOn: string,
  ): Observable<number> {
    const body = {
      examId,
      assessedOn,
      locationId: filter.locationId,
      batchId: numericOrNull(filter.batchId),
      lgId: numericOrNull(filter.lgId),
      rows: rows
        .filter((row) => row.ok && row.cefr !== null)
        .map((row) => ({ employeeId: row.employeeId, score: Number(row.score) })),
    };

    return this.http
      .post<{ saved: number }>(this.baseUrl, body)
      .pipe(map((response) => response.saved));
  }

  private examById(examId: string): AssessmentExam | undefined {
    return this.assessments.exams().find((exam) => exam.id === examId);
  }
}
