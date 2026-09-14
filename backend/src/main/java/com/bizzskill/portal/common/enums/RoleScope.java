package com.bizzskill.portal.common.enums;

/**
 * How much of the organisation a role's permissions reach.
 *
 * <p>This is what turns a permission check into a data filter: a role holding
 * {@code assessments.view} with scope {@link #ASSIGNED_BATCHES} may read results
 * <em>only</em> for the batches assigned to that user. Scope is therefore
 * enforced in the query layer, never in the UI.
 */
public enum RoleScope {

    /** Every location and batch; no assignment needed. */
    ALL("all"),
    /** Only the locations assigned to the user. */
    ASSIGNED_LOCATIONS("assigned-locations"),
    /** Only the batches assigned to the user, within their locations. */
    ASSIGNED_BATCHES("assigned-batches");

    private final String code;

    RoleScope(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static RoleScope fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (RoleScope scope : values()) {
            if (scope.code.equals(code)) {
                return scope;
            }
        }
        throw new IllegalArgumentException("Unknown role scope: " + code);
    }

    /** Whether users of this scope must be assigned at least one location. */
    public boolean requiresLocations() {
        return this != ALL;
    }

    /** Whether users of this scope must be assigned at least one batch. */
    public boolean requiresBatches() {
        return this == ASSIGNED_BATCHES;
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<RoleScope, String> {

        @Override
        public String convertToDatabaseColumn(RoleScope attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public RoleScope convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
