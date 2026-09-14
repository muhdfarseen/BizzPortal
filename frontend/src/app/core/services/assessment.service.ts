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
} from '../models/assessment.model';
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

/** An assessment as the Configuration screen edits it. */
export interface AssessmentConfigEntry {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  sortOrder: number;
  status: string;
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

/** Cache key of a filter — the same group always maps to the same key. */
function filterKey(filter: AssessmentFilter): string {
  return [filter.locationId ?? '*', filter.batchId ?? '*', filter.lgId ?? '*'].join('|');
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
 * - {@link saveResults}  → `PATCH /api/assessments/trainees/:employeeId`
 * - {@link saveLapRemedial} → `PATCH /api/assessments/trainees/:employeeId/lap-remedial`
 *
 * The server derives every CEFR level, so a saved score is never sent with one.
 * The most recent roster of each filter is cached, which is what the bulk upload
 * dialog validates its preview against.
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

  /** Rosters of the filters searched so far, keyed by {@link filterKey}. */
  private readonly rosters = new Map<string, readonly TraineeAssessment[]>();

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

  /** Updates an assessment and refreshes both lists. */
  updateExam(
    id: string,
    name: string,
    description: string,
    maxScore: number = DEFAULT_MAX_SCORE,
  ): Observable<readonly AssessmentConfigEntry[]> {
    return this.http
      .put<ApiAssessment>(`${this.baseUrl}/configuration/assessments/${encodeURIComponent(id)}`, {
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

  /** The trainees of the filtered group, with their per-exam results. */
  getTrainees(filter: AssessmentFilter): Observable<readonly TraineeAssessment[]> {
    return this.http
      .get<readonly ApiTraineeAssessment[]>(`${this.baseUrl}/assessments/trainees`, {
        params: filterParams(filter),
      })
      .pipe(
        map((trainees) => trainees.map(toTraineeAssessment)),
        tap((trainees) => this.rosters.set(filterKey(filter), trainees)),
      );
  }

  /** The roster of a filter as last loaded, or an empty list when it never was. */
  cachedTrainees(filter: AssessmentFilter): readonly TraineeAssessment[] {
    return this.rosters.get(filterKey(filter)) ?? [];
  }

  /**
   * Stores edited results for one trainee. Only the score is sent: the backend
   * derives the CEFR level itself and ignores any client-supplied one.
   * `null` clears a result.
   */
  saveResults(
    filter: AssessmentFilter,
    employeeId: string,
    results: Record<string, AssessmentResult | undefined>,
  ): Observable<void> {
    const known = new Set(this._exams().map((exam) => exam.id));
    const payload: Record<string, { score: number | null }> = {};
    const saved: Record<string, AssessmentResult | undefined> = {};
    for (const [examId, result] of Object.entries(results)) {
      if (!known.has(examId)) {
        continue;
      }
      payload[examId] = { score: result ? result.score : null };
      saved[examId] = result;
    }

    return this.http
      .patch<void>(`${this.baseUrl}/assessments/trainees/${encodeURIComponent(employeeId)}`, {
        results: payload,
      })
      .pipe(tap(() => this.applyLocalResults(filter, employeeId, saved)));
  }

  /**
   * Moves a trainee onto (or off) a LAP / Remedial track. `status: 'none'`
   * closes the open track.
   */
  saveLapRemedial(
    filter: AssessmentFilter,
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

    return this.http
      .patch<void>(
        `${this.baseUrl}/assessments/trainees/${encodeURIComponent(employeeId)}/lap-remedial`,
        body,
      )
      .pipe(
        tap(() => this.applyLocalTrack(filter, employeeId, status, remark, startDate, closeDate)),
      );
  }

  /** Merges a saved score into the cached roster so the table updates at once. */
  private applyLocalResults(
    filter: AssessmentFilter,
    employeeId: string,
    results: Record<string, AssessmentResult | undefined>,
  ): void {
    const roster = this.rosters.get(filterKey(filter));
    if (!roster) {
      return;
    }
    const next = roster.map((trainee) => {
      if (trainee.employeeId !== employeeId) {
        return trainee;
      }
      const merged = { ...trainee.results };
      for (const [examId, result] of Object.entries(results)) {
        if (result) {
          merged[examId] = { score: result.score, cefr: this.cefrMapping.levelFor(result.score) };
        } else {
          delete merged[examId];
        }
      }
      return { ...trainee, results: merged };
    });
    this.rosters.set(filterKey(filter), next);
  }

  /** Applies a track change to the cached roster. */
  private applyLocalTrack(
    filter: AssessmentFilter,
    employeeId: string,
    status: LapRemedialStatus,
    remark: string,
    startDate?: string,
    closeDate?: string,
  ): void {
    const roster = this.rosters.get(filterKey(filter));
    if (!roster) {
      return;
    }
    const next = roster.map((trainee) =>
      trainee.employeeId === employeeId
        ? {
            ...trainee,
            status,
            remark: remark.trim(),
            startDate: status === 'none' ? undefined : startDate,
            closeDate: status === 'none' ? closeDate : undefined,
          }
        : trainee,
    );
    this.rosters.set(filterKey(filter), next);
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
    status: assessment.status ?? 'active',
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
