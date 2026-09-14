package com.bizzskill.portal.common.enums;

/**
 * Whether a LAP / Remedial placement is still running.
 *
 * <p>Distinct from {@link Status}: a closed track is {@code 'C'}, not inactive.
 * A trainee's current track is the one row that is {@link #OPEN}, which the
 * database enforces with a partial unique index.
 */
public enum LapStatus {

    OPEN("A"),
    CLOSED("C");

    private final String code;

    LapStatus(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static LapStatus fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (LapStatus status : values()) {
            if (status.code.equals(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown LAP/Remedial status: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<LapStatus, String> {

        @Override
        public String convertToDatabaseColumn(LapStatus attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public LapStatus convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
