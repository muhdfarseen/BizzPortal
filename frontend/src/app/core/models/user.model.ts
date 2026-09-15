/**
 * Portal users, their roles and what each role may do.
 *
 * A user's abilities come from exactly two places: the **permissions** of their
 * role (what screens and actions they get) and their **assignments** (which
 * locations and batches those actions reach). Nothing else grants access, so
 * checking `has(permission)` plus `canAccessLocation(id)` is always enough.
 */

import { batchesForLocations, locationName, qualifiedBatchName } from './organization.model';

/** The portal's role hierarchy, highest access first. */
export type UserRole = 'superadmin' | 'program-manager' | 'location-admin' | 'faculty';

/** A single thing a role is allowed to do. */
export type Permission =
  | 'dashboard.view'
  | 'assessments.view'
  | 'assessments.edit'
  | 'trainee-status.view'
  | 'trainee-status.manage'
  | 'reports.view'
  | 'users.manage'
  | 'configuration.manage';

/** How much of the organisation a role's permissions reach. */
export type RoleScope =
  /** Every location and batch — no assignment needed. */
  | 'all'
  /** Only the locations assigned to the user. */
  | 'assigned-locations'
  /** Only the batches assigned to the user, within their locations. */
  | 'assigned-batches';

/** Whether a user account is usable. */
export type UserStatus = 'active' | 'inactive';

/** What a permission is called and does, for the screens that list permissions. */
export interface PermissionDefinition {
  id: Permission;
  label: string;
  description: string;
}

/** Every permission, in the order the permission lists render them. */
export const PERMISSIONS: PermissionDefinition[] = [
  {
    id: 'dashboard.view',
    label: 'Dashboard',
    description: 'View trainee counts, batch totals and the distribution chart',
  },
  {
    id: 'assessments.view',
    label: 'View Assessments',
    description: 'Search trainee groups and read their assessment results',
  },
  {
    id: 'assessments.edit',
    label: 'Record Assessment Results',
    description: 'Enter and correct trainee scores and CEFR levels',
  },
  {
    id: 'trainee-status.view',
    label: 'View Trainee Status',
    description: 'See the status each trainee currently holds',
  },
  {
    id: 'trainee-status.manage',
    label: 'Manage Trainee Status',
    description: 'Change a trainee status and record the reason for the change',
  },
  {
    id: 'reports.view',
    label: 'Reports',
    description: 'View and export benchmark and scorecard reports',
  },
  {
    id: 'users.manage',
    label: 'User Management',
    description: 'Create, edit and remove portal users and assign their roles',
  },
  {
    id: 'configuration.manage',
    label: 'Exam Configuration',
    description: 'Create and edit the exams trainees are assessed against',
  },
];

/** A role: what it is called, how far it reaches and what it may do. */
export interface RoleDefinition {
  id: UserRole;
  label: string;
  description: string;
  scope: RoleScope;
  /** Whether users of this role must be assigned one or more locations. */
  requiresLocations: boolean;
  /** Whether users of this role must be assigned one or more batches. */
  requiresBatches: boolean;
  permissions: readonly Permission[];
}

/** Permissions of the Super Admin — every permission there is. */
const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS.map((permission) => permission.id);

/**
 * Everything except the two administrative permissions, which the Super Admin
 * keeps. Moving user management down to Program Managers is a matter of adding
 * `'users.manage'` to that role's list below.
 */
const NON_ADMIN_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => permission !== 'users.manage' && permission !== 'configuration.manage',
);

