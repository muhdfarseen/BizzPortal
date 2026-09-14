package com.bizzskill.portal.common.web;

import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.util.ArrayList;
import java.util.List;

/**
 * The paging part of a list request, read from the query string.
 *
 * <p>Exists so every paged endpoint interprets {@code page} and {@code size} the
 * same way, and so the cap is enforced in one place. A client that asks for
 * {@code size=100000} is refused rather than allowed to pull the table it was
 * trying to avoid loading — an uncapped page size is the unbounded query wearing
 * a different hat.
 *
 * <p>{@code page} is zero-based. A negative page is a client bug, so it is a
 * validation failure rather than something silently clamped to the first page:
 * clamping would hide the bug and make the client's "next page" maths wrong.
 *
 * @param page   zero-based page index.
 * @param size   rows per page, between 1 and {@link #MAX_SIZE}.
 * @param search free text matched against the list's own searchable fields, or
 *               null/blank for no filter.
 */
public record PageQuery(int page, int size, String search) {

    /** Rows returned when the client does not ask for a size. */
    public static final int DEFAULT_SIZE = 25;

    /**
     * Largest page a client may request.
     *
     * <p>A ceiling rather than no limit: it bounds both the response and the
     * database work behind it, so one request cannot hold a connection open
     * scanning an unbounded result set.
     */
    public static final int MAX_SIZE = 100;

    /** Reads paging from the query string, applying the defaults and the cap. */
    public static PageQuery of(Integer page, Integer size, String search) {
        int resolvedPage = page == null ? 0 : page;
        int resolvedSize = size == null ? DEFAULT_SIZE : size;

        List<FieldViolation> violations = new ArrayList<>();
        if (resolvedPage < 0) {
            violations.add(new FieldViolation("page", "Page must be zero or greater."));
        }
        if (resolvedSize < 1 || resolvedSize > MAX_SIZE) {
            violations.add(new FieldViolation(
                    "size", "Page size must be between 1 and " + MAX_SIZE + "."));
        }
        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }

        String trimmed = search == null ? null : search.trim();
        return new PageQuery(resolvedPage, resolvedSize, trimmed == null || trimmed.isEmpty() ? null : trimmed);
    }

    /**
     * The Spring Data page request behind this query.
     *
     * <p>The sort is always supplied by the caller: a page boundary over rows with
     * no total order can repeat or skip a row, so an unsorted paged read is a bug
     * rather than a default.
     */
    public PageRequest toPageRequest(Sort sort) {
        return PageRequest.of(page, size, sort);
    }
}
