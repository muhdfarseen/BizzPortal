package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.entity.AppAssessmentResult;
import com.bizzskill.portal.assessment.entity.AppAssessmentResultAudit;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultAuditRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Writes a single score and records what it replaced.
 *
 * <p>Extracted from the roster service so that inline score entry and the bulk
 * upload cannot diverge. They were the obvious pair to drift: the upload writes
 * hundreds of results in one request, and a second implementation of "update the
 * result and audit it" is exactly how a bulk path ends up silently skipping the
 * audit trail that the single-row path writes.
 *
 * <p>Each audit row is inserted in the same transaction as its change, so the two
 * cannot disagree.
 */
@Component
public class AssessmentResultWriter {

    private final AppAssessmentResultRepository results;
    private final AppAssessmentResultAuditRepository audit;

    public AssessmentResultWriter(
            AppAssessmentResultRepository results, AppAssessmentResultAuditRepository audit) {
        this.results = results;
        this.audit = audit;
    }

    /**
     * Applies a score, or clears it when {@code score} is null.
     *
     * @param assessedOn the date the exam was conducted, recorded with the result.
     *                   It is supplied by the caller rather than read from the clock
     *                   here, because the day a score is keyed in is not necessarily
     *                   the day the exam was sat — a sheet is often uploaded the
     *                   following morning.
     * @param bands      the CEFR mapping, loaded once by the caller and reused across
     *                   every score it writes.
     * @param actor      the username recorded in the audit trail.
     */
    public void write(
            Long employeeId,
            Long assessmentId,
            Integer score,
            LocalDate assessedOn,
            List<AppCefrBand> bands,
            String actor) {

        Optional<AppAssessmentResult> existing =
                results.findByIntEmployeeIdAndIntAssessmentId(employeeId, assessmentId);

        if (score == null) {
            existing.ifPresent(result -> {
                audit.save(AppAssessmentResultAudit.ofDelete(result, actor));
                results.delete(result);
            });
            return;
        }

        if (existing.isPresent()) {
            AppAssessmentResult result = existing.get();
            if (Objects.equals(result.getIntScore(), score)) {
                // Unchanged: re-writing it would add audit noise that buries the
                // changes that actually matter.
                return;
            }
            // Read the values being replaced before recording the new ones: the
            // entity is mutated in place, so it cannot supply both halves of the
            // audit row.
            Integer previousScore = result.getIntScore();
            String previousLevel = result.getTxtCefrLevel();

            result.recordScore(score, CefrMappingService.levelFor(score, bands), result.getTxtRemarks(), assessedOn);
            audit.save(AppAssessmentResultAudit.ofUpdate(result, previousScore, previousLevel, actor));
            return;
        }

        AppAssessmentResult created = AppAssessmentResult.create(employeeId, assessmentId);
        created.recordScore(score, CefrMappingService.levelFor(score, bands), null, assessedOn);
        AppAssessmentResult saved = results.save(created);
        audit.save(AppAssessmentResultAudit.ofInsert(saved, actor));
    }
}
