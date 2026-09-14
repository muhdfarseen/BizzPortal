import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiPermissionDefinition,
  ApiPortalUser,
  ApiRoleDefinition,
  PermissionDefinition,
  PortalUser,
  RoleDefinition,
  UserDraft,
  UserStatus,
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
 * Portal user accounts.
 *
 * Every method is an API call:
 *
 * - {@link users}      ← `GET /api/users`
 * - {@link createUser} → `POST /api/users`
 * - {@link updateUser} → `PATCH /api/users/:employeeId`
 * - {@link deleteUser} → `DELETE /api/users/:employeeId`
 *
 * The role and permission matrices are served too (`/api/users/roles`,
 * `/api/users/permissions`) and published to the shared registries, so User
 * Management renders exactly what the backend authorises.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  private readonly _users = signal<readonly PortalUser[]>([]);
  private readonly _roles = signal<readonly RoleDefinition[]>([]);
  private readonly _permissions = signal<readonly PermissionDefinition[]>([]);

  /** Every portal user account. */
  readonly users = this._users.asReadonly();

  /** The roles and what each may do, as served by the API. */
  readonly roles = this._roles.asReadonly();

  /** Every permission the portal knows, as served by the API. */
  readonly permissions = this._permissions.asReadonly();

  /** Whether the roster has been loaded at least once. */
  readonly loaded = computed(() => this._users().length > 0);

  /** Reads the account roster. */
  load(): Observable<readonly PortalUser[]> {
    return this.http.get<readonly ApiPortalUser[]>(this.baseUrl).pipe(
      tap((users) => this._users.set(users.map(toPortalUser))),
      map(() => this._users()),
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
            requiresBatches: role.requiresBatches,
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

  /** Loads the roster, roles and permissions the User Management screen needs. */
  loadAll(): Observable<void> {
    return forkJoin([this.load(), this.loadRoles(), this.loadPermissions()]).pipe(
      map(() => undefined),
    );
  }

  /** The account with this employee id, or `undefined` when there is none. */
  getUser(employeeId: string): PortalUser | undefined {
    const candidate = employeeId.trim().toLowerCase();
    return this._users().find((user) => user.employeeId.toLowerCase() === candidate);
  }

  /**
   * Whether an employee id already belongs to an account. `exceptEmployeeId`
   * excludes the account being edited from the check.
   */
  isEmployeeIdTaken(employeeId: string, exceptEmployeeId?: string): boolean {
    const candidate = employeeId.trim().toLowerCase();
    return this._users().some(
      (user) => user.employeeId.toLowerCase() === candidate && user.employeeId !== exceptEmployeeId,
    );
  }

  /**
   * Adds an account. `POST /api/users` answers with the created user and, when
   * the request carried no password, the temporary one the backend generated —
   * which is surfaced to the caller because it can never be read again.
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
        tap((created) => this._users.update((users) => upsert(users, created.user))),
      );
  }

  /**
   * Applies edits to an account. The employee id is the key, so it is not
   * editable; the API answers with the updated account, which replaces the row.
   */
  updateUser(
    employeeId: string,
    changes: Partial<Omit<UserDraft, 'employeeId'>>,
  ): Observable<PortalUser> {
    const existing = this.getUser(employeeId);
    const merged: UserDraft = {
      employeeId,
      name: changes.name ?? existing?.name ?? '',
      email: changes.email ?? existing?.email ?? '',
      role: changes.role ?? existing?.role ?? 'faculty',
      locationIds: changes.locationIds ?? existing?.locationIds ?? [],
      batchIds: changes.batchIds ?? existing?.batchIds ?? [],
      status: changes.status ?? existing?.status ?? 'active',
    };
    const { batchIds, locationIds } = normalizeAssignments(
      merged.role,
      merged.locationIds,
      merged.batchIds,
    );
    const payload = { ...this.toPayload(merged), locationIds, batchIds };

    return this.http
      .patch<ApiPortalUser>(`${this.baseUrl}/${encodeURIComponent(employeeId)}`, payload)
      .pipe(
        map(toPortalUser),
        tap((updated) => this._users.update((users) => upsert(users, updated))),
      );
  }

  /** Removes an account. */
  deleteUser(employeeId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${encodeURIComponent(employeeId)}`)
      .pipe(
        tap(() =>
          this._users.update((users) => users.filter((user) => user.employeeId !== employeeId)),
        ),
      );
  }

  /** Activates or deactivates an account without touching its other fields. */
  setStatus(employeeId: string, status: UserStatus): Observable<PortalUser> {
    return this.updateUser(employeeId, { status });
  }

  /** The request body both create and update share. */
  private toPayload(draft: UserDraft): Record<string, unknown> {
    const { locationIds, batchIds } = normalizeAssignments(
      draft.role,
      draft.locationIds,
      draft.batchIds,
    );
    return {
      employeeId: draft.employeeId.trim(),
      name: draft.name.trim(),
      email: draft.email.trim(),
      role: draft.role,
      locationIds,
      batchIds,
      status: draft.status,
    };
  }
}

/** Inserts an account, or replaces the row with the same employee id. */
function upsert(users: readonly PortalUser[], user: PortalUser): readonly PortalUser[] {
  const index = users.findIndex((candidate) => candidate.employeeId === user.employeeId);
  if (index === -1) {
    return [...users, user];
  }
  return users.map((candidate, position) => (position === index ? user : candidate));
}
