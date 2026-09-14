package com.bizzskill.portal.user.repository;

import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.user.entity.AppUser;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaExpression;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

/**
 * The predicates behind a paged account list.
 *
 * <p>Every filter the user-management screen offers is applied in the database, so
 * the screen's search and its role / status dropdowns narrow the whole table rather
 * than whichever page happens to be loaded.
 */
public final class AppUserSpecifications {

    private AppUserSpecifications() {
    }

    /**
     * Matches the search box against the name, the employee number or the email.
     *
     * <p>Three fields rather than the roster's two, because an administrator looking
     * for an account may have been given any of them. The employee number is cast to
     * text so a partial number matches; the cast is Hibernate's, because
     * {@code Path#as} is a subtype conversion rather than a SQL cast.
     */
    public static Specification<AppUser> matchesSearch(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String pattern = "%" + search.trim().toLowerCase() + "%";
        return (root, query, builder) -> {
            @SuppressWarnings("unchecked")
            JpaExpression<Object> employeeId = (JpaExpression<Object>) root.get("intEmployeeId");
            JpaExpression<String> employeeIdText =
                    ((HibernateCriteriaBuilder) builder).cast(employeeId, String.class);

            return builder.or(
                    builder.like(builder.lower(root.get("txtName")), pattern),
                    builder.like(builder.lower(employeeIdText), pattern),
                    builder.like(builder.lower(root.get("txtEmail")), pattern));
        };
    }

    /** Keeps only accounts holding the given role code. */
    public static Specification<AppUser> hasRole(String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return null;
        }
        return (root, query, builder) ->
                builder.equal(root.get("role").get("txtRoleCode"), roleCode.trim());
    }

    /**
     * Keeps only accounts in the given state.
     *
     * <p>Reads the same {@code active} / {@code inactive} vocabulary the client sends
     * and the API returns, rather than the database's {@code 'A'} / {@code 'I'}: the
     * single-character codes stay behind the entity mapping.
     */
    public static Specification<AppUser> hasStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        Status wanted = "inactive".equalsIgnoreCase(status.trim()) ? Status.INACTIVE : Status.ACTIVE;
        return (root, query, builder) -> builder.equal(root.get("txtStatus"), wanted);
    }

    /** Combines the filters that are present, ignoring the ones that are not. */
    public static Specification<AppUser> matching(String search, String roleCode, String status) {
        List<Specification<AppUser>> parts = new ArrayList<>();
        parts.add(matchesSearch(search));
        parts.add(hasRole(roleCode));
        parts.add(hasStatus(status));

        Specification<AppUser> combined = null;
        for (Specification<AppUser> part : parts) {
            if (part == null) {
                continue;
            }
            combined = combined == null ? part : combined.and(part);
        }

        // Every filter absent still has to be a specification rather than null, so
        // the caller never has to special-case "no filters".
        return combined == null
                ? (root, query, builder) -> builder.conjunction()
                : combined;
    }
}
