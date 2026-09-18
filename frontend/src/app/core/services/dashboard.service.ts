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
  /**
   * The period the page is looking at: only a batch that began in this year and
   * quarter is counted.
   *
   * Sent alongside the group rather than instead of it, because the two narrow
   * different things: with no batch chosen, the period is what makes "all batches"
   * mean the batches of the quarter on screen.
   */
  year?: number | null;
  quarter?: number | null;
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
 *
 * The period the filter bar leads with is sent the same way, and for the same
 * reason: which quarter a batch began in is a property of the batch, and the server
 * is the only side that holds every batch rather than the ones already on screen.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  private readonly _summary = signal<DashboardSummary>(EMPTY_SUMMARY);
  private readonly _loading = signal(false);
  private readonly _failed = signal(false);

  /**
   * Which load's answer is still wanted.
   *
   * Two loads can be in flight at once — a location change while the previous request
   * is still out — and HTTP does not promise to answer them in order. Without this,
   * the slower reply would win and the cards would show the selection the user has
   * already moved away from, which is indistinguishable from a filter that does
   * nothing. Only the newest request is allowed to write.
   */
  private latestRequest = 0;

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
    if (filter.year != null) {
      params = params.set('year', String(filter.year));
    }
    if (filter.quarter != null) {
      params = params.set('quarter', String(filter.quarter));
    }

    const requestId = ++this.latestRequest;
    this._loading.set(true);
    this._failed.set(false);

    return this.http
      .get<DashboardSummary>(`${environment.apiBaseUrl}/dashboard/summary`, { params })
      .pipe(
        tap({
          next: (summary) => {
            if (requestId !== this.latestRequest) {
              return;
            }
            this._summary.set(summary);
            this._loading.set(false);
          },
          error: () => {
            if (requestId !== this.latestRequest) {
              return;
            }
            // Zeroes would read as "no trainees", which is a different claim from
            // "we could not find out".
            this._failed.set(true);
            this._loading.set(false);
          },
        }),
      );
  }
}
