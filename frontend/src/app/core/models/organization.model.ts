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
