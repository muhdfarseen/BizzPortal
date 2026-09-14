import { HttpParams } from '@angular/common/http';

/**
 * Paging, shared by every list endpoint.
 *
 * The API pages, searches, filters and sorts in the database, so a client holds
 * exactly one page and never a whole table. These types mirror the envelope the
 * API answers with, so nothing has to be translated at the boundary — in
 * particular `totalElements` counts the whole result set, never the page on
 * screen.
 */

/** Which way a sorted list runs. */
export type SortDirection = 'asc' | 'desc';

/** One page of a list, as every paged endpoint returns it. */
export interface Page<T> {
  /** The rows of this page, never more than {@link size}. */
  items: readonly T[];
  /** Zero-based index of this page. */
  page: number;
  /** Maximum rows a page may hold, as requested. */
  size: number;
  /** Rows matching the query across every page. */
  totalElements: number;
  /** Number of pages, which is `0` when nothing matched. */
  totalPages: number;
  /** Whether a page after this one exists. */
  hasNext: boolean;
}

/** Rows a paged request returns when it does not ask for a size. */
export const DEFAULT_PAGE_SIZE = 25;

/** The page every new query starts on. */
export const FIRST_PAGE = 0;

/**
 * The paging, search and sort inputs a paged endpoint accepts.
 *
 * Every field is optional because omitting one means the same thing to the API
 * as its default: the first page, the default size, no search narrowing, and
 * the endpoint's own order.
 */
export interface PagedQuery {
  page?: number;
  size?: number;
  search?: string;
  /** Sort key — one of the endpoint's allowed columns. */
  sort?: string;
  direction?: SortDirection;
}

/**
 * Adds the paging keys a request actually sets.
 *
 * A blank search is left off rather than sent empty: the server reads blank as
 * "no narrowing" too, so sending it would only make every page's URL differ
 * from the one before it, defeating caching for no behavioural gain.
 */
export function pagedParams(query: PagedQuery, params: HttpParams = new HttpParams()): HttpParams {
  if (query.page !== undefined) {
    params = params.set('page', String(query.page));
  }
  if (query.size !== undefined) {
    params = params.set('size', String(query.size));
  }
  const search = query.search?.trim();
  if (search) {
    params = params.set('search', search);
  }
  if (query.sort) {
    params = params.set('sort', query.sort);
  }
  if (query.direction) {
    params = params.set('direction', query.direction);
  }
  return params;
}
