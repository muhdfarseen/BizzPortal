import { HttpTestingController } from '@angular/common/http/testing';
import { DEFAULT_CEFR_MAPPING, CefrScoreBand } from '../core/models/assessment.model';
import { ApiOrganizationTree } from '../core/models/organization.model';
import { DEFAULT_PAGE_SIZE, Page } from '../core/models/page.model';
import {
  ApiPermissionDefinition,
  ApiPortalUser,
  ApiRoleDefinition,
} from '../core/models/user.model';
import { AuthService } from '../core/services/auth.service';

/**
 * Fixtures and helpers for the HTTP-backed specs.
 *
 * The shapes here mirror the running backend's responses (see
 * `backend/src/main/java/com/bizzskill/portal/**\/web`), so a spec flushes what
 * the API would really send and then asserts on the rendered result.
 */

/** Base URL the environment points at. */
export const API_BASE = 'http://localhost:8080/api';

/**
 * The seeded organisation tree, as `GET /api/organization/locations` answers.
 *
 * Reduced from the fourteen seeded locations to the five the specs need, and the
 * start dates are spread over three quarters — the real seed piles every batch
 * into Q1 2026, which would leave the period filter with nothing to narrow.
 */
export const ORG_TREE: readonly ApiOrganizationTree[] = [
  {
    id: 'BLR',
    name: 'Bangalore',
    batches: [
      {
        id: '103',
        name: 'Batch 01',
        startDate: '2025-10-13',
        lgs: [
          { id: '1004', name: 'LG Alpha' },
          { id: '1005', name: 'LG Beta' },
        ],
      },
      {
        id: '104',
        name: 'Batch 02',
        startDate: '2026-07-06',
        lgs: [{ id: '1006', name: 'LG Gamma' }],
      },
    ],
  },
  {
    id: 'CHN',
    name: 'Chennai',
    batches: [
      {
        id: '105',
        name: 'Batch 01',
        startDate: '2026-01-20',
        lgs: [{ id: '1007', name: 'LG Alpha' }],
      },
    ],
  },
  {
    id: 'KOC',
    name: 'Kochi',
    batches: [
      {
        id: '101',
        name: 'Batch 01',
        startDate: '2026-01-06',
        lgs: [
          { id: '1001', name: 'LG Alpha' },
          { id: '1002', name: 'LG Beta' },
        ],
      },
      {
        id: '107',
        name: 'Batch 02',
        startDate: '2026-02-03',
        lgs: [{ id: '1008', name: 'LG Delta' }],
      },
    ],
  },
  {
    id: 'PUN',
    name: 'Pune',
    batches: [{ id: '106', name: 'Batch 01', startDate: '2025-12-01', lgs: [] }],
  },
  {
    id: 'TRV',
    name: 'Trivandrum',
    batches: [
      { id: '102', name: 'Batch 01', startDate: '2026-01-06', lgs: [{ id: '1003', name: 'LG Alpha' }] },
    ],
  },
];

/** An assessment as the configuration endpoints answer. */
export interface ApiAssessmentFixture {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  sortOrder: number;
  status: string;
}

/** The three seeded assessments. */
export const ACTIVE_EXAMS: readonly ApiAssessmentFixture[] = [
  {
    id: '1',
    name: 'Pre Assessment',
    description: 'Baseline.',
    maxScore: 90,
    sortOrder: 1,
    status: 'active',
  },
  {
    id: '2',
    name: 'Mid Assessment',
    description: 'Checkpoint.',
    maxScore: 90,
    sortOrder: 2,
    status: 'active',
  },
  {
    id: '3',
    name: 'Post Assessment',
    description: 'Final.',
    maxScore: 90,
    sortOrder: 3,
    status: 'active',
  },
];

/** The seeded score → CEFR mapping. */
export const CEFR_BANDS: readonly CefrScoreBand[] = DEFAULT_CEFR_MAPPING;

/** One trainee row as `GET /api/assessments/trainees` answers. */
export interface ApiTraineeFixture {
  employeeId: string;
  name: string;
  results: Record<string, { score: number | null; cefr?: string | null }>;
  status?: string;
  startDate?: string;
  closeDate?: string;
  remark?: string;
}

/**
 * Wraps rows in the envelope a paged endpoint answers with.
 *
 * The total defaults to the rows given — right for a list that fits on one page
 * — and can be overridden to say that the rows are one page of something larger.
 */
export function pageOf<T>(
  items: readonly T[],
  overrides: Partial<Omit<Page<T>, 'items'>> = {},
): Page<T> {
  const size = overrides.size ?? DEFAULT_PAGE_SIZE;
  const page = overrides.page ?? 0;
  const totalElements = overrides.totalElements ?? items.length;
  const totalPages = overrides.totalPages ?? (size > 0 ? Math.ceil(totalElements / size) : 0);
  return {
    items,
    page,
    size,
    totalElements,
    totalPages,
    hasNext: overrides.hasNext ?? page + 1 < totalPages,
  };
}

