package com.bizzskill.portal.common.web;

import java.util.List;

/**
 * One page of a list, plus what the client needs to draw a pager.
 *
 * <p>Deliberately not Spring Data's {@code Page}: that serialises a large amount of
 * internal structure ({@code pageable}, {@code sort}, {@code numberOfElements},
 * {@code offset} …) which would then be part of our public contract and would
 * change whenever Spring changes. This is the small, stable subset a pager
 * actually uses.
 *
 * <p>{@code page} is zero-based, matching both Spring Data and the frontend's
 * table, so no off-by-one conversion is needed at either boundary.
 *
 * @param items         the rows of this page, never null.
 * @param page          zero-based index of this page.
 * @param size          maximum rows a page may hold, as requested.
 * @param totalElements rows matching the query across every page.
 * @param totalPages    number of pages, which is {@code 0} when nothing matched.
 * @param hasNext       whether a page after this one exists.
 */
public record PageResponse<T>(
        List<T> items, int page, int size, long totalElements, int totalPages, boolean hasNext) {

    /**
     * Builds a page from its rows and the total they were drawn from.
     *
     * <p>{@code totalPages} and {@code hasNext} are derived here rather than passed
     * in, so they cannot disagree with the rows the client is given.
     */
    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalElements) {
        int totalPages = size <= 0 ? 0 : (int) ((totalElements + size - 1) / size);
        return new PageResponse<>(items, page, size, totalElements, totalPages, page + 1 < totalPages);
    }
}
