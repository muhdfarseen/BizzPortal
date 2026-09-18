/**
 * The training organisation hierarchy: Location → Batch → LG.
 *
 * Shared by the filter bar (which searches within it) and User Management
 * (which assigns users to parts of it), so both read one tree.
 *
 * The tree is **not** a compile-time constant: it is served by
 * `GET /api/organization/locations`, already narrowed to the caller's scope, and
 * loaded by `OrganizationService`. The exported helpers read the shared
 * {@link LOCATIONS} registry, so every consumer sees a newly loaded tree without
 * holding a copy of its own. Reactive screens read
 * `OrganizationService.locations` (a signal) and the pure helpers below.
 */

/** A learning group — the smallest unit trainees are grouped into. */
export interface LgGroup {
  id: string;
  name: string;
}

/** A batch of trainees at a location, split into learning groups. */
export interface BatchGroup {
  id: string;
  name: string;
  /**
   * The day the batch began, as an ISO date (`2026-01-06`), or `null` when the
   * portal has none on record. A batch's quarter is read from it — see
   * {@link batchStartQuarter}.
   */
  startDate: string | null;
  lgs: LgGroup[];
}

/** A training location, with the batches running there. */
export interface LocationGroup {
  id: string;
  name: string;
  batches: BatchGroup[];
}

/**
 * Every location the session may see, with its batches and learning groups.
 *
 * Empty until `OrganizationService` loads the tree; replaced in place by
 * {@link setLocations} so existing references stay valid.
 */
export const LOCATIONS: LocationGroup[] = [];

/** One node of the API's organisation tree — the same shape as {@link LocationGroup}. */
export interface ApiOrganizationTree {
  id: string;
  name: string;
  batches?: readonly {
    id: string;
    name: string;
    startDate?: string | null;
    lgs?: readonly { id: string; name: string }[];
  }[];
}

/**
 * Replaces the shared tree with the API's response.
 *
 * Ids are normalised to strings even though the API already renders batches and
 * learning groups as strings, so a numeric id can never leak into the filter
 * state.
 */
export function setLocations(tree: readonly ApiOrganizationTree[]): void {
  const mapped: LocationGroup[] = tree.map((location) => ({
    id: String(location.id),
    name: location.name,
    batches: (location.batches ?? []).map((batch) => ({
      id: String(batch.id),
      name: batch.name,
      startDate: batch.startDate ?? null,
      lgs: (batch.lgs ?? []).map((lg) => ({ id: String(lg.id), name: lg.name })),
    })),
  }));
  LOCATIONS.splice(0, LOCATIONS.length, ...mapped);
}

/** The location with this id, or `undefined` when it is not configured. */
export function findLocation(locationId: string): LocationGroup | undefined {
  return LOCATIONS.find((location) => location.id === locationId);
}

/** Display name of a location, falling back to its id. */
export function locationName(locationId: string): string {
  return findLocation(locationId)?.name ?? locationId;
}

/** The batch with this id, or `undefined` when it is not configured. */
export function findBatch(batchId: string): BatchGroup | undefined {
  for (const location of LOCATIONS) {
    const batch = location.batches.find((candidate) => candidate.id === batchId);
    if (batch) {
      return batch;
    }
  }
  return undefined;
}

/** Display name of a batch, falling back to its id. */
export function batchName(batchId: string): string {
  return findBatch(batchId)?.name ?? batchId;
}

/** Display name of a batch qualified by its location, e.g. `Kochi · Batch 01`. */
export function qualifiedBatchName(batchId: string): string {
  for (const location of LOCATIONS) {
    const batch = location.batches.find((candidate) => candidate.id === batchId);
    if (batch) {
      return `${location.name} · ${batch.name}`;
    }
  }
  return batchId;
}

/** Every batch running at the given locations, in location order. */
export function batchesForLocations(locationIds: readonly string[]): BatchGroup[] {
  return LOCATIONS.filter((location) => locationIds.includes(location.id)).flatMap(
    (location) => location.batches,
  );
}

/* ── The calendar period a batch belongs to ─────────────────── */

/** A calendar quarter of a calendar year, e.g. Q1 2026. */
export interface QuarterInYear {
  year: number;
  /** 1 = Jan–Mar, 2 = Apr–Jun, 3 = Jul–Sep, 4 = Oct–Dec. */
  quarter: number;
}

/** The four quarters, in the order the filter offers them. */
export const QUARTERS: readonly number[] = [1, 2, 3, 4];

/**
 * The quarter the calendar is in — the period every screen opens on.
 *
 * `now` is a parameter so a spec can name the day it means rather than depend on
 * the one the suite happens to run on.
 */
export function currentQuarter(now: Date = new Date()): QuarterInYear {
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

/**
 * The quarter a batch starts in, read from its ISO start date.
 *
 * `null` when the batch has no start date, or one that is not a date. A batch
 * with no start date belongs to no quarter at all, so a period filter never
 * offers it: the filter can only show what it can prove.
 *
 * The month is read out of the string rather than through `new Date(...)`, which
 * parses a bare date as UTC midnight and so reports a January batch as December
 * to anyone west of Greenwich.
 */
export function batchStartQuarter(startDate: string | null | undefined): QuarterInYear | null {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec((startDate ?? '').trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}

/** Whether a batch starts in the given year and/or quarter; `null` means "any". */
export function batchStartsIn(
  batch: BatchGroup,
  year: number | null,
  quarter: number | null,
): boolean {
  if (year === null && quarter === null) {
    return true;
  }
  const starts = batchStartQuarter(batch.startDate);
  if (!starts) {
    return false;
  }
  return (
    (year === null || starts.year === year) &&
    (quarter === null || starts.quarter === quarter)
  );
}

/** The years any of these batches start in, oldest first. */
export function batchStartYears(batches: readonly BatchGroup[]): number[] {
  const years = new Set<number>();
  for (const batch of batches) {
    const starts = batchStartQuarter(batch.startDate);
    if (starts) {
      years.add(starts.year);
    }
  }
  return [...years].sort((left, right) => left - right);
}

/** How a period reads in a sentence, e.g. `Q1 2026`, `Q1` or `2026`. */
export function periodLabel(year: number | null, quarter: number | null): string {
  const parts = [quarter === null ? null : `Q${quarter}`, year === null ? null : String(year)];
  return parts.filter((part) => part !== null).join(' ');
}
