import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AssessmentExam,
  AssessmentFilter,
  AssessmentResult,
  DEFAULT_MAX_SCORE,
  LapRemedialStatus,
  TraineeAssessment,
  TraineeLookup,
} from '../models/assessment.model';
import { Page, PagedQuery, pagedParams } from '../models/page.model';
import { CefrMappingService } from './cefr-mapping.service';

/** An assessment as `GET /api/configuration/assessments` returns it. */
interface ApiAssessment {
  id: string;
  name: string;
  description?: string;
  maxScore: number;
  sortOrder?: number;
  status?: string;
}

/** Lifecycle state of an assessment: retired, or in use. */
export type AssessmentStatus = 'active' | 'inactive';

/** An assessment as the Configuration screen edits it. */
export interface AssessmentConfigEntry {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  sortOrder: number;
  status: AssessmentStatus;
}

/** One scored exam on a trainee's row. */
interface ApiTraineeResult {
  score: number | null;
  cefr?: string | null;
}

/** A trainee row as `GET /api/assessments/trainees` returns it. */
interface ApiTraineeAssessment {
  employeeId: string;
  name: string;
  results: Record<string, ApiTraineeResult>;
  status?: string | null;
  startDate?: string | null;
  closeDate?: string | null;
  remark?: string | null;
}

/** A trainee as `POST /api/assessments/trainees/lookup` answers it. */
interface ApiTraineeRef {
  employeeId: string;
  name: string;
}

/** The lookup's envelope, before its ids are normalised to strings. */
interface ApiTraineeLookup {
  groupSize: number;
  trainees: readonly ApiTraineeRef[];
}

/**
 * The roster query, which adds the LAP / Remedial tab to the shared paging
 * inputs: the tab is a server-side filter, so it belongs with `search` rather
 * than with the group the page is scoped to.
 */
export interface TraineeQuery extends PagedQuery {
  /** Keeps only trainees on this track; omit for every track. */
  status?: LapRemedialStatus;
}

