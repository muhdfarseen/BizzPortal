package com.bizzskill.portal.common.enums;

import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;

import java.util.List;
import java.util.Set;

/**
 * Which trainees a roster read wants, by the status they currently hold.
 *
 * <p>The screen's vocabulary rather than {@link TraineeStatus}: the Trainee status
 * page offers "Regular" as a tab, which is the <em>absence</em> of a current
 * status rather than a status value, and "Other" as one tab over the three exits
 * a trainee leaves by. Neither exists as a {@link TraineeStatus}, so the mapping
 * from tab to stored values lives here.
 *
 * <p>{@link #REGULAR} maps to no values at all, and a filter that wants no values
 * is read as "has no current status" — which is why every tab, including the
 * empty one, is the same query with a different set.
 */
public enum StatusFilter {

    /** No current status: progressing through the batch as normal. */
    REGULAR,

    /** Receiving remedial support. */
    REMEDIAL,

    /** On the Learning Assistance Programme. */
    LAP,

    /** Finished successfully. */
    CLEARED,

    /** Left: discontinued, purged or resigned. */
    OTHER;

    /** The stored statuses this tab shows. Empty for {@link #REGULAR}. */
    public Set<TraineeStatus> statuses() {
        return switch (this) {
            case REGULAR -> Set.of();
            case REMEDIAL -> Set.of(TraineeStatus.REMEDIAL);
            case LAP -> Set.of(TraineeStatus.LAP);
            case CLEARED -> Set.of(TraineeStatus.CLEARED);
            case OTHER -> TraineeStatus.OTHER;
        };
    }

    /** Whether this tab shows trainees holding no status at all. */
    public boolean isAbsence() {
        return statuses().isEmpty();
    }

    /**
     * Reads the {@code status} query parameter, where absent means "do not filter".
     *
     * @throws RequestValidationException if the value is not one of the five.
     */
    public static StatusFilter parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException unknown) {
            throw new RequestValidationException(List.of(new FieldViolation(
                    "status", "Status must be one of: regular, remedial, lap, cleared, other.")));
        }
    }
}