const ALL_PERMISSIONS = [
  'assessments.edit',
  'assessments.view',
  'configuration.manage',
  'dashboard.view',
  'lap-remedial.lap-manage',
  'lap-remedial.remedial-manage',
  'lap-remedial.view',
  'reports.view',
  'users.manage',
];

const MANAGER_PERMISSIONS = ALL_PERMISSIONS.filter(
  (permission) => permission !== 'users.manage' && permission !== 'configuration.manage',
);

const LOCATION_ADMIN_PERMISSIONS = [
  'assessments.edit',
  'assessments.view',
  'dashboard.view',
  'lap-remedial.lap-manage',
  'lap-remedial.remedial-manage',
  'lap-remedial.view',
  'reports.view',
];

/** The base faculty role: records results and reads the tracks, moves nothing. */
const FACULTY_PERMISSIONS = [
  'assessments.edit',
  'assessments.view',
  'dashboard.view',
  'lap-remedial.view',
  'reports.view',
];

/**
 * The same faculty, granted one track management on the account itself — what
 * ticking the box in User Management does.
 */
const FACULTY_REMEDIAL_PERMISSIONS = [
  ...FACULTY_PERMISSIONS,
  'lap-remedial.remedial-manage',
];

/** The same faculty, granted both track managements. */
const FACULTY_LAP_REMEDIAL_PERMISSIONS = [
  ...FACULTY_REMEDIAL_PERMISSIONS,
  'lap-remedial.lap-manage',
];

/** One account per role, mirroring `GET /api/auth/me`. */
export const API_USERS: Record<string, ApiPortalUser> = {
  '10294': {
    employeeId: '10294',
    username: 'admin',
    name: 'System Administrator',
    email: 'admin@bizzskill.local',
    role: 'superadmin',
    roleName: 'Super Admin',
    scope: 'all',
    requiresLocations: false,
    locationIds: [],
    permissions: ALL_PERMISSIONS,
    status: 'active',
    createdAt: '2026-09-13T09:01:56.332964Z',
    lastLogin: '2026-09-13T09:31:34.642337Z',
  },
  '20117': {
    employeeId: '20117',
    username: 'pm1',
    name: 'Priya Raghavan',
    email: 'pm@bizzskill.local',
    role: 'program-manager',
    roleName: 'Program Manager',
    scope: 'all',
    requiresLocations: false,
    locationIds: [],
    permissions: MANAGER_PERMISSIONS,
    status: 'active',
    createdAt: '2026-02-11T00:00:00Z',
  },
  '10295': {
    employeeId: '10295',
    username: 'kocadmin',
    name: 'Kochi Location Admin',
    email: 'koc@bizzskill.local',
    role: 'location-admin',
    roleName: 'Location Admin',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['KOC'],
    permissions: LOCATION_ADMIN_PERMISSIONS,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  '10296': {
    employeeId: '10296',
    username: 'faculty1',
    name: 'Divya Sharma',
    email: 'fac@bizzskill.local',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['BLR'],
    permissions: FACULTY_PERMISSIONS,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  '10297': {
    employeeId: '10297',
    username: 'facultyrem',
    name: 'Meera Iyer',
    email: 'facrem@bizzskill.local',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['BLR'],
    permissions: FACULTY_REMEDIAL_PERMISSIONS,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  '10298': {
    employeeId: '10298',
    username: 'facultyboth',
    name: 'Arjun Menon',
    email: 'facboth@bizzskill.local',
    role: 'faculty',
    roleName: 'Faculty',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['BLR'],
    permissions: FACULTY_LAP_REMEDIAL_PERMISSIONS,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  '31904': {
    employeeId: '31904',
    username: 'inactive1',
    name: 'Sneha Kapoor',
    email: 'inactive@bizzskill.local',
    role: 'location-admin',
    roleName: 'Location Admin',
    scope: 'assigned-locations',
    requiresLocations: true,
    locationIds: ['CHN'],
    permissions: LOCATION_ADMIN_PERMISSIONS,
    status: 'inactive',
    createdAt: '2026-05-09T00:00:00Z',
  },
};

/**
 * Handy employee ids for the specs, by role.
 *
 * These mirror `DemoDataLoader`, which seeds the staff accounts deliberately
 * outside the 41xxx range the trainees occupy — so an id never means two things.
 */
export const SIGN_IN = {
  superadmin: '10294',
  programManager: '20117',
  locationAdmin: '10295',
  faculty: '10296',
  /** Faculty granted Remedial management on their own account. */
  facultyRemedial: '10297',
  /** Faculty granted both track managements on their own account. */
  facultyLapRemedial: '10298',
  inactive: '31904',
} as const;

/** The role matrix as `GET /api/users/roles` answers. */
export const API_ROLES: readonly ApiRoleDefinition[] = [
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
    permissions: MANAGER_PERMISSIONS,
  },
  {
    id: 'location-admin',
    label: 'Location Admin',
    description: 'Access to the data of the assigned locations only.',
    scope: 'assigned-locations',
    requiresLocations: true,
    permissions: LOCATION_ADMIN_PERMISSIONS,
  },
  {
    id: 'faculty',
    label: 'Faculty',
    description:
      'Access to the assigned batches only. Records results and can see the tracks. Which tracks they may initiate and close is set per person, below the role.',
    scope: 'assigned-locations',
    requiresLocations: true,
    permissions: FACULTY_PERMISSIONS,
  },
];

/** The permission list as `GET /api/users/permissions` answers. */
export const API_PERMISSIONS: readonly ApiPermissionDefinition[] = [
  { id: 'dashboard.view', label: 'Dashboard', description: 'View trainee counts and charts' },
  { id: 'assessments.view', label: 'View Assessments', description: 'Read assessment results' },
  { id: 'assessments.edit', label: 'Record Assessment Results', description: 'Enter scores' },
  {
    id: 'lap-remedial.view',
    label: 'View LAP / Remedial',
    description: 'See LAP / Remedial tracks',
  },
  {
    id: 'lap-remedial.remedial-manage',
    label: 'Manage Remedial',
    description: 'Initiate and close Remedial tracks',
  },
  {
    id: 'lap-remedial.lap-manage',
    label: 'Manage LAP',
    description: 'Initiate and close LAP tracks',
  },
  { id: 'reports.view', label: 'Reports', description: 'View reports' },
  { id: 'users.manage', label: 'User Management', description: 'Manage portal users' },
  { id: 'configuration.manage', label: 'Exam Configuration', description: 'Edit exams' },
];

/** A roster of `count` trainees, with laps and remedials on the first rows. */
export function traineeRows(count: number, startEmployeeId = 41201): ApiTraineeFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const employeeId = String(startEmployeeId + index);
    const status = index === 0 ? 'lap' : index === 1 ? 'remedial' : undefined;
    return {
      employeeId,
      name: `Trainee ${index + 1}`,
      results: {
        '1': { score: 40 + index, cefr: 'A2' },
        '2': { score: 50 + index, cefr: 'B1' },
      },
      ...(status
        ? {
            status,
            startDate: '2026-03-02',
            remark: status === 'lap' ? 'No improvement.' : 'Below threshold.',
          }
        : {}),
    } satisfies ApiTraineeFixture;
  });
}

