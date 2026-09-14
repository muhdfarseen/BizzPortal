package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.CefrBandRequest;
import com.bizzskill.portal.assessment.dto.CefrBandResponse;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.repository.AppCefrBandRepository;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.RequestValidationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The score to CEFR mapping: reading it, replacing it, and resolving a score to a
 * level.
 *
 * <p>The resolution rule is the subtle part. Versant publishes overlapping ranges
 * (B2+ as 68-76 and C1 as 76-85), so a score can legitimately fall in two bands.
 * The band that awards the level is the one with the <em>highest</em> minimum, and
 * when two bands share a minimum, the later row wins. That makes 76 resolve to C1,
 * matching the frontend's {@code cefrFromScore}.
 *
 * <p>The logic is a pure static method as well as a service method, so it can be
 * tested exhaustively without a database, and so callers resolving many scores —
 * a bulk upload — can load the bands once and reuse them.
 */
@Service
@Transactional(readOnly = true)
public class CefrMappingService {

    private final AppCefrBandRepository bands;

    public CefrMappingService(AppCefrBandRepository bands) {
        this.bands = bands;
    }

    /** The mapping, lowest band first. */
    public List<CefrBandResponse> mapping() {
        return orderedBands().stream().map(CefrBandResponse::from).toList();
    }

    /** The mapping as entities, for callers that resolve many scores. */
    public List<AppCefrBand> orderedBands() {
        return bands.findAllByOrderByIntMinScoreAsc();
    }

    /** The level awarding a score, or {@code null} when no band covers it. */
    public String levelFor(int score) {
        return levelFor(score, orderedBands());
    }

    /**
     * Resolves a score against an already-loaded mapping.
     *
     * <p>Mirrors the frontend's {@code cefrFromScore} exactly, including its
     * fallback: a score outside every band rounds <em>down</em> to the highest band
     * that ends below it, so a score under the whole scale reads as the lowest
     * level and one above it as the highest. Without the fallback a score of 5 on a
     * 10-90 scale would render no badge at all, which reads as a bug rather than as
     * a very low result.
     *
     * @param orderedBands the bands sorted by ascending {@code intMinScore}.
     * @return the awarded level, or {@code null} only when no bands are configured.
     */
    public static String levelFor(int score, List<AppCefrBand> orderedBands) {
        if (orderedBands.isEmpty()) {
            return null;
        }

        AppCefrBand awarded = null;
        AppCefrBand highestEndingBelow = null;
        AppCefrBand lowest = orderedBands.get(0);

        for (AppCefrBand band : orderedBands) {
            if (score >= band.getIntMinScore() && score <= band.getIntMaxScore()) {
                // `>=` not `>`: on an equal minimum the later row wins, which is how
                // the B2+/C1 tie at 76 resolves to C1.
                if (awarded == null || band.getIntMinScore() >= awarded.getIntMinScore()) {
                    awarded = band;
                }
            }
            if (band.getIntMaxScore() < score
                    && (highestEndingBelow == null
                            || band.getIntMaxScore() > highestEndingBelow.getIntMaxScore())) {
                highestEndingBelow = band;
            }
            if (band.getIntMinScore() < lowest.getIntMinScore()) {
                lowest = band;
            }
        }

        if (awarded != null) {
            return awarded.getTxtCefrLevel();
        }
        return (highestEndingBelow != null ? highestEndingBelow : lowest).getTxtCefrLevel();
    }

    /**
     * Replaces the whole mapping.
     *
     * <p>A wholesale replace rather than a diff, because the level string is the
     * mapping's natural key and renaming a level would otherwise have to be
     * recognised as an update of a row whose key changed. Nothing is lost by
     * deleting: every recorded result stores the level it was awarded at the time,
     * so history does not depend on these rows surviving.
     *
     * @throws RequestValidationException if a band's range is inverted or two
     *         bands declare the same level.
     */
    @Transactional
    public List<CefrBandResponse> replace(List<CefrBandRequest> requested) {
        validate(requested);

        // A bulk delete issues the DELETE immediately, so the re-insert below
        // cannot collide with a row that is still pending removal.
        bands.deleteAllInBatch();

        List<AppCefrBand> replacements = new ArrayList<>(requested.size());
        for (int index = 0; index < requested.size(); index++) {
            CefrBandRequest band = requested.get(index);
            replacements.add(AppCefrBand.create(
                    band.level().trim(),
                    band.min(),
                    band.max(),
                    band.color().trim(),
                    index + 1));
        }

        return bands.saveAll(replacements).stream().map(CefrBandResponse::from).toList();
    }

    /**
     * Checks the rules bean validation cannot express.
     *
     * <p>Violations are reported against {@code bands[i].field} so the screen can
     * point at the offending row rather than showing a single generic error.
     */
    private void validate(List<CefrBandRequest> requested) {
        List<FieldViolation> violations = new ArrayList<>();
        Set<String> seenLevels = new LinkedHashSet<>();

        for (int index = 0; index < requested.size(); index++) {
            CefrBandRequest band = requested.get(index);
            if (band.level() == null || band.min() == null || band.max() == null) {
                // Field-level constraints report these; nothing to add here.
                continue;
            }

            if (band.min() > band.max()) {
                violations.add(new FieldViolation(
                        "bands[" + index + "].min",
                        "The lowest score for '" + band.level().trim() + "' cannot be above its highest."));
            }

            String key = band.level().trim().toLowerCase(Locale.ROOT);
            if (!seenLevels.add(key)) {
                violations.add(new FieldViolation(
                        "bands[" + index + "].level",
                        "'" + band.level().trim() + "' is used by more than one band."));
            }
        }

        if (!violations.isEmpty()) {
            throw new RequestValidationException(violations);
        }
    }
}