/** The four roles, ordered from most to least access. */
export const ROLES: RoleDefinition[] = [
  {
    id: 'superadmin',
    label: 'Super Admin',
    description: 'Full access to every location, plus user management and exam configuration.',
    scope: 'all',
    requiresLocations: false,
    requiresBatches: false,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: 'program-manager',
    label: 'Program Manager',
    description: 'Access to the data of every location. Cannot manage users or exam configuration.',
    scope: 'all',
    requiresLocations: false,
    requiresBatches: false,
    permissions: NON_ADMIN_PERMISSIONS,
  },
  {
    id: 'location-admin',
    label: 'Location Admin',
    description: 'Access to the data of the assigned locations only.',
    scope: 'assigned-locations',
    requiresLocations: true,
    requiresBatches: false,
    permissions: NON_ADMIN_PERMISSIONS,
  },
  {
    id: 'faculty',
    label: 'Faculty',
    description:
      'Access to the assigned batches only. Records results and changes trainee status, one at a time or in bulk from a sheet.',
    scope: 'assigned-batches',
    requiresLocations: true,
    requiresBatches: true,
    // The whole non-admin set, trainee-status.manage included: faculty are the people
    // who decide who needs remedial support, and both the Change status action and
    // the bulk sheet depend on that permission. Migration V5 grants it for the same
    // reason, so the two must stay in step.
    permissions: NON_ADMIN_PERMISSIONS,
  },
];

/** A portal user account. */
export interface PortalUser {
  /** Employee identifier — the numeric employee number as a string, e.g. `10294`. */
  employeeId: string;
  /** Display name. */
  name: string;
  /** Work email address. */
  email: string;
  /** The role the account's permissions come from. */
  role: UserRole;
  /** Locations the user may reach; empty for `all`-scope roles. */
  locationIds: string[];
  /** Batches the user may reach; empty unless the role is scoped to batches. */
  batchIds: string[];
  status: UserStatus;
  /** ISO date (`yyyy-MM-dd`) the account was created. */
  createdAt: string;
  /** Login username, when the API supplied it. */
  username?: string;
  /** Display name of the role, when the API supplied it. */
  roleName?: string;
  /** How far the role reaches, as the API reports it. */
  scope?: RoleScope;
  /** Whether the role must be assigned locations. */
  requiresLocations?: boolean;
  /** Whether the role must be assigned batches. */
  requiresBatches?: boolean;
  /** The permissions the role grants, as the API reports them. */
  permissions?: readonly Permission[];
}

/** The fields of a user an admin edits; the employee id is the account's key. */
export type UserDraft = Omit<PortalUser, 'createdAt'>;

/** The definition of a role, falling back to Faculty (the least access). */
export function roleDefinition(role: UserRole): RoleDefinition {
  return ROLES.find((definition) => definition.id === role) ?? ROLES[ROLES.length - 1];
}

/** Display name of a role, e.g. `Location Admin`. */
export function roleLabel(role: UserRole): string {
  return roleDefinition(role).label;
}

/** The permissions a role grants. */
export function permissionsForRole(role: UserRole): readonly Permission[] {
  return roleDefinition(role).permissions;
}

/** The {@link PermissionDefinition}s a role grants, in list order. */
export function permissionDefinitionsForRole(role: UserRole): PermissionDefinition[] {
  const granted = permissionsForRole(role);
  return PERMISSIONS.filter((permission) => granted.includes(permission.id));
}

/**
 * Drops assignments the role does not use, so an account that was demoted (or
 * promoted) never keeps stale access: `all`-scope roles store no assignments,
 * location-scoped roles store no batches, and batches outside the assigned
 * locations are removed.
 */
export function normalizeAssignments(
  role: UserRole,
  locationIds: readonly string[],
  batchIds: readonly string[],
): { locationIds: string[]; batchIds: string[] } {
  const definition = roleDefinition(role);

  if (!definition.requiresLocations) {
    return { locationIds: [], batchIds: [] };
  }

  const locations = [...new Set(locationIds)];
  if (!definition.requiresBatches) {
    return { locationIds: locations, batchIds: [] };
  }

  const allowed = new Set(batchesForLocations(locations).map((batch) => batch.id));
  return {
    locationIds: locations,
    batchIds: [...new Set(batchIds)].filter((batchId) => allowed.has(batchId)),
  };
}

/**
 * One line describing what a role plus its assignments can reach, e.g.
 * `All locations`, `Kochi, Chennai` or `Kochi · Batch 01`.
 */
