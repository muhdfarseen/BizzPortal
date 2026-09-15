import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AssessmentFilter, StatusFilter, todayIsoDate } from '../models/assessment.model';
import { SheetCell } from '../models/sheet.model';
import {
  StatusUploadPreview,
  StatusUploadRow,
  TraineeStatusLookup,
  TraineeStatusRef,
  statusSheetEmployeeIds,
  validateStatusUpload,
} from '../models/trainee-status-upload.model';
import { CSV_MIME_TYPE, FileDownloadService } from './file-download.service';

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

/** A preview of a sheet that could not be read at all. */
function rejected(sheetError: string): StatusUploadPreview {
  return { sheetError, rows: [], readyRows: 0, errorRows: 0, unchangedRows: 0 };
}

/**
 * The bulk status sheet, backed by the API.
 *
 * Reading and judging still happen in the browser, where the file already is — the
 * preview is a convenience for the user — but the template and the judgement it is
 * made against come from the server, and the write is a POST, because the commit is
 * authoritative:
 *
 * - {@link templateCsv} → `GET  /api/assessments/trainee-status/uploads/template`
 * - {@link lookup}      → `POST /api/assessments/trainee-status/uploads/lookup`
 * - {@link commit}      → `POST /api/assessments/trainee-status/uploads`
 */
@Injectable({ providedIn: 'root' })
export class TraineeStatusUploadService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileDownloadService);

  private readonly baseUrl = `${environment.apiBaseUrl}/assessments/trainee-status/uploads`;

  /**
   * Downloads the sheet for one tab of one group and hands it to the browser,
   * keeping the file name the server suggested.
   *
   * @param status the tab to generate for, so a sheet for the Regular tab holds only
   *               regular trainees.
   * @param examIds the assessments whose marks the sheet shows.
   */
  templateCsv(
    filter: AssessmentFilter,
    status: StatusFilter,
    examIds: readonly string[],
  ): Observable<void> {
    let params = new HttpParams().set('status', status);
    if (filter.locationId) {
      params = params.set('locationId', filter.locationId);
    }
    if (filter.batchId) {
      params = params.set('batchId', filter.batchId);
    }
    if (filter.lgId) {
      params = params.set('lgId', filter.lgId);
    }
    for (const examId of examIds) {
      params = params.append('examIds', examId);
    }

    return this.http
      .get(`${this.baseUrl}/template`, { params, observe: 'response', responseType: 'text' })
      .pipe(
        tap((response) => {
          const fileName = suggestedFileName(
            response.headers.get('Content-Disposition'),
            'trainee-status-template.csv',
          );
          this.files.download(fileName, response.body ?? '', CSV_MIME_TYPE);
        }),
        map(() => undefined),
      );
  }

  /**
   * Asks what the sheet's employees hold now.
   *
   * The sheet carries a "Current Status" column, but it is reference text a user can
   * edit or delete, so the preview is judged against the database instead: whether a
   * row asks for the status the trainee already holds, whether it ends a status they
   * do not have, and whether it is dated before the one they are on began.
   */
  lookup(
    filter: AssessmentFilter,
    employeeIds: readonly number[],
  ): Observable<TraineeStatusLookup> {
    if (employeeIds.length === 0) {
      return of({ trainees: [] });
    }
    return this.http
      .post<{ trainees: readonly TraineeStatusRef[] }>(
        `${this.baseUrl}/lookup`,
        { employeeIds },
        {
          params: this.scopeParams(filter),
        },
      )
      .pipe(map((response) => ({ trainees: response.trainees ?? [] })));
  }

  /**
   * Judges a sheet against the group, and against the day it is being uploaded.
   *
   * The employees the sheet names are looked up in one request, so a preview costs
   * one round trip whether the sheet holds four rows or four hundred.
   */
  preview(
    filter: AssessmentFilter,
    sheet: readonly (readonly SheetCell[])[],
  ): Observable<StatusUploadPreview> {
    const employeeIds = statusSheetEmployeeIds(sheet);
    if (employeeIds.length === 0) {
      // Nothing to look up: the column checks still run, and a sheet with no usable
      // employee numbers is judged without asking the server about nobody.
      return of(
        validateStatusUpload({ rows: sheet, group: { trainees: [] }, today: todayIsoDate() }),
      );
    }

    return this.lookup(filter, employeeIds).pipe(
      map((group) => validateStatusUpload({ rows: sheet, group, today: todayIsoDate() })),
    );
  }

  /**
   * Writes the accepted rows and returns how many statuses changed. Only rows that
   * passed are sent; the server refuses the whole sheet if any of them is a problem,
   * so a partial write is not possible.
   */
  commit(filter: AssessmentFilter, rows: readonly StatusUploadRow[]): Observable<number> {
    const body = {
      locationId: filter.locationId,
      batchId: numericOrNull(filter.batchId),
      lgId: numericOrNull(filter.lgId),
      rows: rows
        .filter((row) => row.ok && row.requested !== null)
        .map((row) => ({
          employeeId: row.employeeId,
          status: row.requested,
          remark: row.remark,
          ...(row.effectiveDateText === '' ? {} : { effectiveDate: row.effectiveDate }),
        })),
    };

    return this.http
      .post<{ updated: number }>(this.baseUrl, body)
      .pipe(map((response) => response.updated));
  }

  private scopeParams(filter: AssessmentFilter): HttpParams {
    let params = new HttpParams();
    if (filter.locationId) {
      params = params.set('locationId', filter.locationId);
    }
    if (filter.batchId) {
      params = params.set('batchId', filter.batchId);
    }
    if (filter.lgId) {
      params = params.set('lgId', filter.lgId);
    }
    return params;
  }
}
