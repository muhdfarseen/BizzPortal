package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.common.enums.TrackFilter;
import com.bizzskill.portal.organization.entity.Participant;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaExpression;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * The predicates behind a paged roster read.
 *
 * <p>Composed here rather than as a bank of derived query methods because the
 * filters are optional and independent: scope, search and track status each may
 * be present or absent, and four scope branches crossed with three track filters
 * would be a dozen near-identical finders.
 *
 * <p>Every predicate is written against the database, so the filters narrow the
 * rows the database returns rather than the rows the application has already
 * loaded. That is the whole point of paging: a filter applied after the page is
 * chosen would page over the unfiltered set and report the wrong total.
 */
public final class TraineeRosterSpecifications {

    private TraineeRosterSpecifications() {
    }

    /**
     * Narrows the roster to the caller's scope.
     *
     * @param lgId            a single learning group, or null to use the batches.
     * @param allowedBatchIds the batches the caller may see, or null for an
     *                        unrestricted caller. An empty collection means the
     *                        caller may see nothing and matches no row — which is
     *                        a different thing from null, and must not be treated
     *                        as "unrestricted".
     */
    public static Specification<Participant> inScope(Long lgId, Collection<Long> allowedBatchIds) {
        return (root, query, builder) -> {
            List<Predicate> parts = new ArrayList<>();

            // A participant with no employee number cannot be scored or addressed,
            // so it has never been part of the roster.
            parts.add(builder.isNotNull(root.get("intEmployeeId")));

            if (lgId != null) {
                parts.add(builder.equal(root.get("intLgId"), lgId));
            } else if (allowedBatchIds != null) {
                if (allowedBatchIds.isEmpty()) {
                    return builder.disjunction();
                }
                parts.add(root.get("intBatchId").in(allowedBatchIds));
            }

            return builder.and(parts.toArray(new Predicate[0]));
        };
    }

    /**
     * Matches the search box against the name or the employee number.
     *
     * <p>Case-insensitive substring on both, because the user types whichever they
     * have in front of them and should not have to know which column it lives in.
     * The employee number is compared as text so a partial number matches, which is
     * what makes typing {@code 412} useful.
     *
     * <p>The cast is Hibernate's rather than {@code Path#as}: {@code as} treats an
     * entity as a subtype and is not a SQL cast, so {@code lower(as(String.class))}
     * quietly emitted {@code lower(bigint)}, which PostgreSQL rejects outright.
     */
    public static Specification<Participant> matchesSearch(String search) {
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
                    builder.like(builder.lower(root.get("txtParticipantName")), pattern),
                    builder.like(builder.lower(employeeIdText), pattern));
        };
    }

    /**
     * Keeps only the trainees named, so a caller holding a list of employee numbers
     * can ask about exactly those instead of fetching the group and discarding it.
     *
     * <p>An empty list would match nothing, which is the correct reading of "resolve
     * none of these" — but it is also what a caller gets from a bug, so the endpoints
     * that use this reject an empty request before it reaches here.
     */
    public static Specification<Participant> hasEmployeeId(Collection<Long> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) {
            return null;
        }
        return (root, query, builder) -> root.get("intEmployeeId").in(employeeIds);
    }

    /**
     * Keeps only trainees whose current LAP / Remedial state matches.
     *
     * <p>"Current" is the open row: the database enforces at most one open track per
     * trainee with a partial unique index, so a correlated {@code exists} is exact
     * rather than an approximation that has to pick among several rows.
     */
    public static Specification<Participant> onTrack(TrackFilter filter) {
        if (filter == null) {
            return null;
        }
        return (root, query, builder) -> {
            Subquery<Long> open = query.subquery(Long.class);
            Root<AppLapRemedial> track = open.from(AppLapRemedial.class);

            List<Predicate> parts = new ArrayList<>();
            parts.add(builder.equal(track.get("intEmployeeId"), root.get("intEmployeeId")));
            parts.add(builder.equal(track.get("txtStatus"), LapStatus.OPEN));

            LapTrack wanted = filter.track();
            if (wanted != null) {
                parts.add(builder.equal(track.get("txtTrack"), wanted));
            }

            open.select(track.get("intLapRemedialId")).where(parts.toArray(new Predicate[0]));

            // "No track" is the same query negated.
            // CLEARED means they have no open track, but they DO have a closed track.
            // NONE means they have no open track, and they DO NOT have a closed track.
            
            Subquery<Long> closed = query.subquery(Long.class);
            Root<AppLapRemedial> closedTrack = closed.from(AppLapRemedial.class);
            closed.select(closedTrack.get("intLapRemedialId")).where(
                    builder.equal(closedTrack.get("intEmployeeId"), root.get("intEmployeeId")),
                    builder.equal(closedTrack.get("txtStatus"), LapStatus.CLOSED)
            );

            return switch (filter) {
                case CLEARED -> builder.and(builder.not(builder.exists(open)), builder.exists(closed));
                case NONE -> builder.and(builder.not(builder.exists(open)), builder.not(builder.exists(closed)));
                default -> builder.exists(open);
            };
        };
    }
}
