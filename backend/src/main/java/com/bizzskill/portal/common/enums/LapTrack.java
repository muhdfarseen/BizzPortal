package com.bizzskill.portal.common.enums;

/**
 * The LAP / Remedial tracks a trainee can be placed on.
 *
 * <p>Absence of an open track means "none"; there is deliberately no {@code NONE}
 * constant, so a trainee's track is never stored as a value that has no row.
 */
public enum LapTrack {

    REMEDIAL("remedial"),
    LAP("lap");

    private final String code;

    LapTrack(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static LapTrack fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (LapTrack track : values()) {
            if (track.code.equals(code)) {
                return track;
            }
        }
        throw new IllegalArgumentException("Unknown LAP/Remedial track: " + code);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class JpaConverter implements jakarta.persistence.AttributeConverter<LapTrack, String> {

        @Override
        public String convertToDatabaseColumn(LapTrack attribute) {
            return attribute == null ? null : attribute.getCode();
        }

        @Override
        public LapTrack convertToEntityAttribute(String dbData) {
            return fromCode(dbData);
        }
    }
}