/** Adds only the narrowing parameters the filter actually sets. */
function filterParams(filter: AssessmentFilter): HttpParams {
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

/**
 * Assessment data access, backed by the API.
 *
 * - {@link exams}        ← `GET /api/configuration/assessments/active`
 * - {@link getTrainees}  ← `GET /api/assessments/trainees?locationId=…`
 * - {@link lookupTrainees} → `POST /api/assessments/trainees/lookup`
 * - {@link saveResults}  → `PATCH /api/assessments/trainees/:employeeId`
 * - {@link saveLapRemedial} → `PATCH /api/assessments/trainees/:employeeId/lap-remedial`
 *
 * The server derives every CEFR level, so a saved score is never sent with one.
 * Rosters are not cached here: the API pages, searches and sorts them, so a
 * whole-group copy would be both stale and misleading — the caller keeps the
 * one page it is showing and re-reads it after a change.
 */
@Injectable({ providedIn: 'root' })
export class AssessmentService {
  private readonly http = inject(HttpClient);
  private readonly cefrMapping = inject(CefrMappingService);

  private readonly baseUrl = `${environment.apiBaseUrl}`;

  private readonly _exams = signal<readonly AssessmentExam[]>([]);
  private readonly _allExams = signal<readonly AssessmentConfigEntry[]>([]);

  /** The exams configured for the portal — one table column each. */
  readonly exams = this._exams.asReadonly();

  /** Every assessment, retired ones included — what Configuration edits. */
  readonly allExams = this._allExams.asReadonly();

  constructor() {
    this.loadExams().subscribe({ error: () => undefined });
  }

  /** The CEFR level a score is awarded under the configured mapping. */
  levelFor(score: number): string {
    return this.cefrMapping.levelFor(score);
  }

  /** Reads the scoreable assessments, in configured order. */
  loadExams(): Observable<readonly AssessmentExam[]> {
    return this.http
      .get<readonly ApiAssessment[]>(`${this.baseUrl}/configuration/assessments/active`)
      .pipe(
        map((assessments) =>
          [...assessments]
            .sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0))
            .map((assessment) => ({
              id: String(assessment.id),
              name: assessment.name,
              maxScore: assessment.maxScore,
            })),
        ),
        tap((exams) => this._exams.set(exams)),
        map(() => this._exams()),
      );
  }

  /** Reads every assessment, retired ones included, for the Configuration screen. */
  loadAllExams(): Observable<readonly AssessmentConfigEntry[]> {
    return this.http
      .get<readonly ApiAssessment[]>(`${this.baseUrl}/configuration/assessments`)
      .pipe(
        map((assessments) =>
          [...assessments]
            .sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0))
            .map(toConfigEntry),
        ),
        tap((assessments) => this._allExams.set(assessments)),
        map(() => this._allExams()),
      );
  }

  /** Adds an assessment and refreshes both lists. */
  createExam(
    name: string,
    description: string,
    maxScore: number = DEFAULT_MAX_SCORE,
  ): Observable<readonly AssessmentConfigEntry[]> {
    return this.http
      .post<ApiAssessment>(`${this.baseUrl}/configuration/assessments`, {
        name: name.trim(),
        description: description.trim(),
        maxScore,
      })
      .pipe(
        tap(() => {
          this.loadAllExams().subscribe({ error: () => undefined });
          this.loadExams().subscribe({ error: () => undefined });
        }),
        map(() => this._allExams()),
      );
  }

  /**
   * Updates an assessment and refreshes both lists.
   *
   * `status` is only sent when given: the API reads an omitted status as "leave
   * it alone", so editing a retired assessment's name does not quietly bring it
   * back into use.
   */
  updateExam(
    id: string,
    name: string,
    description: string,
    maxScore: number = DEFAULT_MAX_SCORE,
    status?: AssessmentStatus,
  ): Observable<readonly AssessmentConfigEntry[]> {
    return this.http
      .put<ApiAssessment>(`${this.baseUrl}/configuration/assessments/${encodeURIComponent(id)}`, {
        name: name.trim(),
        description: description.trim(),
        maxScore,
        ...(status ? { status } : {}),
      })
      .pipe(
        tap(() => {
          this.loadAllExams().subscribe({ error: () => undefined });
          this.loadExams().subscribe({ error: () => undefined });
        }),
        map(() => this._allExams()),
      );
  }

  /** Deletes an assessment that has never been used. */
  deleteExam(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/configuration/assessments/${encodeURIComponent(id)}`)
      .pipe(
        tap(() => {
          this.loadAllExams().subscribe({ error: () => undefined });
          this.loadExams().subscribe({ error: () => undefined });
        }),
      );
  }

  /**
   * One page of the filtered group's trainees, with their per-exam results.
   *
   * The search, track filter and order are applied by the server alongside the
   * page, so they narrow the whole group rather than the page on screen.
   */
  getTrainees(
    filter: AssessmentFilter,
    query: TraineeQuery = {},
  ): Observable<Page<TraineeAssessment>> {
    let params = pagedParams(query, filterParams(filter));
    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http
      .get<Page<ApiTraineeAssessment>>(`${this.baseUrl}/assessments/trainees`, { params })
      .pipe(
        map((page) => ({
          ...page,
          items: page.items.map(toTraineeAssessment),
        })),
      );
  }

  /**
   * Resolves employee numbers against one group, for a bulk upload preview.
   *
   * A POST because a sheet's worth of numbers would overflow a query string,
   * and only the requested ids that are in the group come back — the preview
   * judges a sheet without downloading the roster it was made for.
   */
  lookupTrainees(
    filter: AssessmentFilter,
    employeeIds: readonly number[],
  ): Observable<TraineeLookup> {
    return this.http
      .post<ApiTraineeLookup>(
        `${this.baseUrl}/assessments/trainees/lookup`,
        { employeeIds },
        { params: filterParams(filter) },
      )
      .pipe(
        map((lookup) => ({
          groupSize: lookup.groupSize,
          trainees: lookup.trainees.map((trainee) => ({
            employeeId: String(trainee.employeeId),
            name: trainee.name,
          })),
        })),
      );
  }

  /**
   * Stores edited results for one trainee. Only the score is sent: the backend
   * derives the CEFR level itself and ignores any client-supplied one.
   * `null` clears a result.
   */
  saveResults(
    employeeId: string,
    results: Record<string, AssessmentResult | undefined>,
  ): Observable<void> {
    const known = new Set(this._exams().map((exam) => exam.id));
    const payload: Record<string, { score: number | null }> = {};
    for (const [examId, result] of Object.entries(results)) {
      if (!known.has(examId)) {
        continue;
      }
      payload[examId] = { score: result ? result.score : null };
    }

    return this.http.patch<void>(
      `${this.baseUrl}/assessments/trainees/${encodeURIComponent(employeeId)}`,
      { results: payload },
    );
  }

  /**
   * Moves a trainee onto (or off) a LAP / Remedial track. `status: 'none'`
   * closes the open track.
   */
  saveLapRemedial(
    employeeId: string,
    status: LapRemedialStatus,
    remark: string,
    startDate?: string,
    closeDate?: string,
  ): Observable<void> {
    const body: Record<string, string> = { status, remark: remark.trim() };
    if (startDate) {
      body['startDate'] = startDate;
    }
    if (closeDate) {
      body['closeDate'] = closeDate;
    }

    return this.http.patch<void>(
      `${this.baseUrl}/assessments/trainees/${encodeURIComponent(employeeId)}/lap-remedial`,
      body,
    );
  }
}

/** Maps one API row onto the Configuration screen's view model. */
function toConfigEntry(assessment: ApiAssessment): AssessmentConfigEntry {
  return {
    id: String(assessment.id),
    name: assessment.name,
    description: assessment.description ?? '',
    maxScore: assessment.maxScore,
    sortOrder: assessment.sortOrder ?? 0,
    status: assessment.status === 'inactive' ? 'inactive' : 'active',
  };
}

/** Maps one API row onto the frontend's {@link TraineeAssessment}. */
function toTraineeAssessment(api: ApiTraineeAssessment): TraineeAssessment {
  const results: Record<string, AssessmentResult | undefined> = {};
  for (const [examId, result] of Object.entries(api.results ?? {})) {
    if (result.score === null || result.score === undefined) {
      continue;
    }
    results[examId] = { score: result.score, cefr: result.cefr ?? '' };
  }

  return {
    employeeId: String(api.employeeId),
    name: api.name,
    results,
    status: (api.status as LapRemedialStatus | undefined) ?? undefined,
    startDate: api.startDate ?? undefined,
    closeDate: api.closeDate ?? undefined,
    remark: api.remark ?? undefined,
  };
}
