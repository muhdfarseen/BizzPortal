package com.bizzskill.portal.common.web;

import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;
import org.springframework.data.domain.Sort;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The sort part of a list request, resolved against a whitelist.
 *
 * <p>The field is looked up in a map of allowed keys rather than turned into a
 * property name. Passing client input into an <code>order by</code> is the one place
 * a list endpoint can be made to read a column it should not, or to fail with a
 * database error that leaks the schema — so an unknown key is a 400 here, long
 * before it reaches a query.
 *
 * <p>Whatever the client asks for, the tie-breakers are appended. A page boundary
 * between rows that compare equal can return one twice and never return another, so
 * the order has to be total, not merely sorted.
 */
public final class SortQuery {

    private SortQuery() {
    }

    /**
     * Resolves the requested sort, or the fallback when none was asked for.
     *
     * @param field       the client's sort key, or null for the default order.
     * @param direction   {@code asc} or {@code desc}; defaults to ascending.
     * @param allowed     client-facing key to entity property. Also the error message.
     * @param tieBreakers appended to keep the order total.
     */
    public static Sort resolve(
            String field, String direction, Map<String, String> allowed, Sort tieBreakers) {

        // Validated before the early return below: a direction that is not asc or
        // desc is a client bug whether or not a field came with it, and silently
        // ignoring it when the field is missing would hide the bug on exactly the
        // request where it is hardest to notice.
        boolean descending = false;
        if (direction != null && !direction.isBlank()) {
            String normalised = direction.trim().toLowerCase();
            if (!normalised.equals("asc") && !normalised.equals("desc")) {
                throw new RequestValidationException(
                        List.of(new FieldViolation("direction", "Direction must be asc or desc.")));
            }
            descending = normalised.equals("desc");
        }

        if (field == null || field.isBlank()) {
            return tieBreakers;
        }

        String property = allowed.get(field.trim());
        if (property == null) {
            throw new RequestValidationException(List.of(new FieldViolation(
                    "sort", "Sort must be one of: " + String.join(", ", allowed.keySet()) + ".")));
        }

        Sort primary = Sort.by(
                descending ? Sort.Order.desc(property) : Sort.Order.asc(property));

        // A tie-breaker on the field being sorted would be redundant at best and a
        // duplicate order-by term at worst, so it is dropped when it repeats.
        Set<String> already = new LinkedHashSet<>();
        already.add(property);

        Sort combined = primary;
        for (Sort.Order order : tieBreakers) {
            if (already.add(order.getProperty())) {
                combined = combined.and(Sort.by(order));
            }
        }
        return combined;
    }
}
