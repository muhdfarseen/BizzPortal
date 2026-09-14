import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/** The headline counters of `GET /api/dashboard/summary`. */
export interface DashboardTotals {
  trainees: number;
  batches: number;
  regular: number;
  remedial: number;
  lap: number;
}

/** One location's contribution to the summary. */
export interface DashboardLocation {
  locationId: string;
  locationName: string;
  totalBatch: number;
  totalTrainee: number;
  remedialCount: number;
  lapCount: number;
}

/** The dashboard figures for the current selection. */
export interface DashboardSummary {
  totals: DashboardTotals;
  locations: readonly DashboardLocation[];
}

/** The group the summary is narrowed to; omitted fields mean "everything visible". */
export interface DashboardFilter {
  locationId?: string | null;
  batchId?: string | null;
  lgId?: string | null;
}

const EMPTY_SUMMARY: DashboardSummary = {
  totals: { trainees: 0, batches: 0, regular: 0, remedial: 0, lap: 0 },
  locations: [],
};

/**
 * The dashboard home page's figures, read from the API.
 *
 * Every count comes from the server rather than being assembled here from a
 * trainee list. The dashboard is the first screen a user sees, and if its numbers
 * were derived independently of the assessment tables the two would eventually
 * disagree — and the ones people quote in meetings would be the wrong ones.
 *
 * The endpoint applies the caller's role scope itself, so a Location Admin's
 * dashboard counts their locations and nothing else without this service having to
 * filter. Filtering here would be a second, weaker copy of a server rule.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  private readonly _summary = signal<DashboardSummary>(EMPTY_SUMMARY);
  private readonly _loading = signal(false);
  private readonly _failed = signal(false);

  /** The most recently loaded figures. */
  readonly summary = this._summary.asReadonly();

  /** Whether a load is in flight. */
  readonly loading = this._loading.asReadonly();

  /** Whether the last load failed, so the page can say so instead of showing zeroes. */
  readonly failed = this._failed.asReadonly();

  /** Loads the figures for a selection and caches them for the signals above. */
  load(filter: DashboardFilter = {}): Observable<DashboardSummary> {
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

    this._loading.set(true);
    this._failed.set(false);

    return this.http
      .get<DashboardSummary>(`${environment.apiBaseUrl}/dashboard/summary`, { params })
      .pipe(
        tap({
          next: (summary) => {
            this._summary.set(summary);
            this._loading.set(false);
          },
          error: () => {
            // Zeroes would read as "no trainees", which is a different claim from
            // "we could not find out".
            this._failed.set(true);
            this._loading.set(false);
          },
        }),
      );
  }
}
