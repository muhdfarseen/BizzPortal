package com.bizzskill.portal.common.enums;

/**
 * What happened to an assessment result, for the audit trail.
 *
 * <p>{@link #UPLOAD} is kept distinct from {@link #UPDATE} so a score change can
 * be attributed to a bulk spreadsheet upload rather than to someone editing the
 * row by hand — the two carry very different investigation value.
 */
public enum AuditAction {

    INSERT("INSERT"),
    UPDATE("UPDATE"),
    DELETE("DELETE"),
    UPLOAD("UPLOAD");

    private final String code;

    AuditAction(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static AuditAction fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (AuditAction action : values()) {
            if (action.code.equals(code)) {
                return action;
            }
        }
        throw new IllegalArgumentException("Unknown audit action: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<AuditAction, String> {

        @Override
        public String convertToDatabaseColumn(AuditAction attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public AuditAction convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
