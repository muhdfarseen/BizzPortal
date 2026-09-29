import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Page, PagedQuery, pagedParams } from '../models/page.model';
import {
  ApiPermissionDefinition,
  ApiPortalUser,
  ApiRoleDefinition,
  PermissionDefinition,
  PortalUser,
  RoleDefinition,
  UserDraft,
  normalizeAssignments,
  setPermissionDefinitions,
  setRoleDefinitions,
  toPortalUser,
} from '../models/user.model';

/** What `POST /api/users` answers: the account, plus a generated password once. */
export interface CreatedUser {
  user: PortalUser;
  /** Present only when the request supplied no password. */
  temporaryPassword: string | null;
}

/**
 * The account-list query, which adds the toolbar's role and status narrowing to
 * the shared paging inputs. Both are optional; omitting one means the same as
 * the "All" choice on screen.
 */
export interface UserQuery extends PagedQuery {
  /** Role code, e.g. `superadmin`; omit for every role. */
  role?: string;
  /** `active` or `inactive`; omit for both. */
  status?: string;
}

/**
 * Portal user accounts.
 *
 * Every method is an API call:
 *
 * - {@link load}       ← `GET /api/users`
 * - {@link createUser} → `POST /api/users`
 * - {@link updateUser} → `PATCH /api/users/:employeeId`
 * - {@link deleteUser} → `DELETE /api/users/:employeeId`
 *
 * The account list is paged, searched, filtered and sorted by the server, so
 * nothing here holds a roster: the screen keeps the page it is showing.
 *
 * The role and permission matrices are served too (`/api/users/roles`,
 * `/api/users/permissions`) and published to the shared registries, so User
 * Management renders exactly what the backend authorises.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  private readonly _roles = signal<readonly RoleDefinition[]>([]);
  private readonly _permissions = signal<readonly PermissionDefinition[]>([]);

  /** The roles and what each may do, as served by the API. */
  readonly roles = this._roles.asReadonly();

  /** Every permission the portal knows, as served by the API. */
  readonly permissions = this._permissions.asReadonly();

  /**
   * Reads one page of accounts, with the search and the role / status filters
   * applied by the server so they narrow the whole roster rather than the page
   * on screen.
   */
  load(query: UserQuery = {}): Observable<Page<PortalUser>> {
    let params = pagedParams(query);
    if (query.role) {
      params = params.set('role', query.role);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http.get<Page<ApiPortalUser>>(this.baseUrl, { params }).pipe(
      map((page) => ({
        ...page,
        items: page.items.map(toPortalUser),
      })),
    );
  }

  /** Reads the role matrix and publishes it to the shared registry. */
  loadRoles(): Observable<readonly RoleDefinition[]> {
    return this.http.get<readonly ApiRoleDefinition[]>(`${this.baseUrl}/roles`).pipe(
      tap((roles) => {
        setRoleDefinitions(roles);
        this._roles.set(
          roles.map((role) => ({
            id: role.id as RoleDefinition['id'],
            label: role.label,
            description: role.description,
            scope: role.scope as RoleDefinition['scope'],
            requiresLocations: role.requiresLocations,
            permissions: [...role.permissions] as RoleDefinition['permissions'],
          })),
        );
      }),
      map(() => this._roles()),
    );
  }

  /** Reads the permission list and publishes it to the shared registry. */
  loadPermissions(): Observable<readonly PermissionDefinition[]> {
    return this.http.get<readonly ApiPermissionDefinition[]>(`${this.baseUrl}/permissions`).pipe(
      tap((permissions) => {
        setPermissionDefinitions(permissions);
        this._permissions.set(
          permissions.map((permission) => ({
            id: permission.id as PermissionDefinition['id'],
            label: permission.label,
            description: permission.description,
          })),
        );
      }),
      map(() => this._permissions()),
    );
  }

  /**
   * Loads the role matrix and permission list the User Management screen needs.
   *
   * The accounts themselves are not read here: they are a paged query the
   * screen makes for the filters it is showing, not a roster to keep.
   */
  loadAll(): Observable<void> {
    return forkJoin([this.loadRoles(), this.loadPermissions()]).pipe(map(() => undefined));
  }

  /**
   * Adds an account. `POST /api/users` answers with the created user and, when
   * the request carried no password, the temporary one the backend generated —
   * which is surfaced to the caller because it can never be read again.
   *
   * A duplicate employee number is refused by the API with a 409, so the screen
   * does not try to predict it from a page of accounts.
   */
  createUser(draft: UserDraft): Observable<CreatedUser> {
    const payload = this.toPayload(draft);
    return this.http
      .post<{ user: ApiPortalUser; temporaryPassword: string | null }>(this.baseUrl, payload)
      .pipe(
        map((response) => ({
          user: toPortalUser(response.user),
          temporaryPassword: response.temporaryPassword ?? null,
        })),
      );
  }

  /**
   * Applies edits to an account. The employee id is the key, so it is not
   * editable; the API answers with the updated account.
   */
  updateUser(employeeId: string, changes: Omit<UserDraft, 'employeeId'>): Observable<PortalUser> {
    const { locationIds } = normalizeAssignments(changes.role, changes.locationIds);
    const payload = { ...this.toPayload({ employeeId, ...changes }), locationIds };

    return this.http
      .patch<ApiPortalUser>(`${this.baseUrl}/${encodeURIComponent(employeeId)}`, payload)
      .pipe(map(toPortalUser));
  }

  /** Removes an account. */
  deleteUser(employeeId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(employeeId)}`);
  }

  /** The request body both create and update share. */
  private toPayload(draft: UserDraft): Record<string, unknown> {
    const { locationIds } = normalizeAssignments(draft.role, draft.locationIds);
    return {
      employeeId: draft.employeeId.trim(),
      name: draft.name.trim(),
      email: draft.email.trim(),
      role: draft.role,
      locationIds,
      status: draft.status,
      // The whole set, so unticking a box revokes that grant rather than
      // leaving the previous one in place.
      trackPermissions: [...(draft.trackPermissions ?? [])],
    };
  }
}
