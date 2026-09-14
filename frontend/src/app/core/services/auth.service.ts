import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SUPPRESS_ERROR_TOAST } from '../http/api-error.interceptor';
import {
  ApiPortalUser,
  Permission,
  PortalUser,
  RoleDefinition,
  UserRole,
  permissionsForRole,
  roleDefinition,
  toPortalUser,
} from '../models/user.model';
import { LocationGroup } from '../models/organization.model';
import { ApiRequestError, toApiError } from '../http/api-error';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../auth/session-storage';
import { OrganizationService } from './organization.service';

/** A successful sign-in, as `POST /api/auth/login` answers. */
export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: ApiPortalUser;
}

/**
 * The signed-in session.
 *
 * The access token and the user object are persisted together, so a reload
 * keeps the session; on startup {@link restoreSession} re-reads the account from
 * `GET /api/auth/me` rather than trusting the stored permissions, which may be
 * stale after an administrator changes a role.
 *
 * Nothing in the app assumes a role: it asks {@link has} and
 * {@link canAccessLocation}, both of which answer from the API's user object.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly organization = inject(OrganizationService);

  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<PortalUser | null>(null);
  private readonly _loginError = signal<string | null>(null);
  private readonly _loginFieldErrors = signal<readonly { field: string; message: string }[]>([]);

  /** Whether the user is currently authenticated. */
  readonly isAuthenticated = computed(() => this._accessToken() !== null && this._user() !== null);

  /** The currently logged-in employee's numeric employee id, as a string. */
  readonly employeeId = computed(() => this._user()?.employeeId ?? null);

  /** The display name of the logged-in user. */
  readonly userName = computed(() => this._user()?.name ?? '');

  /** The role code of the logged-in user. */
  readonly role = computed<UserRole>(() => this._user()?.role ?? 'faculty');

  /** The definition of that role: its label, scope and permissions. */
  readonly roleDefinition = computed<RoleDefinition>(() => roleDefinition(this.role()));

  /** Display name of the role, e.g. `Super Admin`. */
  readonly roleLabel = computed(() => this._user()?.roleName ?? this.roleDefinition().label);

  /**
   * Every permission the session holds. Taken from the account the API returned;
   * only when it carries none (an older token, a spec that set a role directly)
   * does it fall back to the role's matrix.
   */
  readonly permissions = computed<readonly Permission[]>(() => {
    const granted = this._user()?.permissions;
    return granted && granted.length > 0 ? granted : permissionsForRole(this.role());
  });

  /** How much of the organisation the session reaches. */
  readonly scope = computed(() => this._user()?.scope ?? this.roleDefinition().scope);

  /**
   * Why the last login attempt was refused, or `null` when it was not. The login
   * screen shows this instead of a generic message.
   */
  readonly loginError = computed(() => this._loginError());

  /** Per-field errors of the last refused login, when the API reported any. */
  readonly loginFieldErrors = computed(() => this._loginFieldErrors());

  /** Locations assigned to the session; empty for `all`-scope roles. */
  readonly assignedLocationIds = computed(() => this._user()?.locationIds ?? []);

  /** Batches assigned to the session; empty unless the role is batch-scoped. */
  readonly assignedBatchIds = computed(() => this._user()?.batchIds ?? []);

  /**
   * The organisation tree the session may search, narrowed to its scope: the
   * assigned locations, and for batch-scoped roles only the assigned batches
   * within them. Drives the options of the shared filter bar.
   */
  readonly visibleLocations = computed<readonly LocationGroup[]>(() => {
    const locations = this.organization.locations();
    const scope = this.scope();
    if (scope === 'all') {
      return locations;
    }

    const locationIds = this.assignedLocationIds();
    const scoped = locations.filter((location) => locationIds.includes(location.id));
    if (scope !== 'assigned-batches') {
      return scoped;
    }

    const batchIds = this.assignedBatchIds();
    return scoped
      .map((location) => ({
        ...location,
        batches: location.batches.filter((batch) => batchIds.includes(batch.id)),
      }))
      .filter((location) => location.batches.length > 0);
  });

  /** Whether the session holds a permission. */
  has(permission: Permission): boolean {
    return this.permissions().includes(permission);
  }

  /** Whether the session may see a location's data. */
  canAccessLocation(locationId: string): boolean {
    return this.scope() === 'all' || this.assignedLocationIds().includes(locationId);
  }

  /** Whether the session may see a batch's data. */
  canAccessBatch(batchId: string): boolean {
    return this.scope() !== 'assigned-batches' || this.assignedBatchIds().includes(batchId);
  }

  /**
   * Signs in against `POST /api/auth/login`.
   *
   * The API accepts a username (`admin`), the raw numeric employee id (`41201`)
   * or an `EMP-`-prefixed form, so whatever the field holds is passed through
   * unchanged. Emits the signed-in {@link PortalUser}; a refusal is rethrown as
   * an {@link ApiRequestError} with the reason in {@link loginError}.
   */
  login(employeeId: string, password: string): Observable<PortalUser> {
    const id = employeeId?.trim() ?? '';
    const secret = password?.trim() ?? '';

    if (!id || !secret) {
      const message = !id ? 'Enter your Employee ID.' : 'Enter your password.';
      this._loginError.set(message);
      this._loginFieldErrors.set([]);
      return throwError(() => new ApiRequestError(0, message, []));
    }

    this._loginError.set(null);
    this._loginFieldErrors.set([]);

    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { employeeId: id, password: secret })
      .pipe(
        tap((response) => this.adoptSession(response.accessToken, response.user)),
        map(() => this._user() as PortalUser),
        catchError((error: unknown) => {
          const details = toApiError(error);
          this._loginError.set(details.message);
          this._loginFieldErrors.set(details.fieldErrors);
          return throwError(() =>
            error instanceof ApiRequestError
              ? error
              : new ApiRequestError(details.status, details.message, details.fieldErrors),
          );
        }),
      );
  }

  /**
   * Restores a persisted session on startup.
   *
   * The token and the account are read from storage so the UI can render
   * immediately, then `GET /api/auth/me` re-reads the account: the stored
   * permissions may be stale, and a token the server has since rejected must end
   * the session rather than leave a signed-in shell around.
   *
   * Emits the revalidated user, or `null` when there was no session to restore.
   */
  restoreSession(): Observable<PortalUser | null> {
    const stored = readStoredSession();
    if (!stored) {
      return of(null);
    }

    this._accessToken.set(stored.accessToken);
    const cached = this.toStoredUser(stored.user);
    if (cached) {
      this._user.set(cached);
    }

    return this.http
      .get<ApiPortalUser>(`${this.baseUrl}/me`, {
        // A failed restore simply means there is no session; the guard sends the
        // user to sign in. Toasting here would shout at someone who has not done
        // anything yet.
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        tap((user) => this.applyUser(user, stored.accessToken)),
        map(() => this._user()),
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
      );
  }

  /**
   * Replaces the session's role and assignments — the seam a spec or a future
   * self-service screen writes through. Permissions are dropped so they are
   * re-derived from the new role.
   */
  setSessionRole(
    role: UserRole,
    locationIds: readonly string[] = [],
    batchIds: readonly string[] = [],
  ): void {
    const user = this._user();
    if (!user) {
      return;
    }
    const next: PortalUser = {
      ...user,
      role,
      locationIds: [...locationIds],
      batchIds: [...batchIds],
      permissions: undefined,
      scope: undefined,
    };
    this._user.set(next);
    this.persist();
  }

  /** Ends the session and returns to sign-in. */
  logout(): void {
    if (this._accessToken()) {
      // Best effort: the token is stateless, so a failure changes nothing.
      this.http
        .post(`${this.baseUrl}/logout`, null, {
          context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
        })
        .subscribe({ error: () => undefined });
    }
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Clears the session without navigating — what the auth interceptor calls when
   * the API answers a 401, since the redirect is the interceptor's own job.
   */
  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
    this._loginError.set(null);
    this._loginFieldErrors.set([]);
    clearStoredSession();
    this.organization.clear();
  }

  /** Stores a signed-in session and loads the tree its scope allows. */
  private adoptSession(accessToken: string, user: ApiPortalUser): void {
    this._accessToken.set(accessToken);
    this._user.set(toPortalUser(user));
    this.persist();
    this.organization.ensureLoaded();
  }

  /** Applies a freshly read account to the current session. */
  private applyUser(user: ApiPortalUser, accessToken: string): void {
    this._accessToken.set(accessToken);
    this._user.set(toPortalUser(user));
    this.persist();
    this.organization.ensureLoaded();
  }

  /** Reads the account out of a stored session, tolerating an old/malformed shape. */
  private toStoredUser(stored: unknown): PortalUser | null {
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    const candidate = stored as ApiPortalUser;
    if (typeof candidate.employeeId !== 'string' || typeof candidate.role !== 'string') {
      return null;
    }
    return toPortalUser(candidate);
  }

  /** Writes the session to storage so a reload keeps the user signed in. */
  private persist(): void {
    const user = this._user();
    const accessToken = this._accessToken();
    if (!accessToken || !user) {
      return;
    }
    writeStoredSession({ accessToken, user });
  }
}