/** Flushes the organisation-tree request(s) a sign-in triggers. */
export function flushOrg(http: HttpTestingController): void {
  http.match(`${API_BASE}/organization/locations`).forEach((request) => request.flush(ORG_TREE));
}

/** Flushes the scoreable-assessments request(s). */
export function flushExams(http: HttpTestingController): void {
  http
    .match(`${API_BASE}/configuration/assessments/active`)
    .forEach((request) => request.flush(ACTIVE_EXAMS));
}

/** Flushes the CEFR-mapping request(s). */
export function flushCefr(http: HttpTestingController): void {
  http
    .match(`${API_BASE}/configuration/cefr-mapping`)
    .forEach((request) => request.flush(CEFR_BANDS));
}

/** Flushes every request a freshly created component triggers on its own. */
export function flushStartup(http: HttpTestingController): void {
  flushExams(http);
  flushCefr(http);
}

/**
 * Signs a spec in through the real login endpoint and flushes the login and
 * organisation responses, returning the account that was signed in.
 */
export function signInWith(
  http: HttpTestingController,
  auth: AuthService,
  employeeId: string,
  password = 'secret',
): ApiPortalUser {
  const user = API_USERS[employeeId];
  if (!user) {
    throw new Error(`No API user fixture for ${employeeId}`);
  }
  auth.login(employeeId, password).subscribe({ error: () => undefined });
  http.expectOne(`${API_BASE}/auth/login`).flush({
    accessToken: `token-${employeeId}`,
    tokenType: 'Bearer',
    expiresIn: 28800,
    user,
  });
  flushOrg(http);
  return user;
}

/**
 * Flushes a trainees page matching an exact query. `page` overrides the
 * envelope's metadata, so a spec can say that the rows are one page of a larger
 * result.
 */
export function flushTrainees(
  http: HttpTestingController,
  rows: readonly ApiTraineeFixture[],
  match?: (params: URLSearchParams) => boolean,
  page: Partial<Omit<Page<ApiTraineeFixture>, 'items'>> = {},
): void {
  const request = http.expectOne(
    (candidate) =>
      candidate.url === `${API_BASE}/assessments/trainees` &&
      (!match || match(new URLSearchParams(candidate.params.toString()))),
  );
  request.flush(pageOf(rows, page));
}

/** One trainee as `POST /api/assessments/trainees/lookup` answers it. */
export interface ApiTraineeRefFixture {
  employeeId: string;
  name: string;
}

/** Flushes a trainee lookup, whose answer is the group size plus the ids it holds. */
export function flushTraineeLookup(
  http: HttpTestingController,
  lookup: { groupSize: number; trainees: readonly ApiTraineeRefFixture[] },
  match?: (params: URLSearchParams) => boolean,
): void {
  const request = http.expectOne(
    (candidate) =>
      candidate.url === `${API_BASE}/assessments/trainees/lookup` &&
      (!match || match(new URLSearchParams(candidate.params.toString()))),
  );
  request.flush(lookup);
}
