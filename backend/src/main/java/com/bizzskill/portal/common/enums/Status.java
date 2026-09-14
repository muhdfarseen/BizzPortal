package com.bizzskill.portal.common.enums;

/**
 * Whether a row is in use.
 *
 * <p>Persisted as the single-character codes the portal's own tables use
 * ({@code 'A'} / {@code 'I'}), so the two schemas stay consistent. The nested
 * converter is {@code autoApply}, so no entity needs a {@code @Convert}
 * annotation.
 */
public enum Status {

    /** In use. */
    ACTIVE("A"),
    /** Soft-deleted: retained for history, refused at login and hidden from lists. */
    INACTIVE("I");

    private final String code;

    Status(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /** The status with this database code, or {@code null} for {@code null}. */
    public static Status fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (Status status : values()) {
            if (status.code.equals(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown status code: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<Status, String> {

        @Override
        public String convertToDatabaseColumn(Status attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public Status convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
