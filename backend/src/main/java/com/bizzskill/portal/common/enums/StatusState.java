package com.bizzskill.portal.common.enums;

/**
 * The state of one row of {@code app_trainee_status}.
 *
 * <p>Distinct from {@link TraineeStatus}, which is the status the trainee held:
 * this is whether the row is the live one. A trainee's current status is the
 * single row that is {@link #CURRENT}, which the database enforces with a
 * partial unique index; superseding a status sets the old row to
 * {@link #SUPERSEDED} and keeps it, so the sequence of statuses a trainee has
 * held is preserved rather than overwritten.
 *
 * <p>The codes are the letters the column has always held. They are not
 * {@code A}/{@code C} for "active"/"closed" by accident — a superseded status is
 * still part of the record — so the constants are named for what the row is,
 * not for whether anyone is still working on it.
 */
public enum StatusState {

    /** The trainee's current status. */
    CURRENT("A"),

    /** Superseded by a later status; kept as history. */
    SUPERSEDED("C");

    private final String code;

    StatusState(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static StatusState fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (StatusState state : values()) {
            if (state.code.equals(code)) {
                return state;
            }
        }
        throw new IllegalArgumentException("Unknown status state: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<StatusState, String> {

        @Override
        public String convertToDatabaseColumn(StatusState attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public StatusState convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
