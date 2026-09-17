package com.bizzskill.portal.common.enums;

import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;

import java.util.List;

/**
 * Which trainees a roster read wants, by their open LAP / Remedial track.
 *
 * <p>The roster's own status vocabulary, not {@link LapTrack}: the LAP / Remedial
 * screen offers "No LAP / Remedial" as a tab, which is the <em>absence</em> of an
 * open track rather than a track value. {@link LapTrack} deliberately has no
 * {@code NONE} constant because a trainee on no track has no row to store, so the
 * "no track" case has to be expressed as a filter rather than as a value — which
 * is exactly what {@link #NONE} is.
 */
public enum TrackFilter {

    /** An open Remedial track. */
    REMEDIAL,

    /** An open LAP track. */
    LAP,

    /** No open track at all, but has a closed track. */
    CLEARED,

    /** No open track and no closed track. */
    NONE;

    /**
     * Reads the {@code status} query parameter, where absent means "do not filter".
     *
     * @throws RequestValidationException if the value is not one of the values.
     */
    public static TrackFilter parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException unknown) {
            throw new RequestValidationException(
                    List.of(new FieldViolation("status", "Status must be one of: remedial, lap, cleared, none.")));
        }
    }

    /** The specific track this filter wants, or null when it wants their absence. */
    public LapTrack track() {
        return switch (this) {
            case REMEDIAL -> LapTrack.REMEDIAL;
            case LAP -> LapTrack.LAP;
            case CLEARED, NONE -> null;
        };
    }
}