export function scopeSummary(
  role: UserRole,
  locationIds: readonly string[],
  batchIds: readonly string[],
): string {
  const definition = roleDefinition(role);

  if (definition.scope === 'all') {
    return 'All locations';
  }

  if (definition.requiresBatches) {
    return batchIds.length ? batchIds.map(qualifiedBatchName).join(', ') : 'No batches';
  }

  return locationIds.length ? locationIds.map(locationName).join(', ') : 'No locations';
}

/** One line describing what a user can reach, shown in the user table. */
export function accessSummary(user: PortalUser): string {
  return scopeSummary(user.role, user.locationIds, user.batchIds);
}

/* ── Loading the matrix from the API ───────────────────────── */

/** A user account exactly as `GET /api/users` (and `/api/auth/me`) returns it. */
export interface ApiPortalUser {
  employeeId: string;
  username?: string;
  name: string;
  email: string;
  role: string;
  roleName?: string;
  scope?: string;
  requiresLocations?: boolean;
  requiresBatches?: boolean;
  locationIds?: readonly string[];
  /** The API sends batch ids as numbers; every id is an opaque string here. */
  batchIds?: readonly (number | string)[];
  permissions?: readonly string[];
  status?: string;
  createdAt?: string;
  lastLogin?: string | null;
}

/**
 * Maps the API's user object onto {@link PortalUser}.
 *
 * Two translations matter: every id becomes a string (the filter state treats
 * ids as opaque), and the API's `Instant` timestamp is reduced to the
 * `yyyy-MM-dd` the table renders.
 */
export function toPortalUser(api: ApiPortalUser): PortalUser {
  return {
    employeeId: String(api.employeeId),
    name: api.name,
    email: api.email,
    role: api.role as UserRole,
    locationIds: [...(api.locationIds ?? [])],
    batchIds: (api.batchIds ?? []).map((batchId) => String(batchId)),
    status: api.status === 'inactive' ? 'inactive' : 'active',
    createdAt: toIsoDate(api.createdAt),
    username: api.username,
    roleName: api.roleName,
    scope: api.scope as RoleScope | undefined,
    requiresLocations: api.requiresLocations,
    requiresBatches: api.requiresBatches,
    permissions: (api.permissions ?? []) as readonly Permission[],
  };
}

/** Reduces an API timestamp (`2026-09-13T09:01:56.332964Z`) to `yyyy-MM-dd`. */
function toIsoDate(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

/** A role as `GET /api/users/roles` returns it — it mirrors {@link RoleDefinition}. */
export interface ApiRoleDefinition {
  id: string;
  label: string;
  description: string;
  scope: string;
  requiresLocations: boolean;
  requiresBatches: boolean;
  permissions: readonly string[];
}

/** A permission as `GET /api/users/permissions` returns it. */
export interface ApiPermissionDefinition {
  id: string;
  label: string;
  description: string;
}

/**
 * Replaces the role registry with the API's matrix, so User Management renders
 * exactly what the backend authorises rather than a duplicated local copy.
 * The pure helpers ({@link roleDefinition}, {@link scopeSummary}) read the same
 * registry, so they follow automatically.
 */
export function setRoleDefinitions(roles: readonly ApiRoleDefinition[]): void {
  if (roles.length === 0) {
    return;
  }
  const mapped: RoleDefinition[] = roles.map((role) => ({
    id: role.id as UserRole,
    label: role.label,
    description: role.description,
    scope: role.scope as RoleScope,
    requiresLocations: role.requiresLocations,
    requiresBatches: role.requiresBatches,
    permissions: [...role.permissions] as readonly Permission[],
  }));
  ROLES.splice(0, ROLES.length, ...mapped);
}

/** Replaces the permission registry with the API's list. */
export function setPermissionDefinitions(permissions: readonly ApiPermissionDefinition[]): void {
  if (permissions.length === 0) {
    return;
  }
  PERMISSIONS.splice(
    0,
    PERMISSIONS.length,
    ...permissions.map((permission) => ({
      id: permission.id as Permission,
      label: permission.label,
      description: permission.description,
    })),
  );
}
