package com.bizzskill.portal.common.enums;

import java.util.Set;

/**
 * The statuses a trainee can hold.
 *
 * <p>A trainee holds exactly one at a time, and it is stored as the current row
 * of {@code app_trainee_status}. There is deliberately no {@code REGULAR}
 * constant: a trainee who is simply progressing through their batch holds no
 * status at all, so "regular" is the <em>absence</em> of a current row rather
 * than a value. Were it stored, every trainee would need a row asserting that
 * nothing is happening, and the index that permits one current row per trainee
 * could no longer tell "regular" apart from "never asked".
 *
 * <p>Three statuses are outcomes rather than stages of support — a trainee who
 * has cleared, resigned, been discontinued or been purged is no longer being
 * supported, and the record stays so that the figures can still account for
 * them. {@link #isExit()} marks those, which is what the dashboard's "others"
 * figure counts apart from {@link #CLEARED}.
 */
public enum TraineeStatus {

    /** Extra support to reach the standard. */
    REMEDIAL("remedial", "Remedial"),

    /** The Learning Assistance Programme, for trainees needing more than remedial. */
    LAP("lap", "LAP"),

    /** Finished successfully. */
    CLEARED("cleared", "Cleared"),

    /** Left the programme before finishing. */
    DISCONTINUED("discontinued", "Discontinued"),

    /** Removed from the programme's records. */
    PURGED("purged", "Purged"),

    /** Left of their own accord. */
    RESIGNED("resigned", "Resigned");

    /** The exit statuses that are not a successful finish, grouped on screen as "Other". */
    public static final Set<TraineeStatus> OTHER =
            Set.of(DISCONTINUED, PURGED, RESIGNED);

    private final String code;
    private final String label;

    TraineeStatus(String code, String label) {
        this.code = code;
        this.label = label;
    }

    public String getCode() {
        return code;
    }

    /**
     * How the status is written in a message to a person.
     *
     * <p>Held here rather than only on the client because the server has to name a
     * status when it refuses one — "this trainee is already on LAP" is no use to
     * anyone as "already on lap".
     */
    public String getLabel() {
        return label;
    }

    /**
     * Whether this status means the trainee has left rather than finished.
     *
     * <p>{@link #CLEARED} is an outcome too, but a successful one, so it is
     * counted on its own rather than among {@link #OTHER}.
     */
    public boolean isExit() {
        return OTHER.contains(this);
    }

    /**
     * Reads the stored code.
     *
     * @throws IllegalArgumentException if the code is not one of the six. A row
     *                                  holding an unknown status is a broken
     *                                  database, not a request to reject, so it
     *                                  is deliberately not swallowed.
     */
    public static TraineeStatus fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (TraineeStatus status : values()) {
            if (status.code.equals(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown trainee status: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<TraineeStatus, String> {

        @Override
        public String convertToDatabaseColumn(TraineeStatus attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public TraineeStatus convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
