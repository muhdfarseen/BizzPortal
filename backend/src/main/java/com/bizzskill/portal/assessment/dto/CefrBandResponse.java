package com.bizzskill.portal.assessment.dto;

import com.bizzskill.portal.assessment.entity.AppCefrBand;

/**
 * One band of the score to CEFR mapping.
 *
 * <p>The field names match the frontend's {@code CefrScoreBand} exactly
 * ({@code level}, {@code min}, {@code max}, {@code color}), so the mapping screen
 * can persist and reload its draft without a translation layer.
 *
 * @param level the awarded level — a standard CEFR level or a custom label.
 * @param min   lowest score (inclusive) that awards the level.
 * @param max   highest score (inclusive) that awards the level.
 * @param color id of a palette entry, e.g. {@code green}. Not validated against a
 *              fixed list: the palette belongs to the frontend, so adding a colour
 *              stays a frontend change with no backend deployment. An unknown id
 *              renders as the neutral fallback badge.
 */
public record CefrBandResponse(String level, Integer min, Integer max, String color) {

    public static CefrBandResponse from(AppCefrBand band) {
        return new CefrBandResponse(
                band.getTxtCefrLevel(),
                band.getIntMinScore(),
                band.getIntMaxScore(),
                band.getTxtColorId());
    }
}
