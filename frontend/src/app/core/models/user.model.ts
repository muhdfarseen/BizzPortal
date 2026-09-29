/**
 * Portal users, their roles and what each role may do.
 *
 * A user's abilities come from exactly two places: the **permissions** of their
 * role (what screens and actions they get) and their **assignments** (which
 * locations and batches those actions reach). Nothing else grants access, so
 * checking `has(permission)` plus `canAccessLocation(id)` is always enough.
 */

import { locationName } from './organization.model';

/** The portal's role hierarchy, highest access first. */
export type UserRole = 'superadmin' | 'program-manager' | 'location-admin' | 'faculty';

/** A single thing a role is allowed to do. */
export type Permission =
  | 'dashboard.view'
  | 'assessments.view'
  | 'assessments.edit'
  | 'lap-remedial.view'
  /** Initiate Remedial, and close a Remedial track that has finished. */
  | 'lap-remedial.remedial-manage'
  /** Initiate LAP, and close a LAP track that has finished. */
  | 'lap-remedial.lap-manage'
  | 'reports.view'
  | 'users.manage'
  | 'configuration.manage';

/** How much of the organisation a role's permissions reach. */
export type RoleScope =
  /** Every location and batch — no assignment needed. */
  | 'all'
  /**
   * Only the locations assigned to the user, and every batch and learning group
   * inside them.
   *
   * <p>There is no batch-level scope: a location assignment means the whole
   * location, so nobody sees part of a place they have been given access to.
   */
  | 'assigned-locations';

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
    id: 'lap-remedial.view',
    label: 'View LAP / Remedial',
    description: 'See which trainees are on a LAP or Remedial track',
  },
  {
    id: 'lap-remedial.remedial-manage',
    label: 'Manage Remedial',
    description: 'Initiate Remedial for trainees and close completed Remedial tracks',
  },
  {
    id: 'lap-remedial.lap-manage',
    label: 'Manage LAP',
    description: 'Initiate LAP for trainees and close completed LAP tracks',
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

/**
 * What the faculty role grants out of the box: record results, read the tracks
 * and the reports, reach only the assigned batches.
 *
 * <p>It grants no track management. The two track permissions are granted per
 * person in User Management, so two faculty members on the same role can own
 * different tracks — a role alone cannot say which of them may move LAP.
 *
 * <p>It reaches the assigned locations and every batch inside them: there is no
 * batch-level access to configure.
 */
const FACULTY_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'assessments.view',
  'assessments.edit',
  'lap-remedial.view',
  'reports.view',
];

/** The roles, ordered from most to least access. */
export const ROLES: RoleDefinition[] = [
  {
    id: 'superadmin',
    label: 'Super Admin',
    description: 'Full access to every location, plus user management and exam configuration.',
    scope: 'all',
    requiresLocations: false,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: 'program-manager',
    label: 'Program Manager',
    description: 'Access to the data of every location. Cannot manage users or exam configuration.',
    scope: 'all',
    requiresLocations: false,
    permissions: NON_ADMIN_PERMISSIONS,
  },
  {
    id: 'location-admin',
    label: 'Location Admin',
    description: 'Access to the data of the assigned locations only.',
    scope: 'assigned-locations',
    requiresLocations: true,
    permissions: NON_ADMIN_PERMISSIONS,
  },
  {
    id: 'faculty',
    label: 'Faculty',
    description:
      'Access to the assigned locations only, and every batch inside them. Records results and can see the tracks. Which tracks they may initiate and close is set per person, below the role.',
    scope: 'assigned-locations',
    requiresLocations: true,
    permissions: FACULTY_PERMISSIONS,
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
  /** Locations the user may reach, and every batch inside them. */
  locationIds: string[];
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
  /** The permissions the role grants, as the API reports them. */
  permissions?: readonly Permission[];
  /**
   * The track permissions granted to this person over and above their role's.
   *
   * <p>Separate from {@link permissions}, which is the union of the role's and
   * these: the form must edit what was granted to *this* account, and a role
   * that already grants a permission must not make it look individually chosen.
   */
  trackPermissions?: readonly Permission[];
}

/** The fields of a user an admin edits; the employee id is the account's key. */
export type UserDraft = Omit<PortalUser, 'createdAt'>;

/**
 * The track permissions an administrator picks per person, in the order they are
 * offered. The other permissions come with the role and are not offered here.
 */
export const TRACK_PERMISSIONS: readonly Permission[] = [
  'lap-remedial.remedial-manage',
  'lap-remedial.lap-manage',
];

/** Whether the permission is one of the per-person track grants. */
export function isTrackPermission(permission: Permission): boolean {
  return TRACK_PERMISSIONS.includes(permission);
}

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
 * promoted) never keeps stale access: `all`-scope roles store no assignments.
 *
 * <p>Locations are the only assignment left. A batch is reachable exactly when
 * its location is assigned, so there is nothing batch-level to normalise.
 */
export function normalizeAssignments(
  role: UserRole,
  locationIds: readonly string[],
): { locationIds: string[] } {
  const definition = roleDefinition(role);

  if (!definition.requiresLocations) {
    return { locationIds: [] };
  }

  return { locationIds: [...new Set(locationIds)] };
}

/**
 * One line describing what a role plus its assignments can reach, e.g.
 * `All locations` or `Kochi, Chennai`. The whole of each named location is
 * included, so there is no batch to qualify.
 */
export function scopeSummary(role: UserRole, locationIds: readonly string[]): string {
  const definition = roleDefinition(role);

  if (definition.scope === 'all') {
    return 'All locations';
  }

  return locationIds.length ? locationIds.map(locationName).join(', ') : 'No locations';
}

/** One line describing what a user can reach, shown in the user table. */
export function accessSummary(user: PortalUser): string {
  return scopeSummary(user.role, user.locationIds);
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
  /** Locations assigned; every batch inside them is reachable. */
  locationIds?: readonly string[];
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
    status: api.status === 'inactive' ? 'inactive' : 'active',
    createdAt: toIsoDate(api.createdAt),
    username: api.username,
    roleName: api.roleName,
    scope: api.scope as RoleScope | undefined,
    requiresLocations: api.requiresLocations,
        permissions: (api.permissions ?? []) as readonly Permission[],
    // The API reports the union; the form needs to know which of the two track
    // permissions came from the role and which were granted to this person, so a
    // permission the role already gives is not presented as a personal choice.
    trackPermissions: ((api.permissions ?? []) as readonly Permission[]).filter(
      isTrackPermission,
    ),
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
