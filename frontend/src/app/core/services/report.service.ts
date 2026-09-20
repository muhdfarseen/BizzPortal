import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { TraineeOption, TraineeReport } from '../models/report.model';

/** How many matches the trainee search asks for; the API caps it too. */
export const SEARCH_LIMIT = 10;

/**
 * Report data access, backed by the API.
 *
 * - {@link searchTrainees}   ← `GET /api/reports/trainees?search=…`
 * - {@link loadTrainee}      ← `GET /api/reports/trainees/:employeeId`
 *
 * The report is narrowed to the caller's own scope by the server, so nothing
 * here filters. Filtering in the browser would be a second, weaker copy of an
 * access rule — and the numbers on screen would then be the client's opinion
 * rather than the server's answer.
 *
 * The reports are not cached: the point of a report is to be current, and a copy
 * held here would outlive the score or track change that made it wrong.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/reports`;

  private readonly _matches = signal<readonly TraineeOption[]>([]);
  private readonly _searching = signal(false);

  private readonly _trainee = signal<TraineeReport | null>(null);
  private readonly _loadingTrainee = signal(false);
  private readonly _traineeFailed = signal(false);

  /**
   * Which load the report is waiting on.
   *
   * Two loads can be in flight at once — opening one trainee's report while the
   * previous request is still out — and HTTP does not promise to answer them in
   * order. Without this, the slower reply would win and the report would describe
   * a trainee the user has already moved away from, which is indistinguishable
   * from a report that ignores the choice.
   */
  private traineeRequest = 0;

  /** The trainees the last search matched. */
  readonly matches = this._matches.asReadonly();

  /** Whether a search is in flight. */
  readonly searching = this._searching.asReadonly();

  /** The trainee report on screen, or `null` while none has been loaded. */
  readonly trainee = this._trainee.asReadonly();

  /** Whether a trainee report is being read. */
  readonly loadingTrainee = this._loadingTrainee.asReadonly();

  /** Whether the last trainee report failed, so the page can say so rather than show blanks. */
  readonly traineeFailed = this._traineeFailed.asReadonly();

  /**
   * The trainees matching a search term, narrowed to the caller's scope.
   *
   * An empty term is not sent: the API would read it as "no narrowing" and answer
   * with the first page of the whole organisation, which is not a useful thing to
   * put in a dropdown.
   */
  searchTrainees(term: string): Observable<readonly TraineeOption[]> {
    const search = term.trim();
    if (!search) {
      // An empty box is not a search for nothing, it is no search at all, so the
      // matches are dropped without asking the API for the whole organisation.
      this._matches.set([]);
      this._searching.set(false);
      return of(this._matches());
    }

    this._searching.set(true);
    const params = new HttpParams().set('search', search).set('size', String(SEARCH_LIMIT));

    return this.http.get<readonly TraineeOption[]>(`${this.baseUrl}/trainees`, { params }).pipe(
      tap({
        next: (matches) => {
          this._matches.set(matches.map(toOption));
          this._searching.set(false);
        },
        error: () => {
          this._matches.set([]);
          this._searching.set(false);
        },
      }),
    );
  }

  /** Reads one trainee's report and caches it for the signals above. */
  loadTrainee(employeeId: string): Observable<TraineeReport> {
    const requestId = ++this.traineeRequest;
    this._loadingTrainee.set(true);
    this._traineeFailed.set(false);

    return this.http
      .get<TraineeReport>(`${this.baseUrl}/trainees/${encodeURIComponent(employeeId)}`)
      .pipe(
        tap({
          next: (report) => {
            if (requestId !== this.traineeRequest) {
              return;
            }
            this._trainee.set({ ...report, employeeId: String(report.employeeId) });
            this._loadingTrainee.set(false);
          },
          error: () => {
            if (requestId !== this.traineeRequest) {
              return;
            }
            // The previous trainee is dropped: leaving them on screen under the
            // new id would read as the report that was just asked for.
            this._trainee.set(null);
            this._traineeFailed.set(true);
            this._loadingTrainee.set(false);
          },
        }),
      );
  }

  /** Clears the report — used when the page is left or a selection is dropped. */
  clear(): void {
    this.traineeRequest++;
    this._matches.set([]);
    this._trainee.set(null);
    this._traineeFailed.set(false);
    this._loadingTrainee.set(false);
  }
}

/** Normalises a match's ids to strings, the way every other API boundary does. */
function toOption(option: TraineeOption): TraineeOption {
  return {
    employeeId: String(option.employeeId),
    name: option.name,
    ...(option.batchName ? { batchName: option.batchName } : {}),
  };
}
