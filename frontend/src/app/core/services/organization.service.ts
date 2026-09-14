import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiOrganizationTree,
  LOCATIONS,
  LocationGroup,
  setLocations,
} from '../models/organization.model';

/**
 * Loads the organisation tree the session may search.
 *
 * `GET /api/organization/locations` returns the location → batch → LG tree,
 * already narrowed to the caller's scope. The response is published to the
 * shared {@link LOCATIONS} registry (so the pure helpers resolve names) and to
 * {@link locations} (so signals-driven screens re-render).
 */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly http = inject(HttpClient);

  private readonly _locations = signal<readonly LocationGroup[]>([]);
  private readonly baseUrl = `${environment.apiBaseUrl}/organization`;

  /** The loaded tree, reactive for the screens that render it. */
  readonly locations = this._locations.asReadonly();

  private loaded = false;

  /**
   * Fetches the tree. Reuses the loaded one unless `force` is set, so the
   * filter bar, User Management and the dashboard share a single request.
   */
  load(force = false): Observable<readonly LocationGroup[]> {
    if (this.loaded && !force) {
      return of(this._locations());
    }
    return this.http.get<readonly ApiOrganizationTree[]>(`${this.baseUrl}/locations`).pipe(
      map((tree) => {
        setLocations(tree);
        const next = LOCATIONS.slice();
        this._locations.set(next);
        this.loaded = true;
        return next;
      }),
    );
  }

  /** Loads the tree if it is not loaded yet, ignoring a failure (the caller retries). */
  ensureLoaded(): void {
    if (!this.loaded) {
      this.load().subscribe({ error: () => undefined });
    }
  }

  /** Drops the loaded tree — used when the session ends or a spec resets state. */
  clear(): void {
    this.loaded = false;
    setLocations([]);
    this._locations.set([]);
  }
}
