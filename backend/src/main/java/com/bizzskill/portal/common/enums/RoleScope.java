package com.bizzskill.portal.common.enums;

/**
 * How much of the organisation a role's permissions reach.
 *
 * <p>This is what turns a permission check into a data filter: a role holding
 * {@code assessments.view} with scope {@link #ASSIGNED_LOCATIONS} may read
 * results <em>only</em> for the locations assigned to that user — and every batch
 * and learning group inside them. Scope is therefore enforced in the query layer,
 * never in the UI.
 *
 * <p>There is deliberately no batch-level scope. Access was granted per location
 * and per batch, and a location-scoped user could see only some of a location's
 * batches, which made the same person see a partial roster. Location access now
 * means the whole location.
 */
public enum RoleScope {

    /** Every location and batch; no assignment needed. */
    ALL("all"),
    /** Only the locations assigned to the user, and everything inside them. */
    ASSIGNED_LOCATIONS("assigned-locations");

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
