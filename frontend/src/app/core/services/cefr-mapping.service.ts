import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  CefrColor,
  CefrScoreBand,
  DEFAULT_CEFR_MAPPING,
  cefrColor,
  cefrFromScore,
} from '../models/assessment.model';

/** A mutable copy of the shipped mapping, so callers can edit it in place. */
function defaultBands(): CefrScoreBand[] {
  return DEFAULT_CEFR_MAPPING.map((band) => ({ ...band }));
}

/**
 * The score → CEFR mapping admins configure on the Configuration screen.
 *
 * Loaded from `GET /api/configuration/cefr-mapping` and replaced wholesale by
 * `PUT /api/configuration/cefr-mapping`. The shipped Versant mapping is the
 * initial value so a badge renders before the request settles; the API's
 * mapping takes over as soon as it arrives.
 *
 * Scoring derives its levels from here (see {@link AssessmentService}), so a
 * saved mapping takes effect the next time results are read.
 */
@Injectable({ providedIn: 'root' })
export class CefrMappingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/configuration`;

  private readonly _bands = signal<readonly CefrScoreBand[]>(defaultBands());
  private loaded = false;

  /** The active mapping, lowest band first. */
  readonly bands = this._bands.asReadonly();

  /** Whether the active mapping still matches the shipped Versant default. */
  readonly isDefault = computed(
    () => JSON.stringify(this._bands()) === JSON.stringify(DEFAULT_CEFR_MAPPING),
  );

  constructor() {
    this.load().subscribe({ error: () => undefined });
  }

  /** Reads the configured mapping from the API. */
  load(force = false): Observable<readonly CefrScoreBand[]> {
    if (this.loaded && !force) {
      return new Observable((subscriber) => {
        subscriber.next(this._bands());
        subscriber.complete();
      });
    }
    return this.http.get<readonly CefrScoreBand[]>(`${this.baseUrl}/cefr-mapping`).pipe(
      tap((bands) => {
        this.loaded = true;
        this._bands.set(bands.map((band) => ({ ...band })));
      }),
      map(() => this._bands()),
    );
  }

  /** Replaces the active mapping with the admin's saved bands. */
  save(bands: readonly CefrScoreBand[]): Observable<readonly CefrScoreBand[]> {
    const payload = bands.map((band) => ({ ...band }));
    return this.http.put<readonly CefrScoreBand[]>(`${this.baseUrl}/cefr-mapping`, payload).pipe(
      tap((saved) => {
        this.loaded = true;
        this._bands.set(saved.map((band) => ({ ...band })));
      }),
      map(() => this._bands()),
    );
  }

  /** Restores the shipped Versant mapping. */
  reset(): void {
    this._bands.set(defaultBands());
  }

  /** The CEFR level a score is awarded under the active mapping. */
  levelFor(score: number): string {
    return cefrFromScore(score, this._bands());
  }

  /** The badge colour configured for a level, or the neutral fallback. */
  colorFor(level: string | null | undefined): CefrColor {
    const band = this._bands().find((candidate) => candidate.level === level);
    return cefrColor(band?.color);
  }
}
