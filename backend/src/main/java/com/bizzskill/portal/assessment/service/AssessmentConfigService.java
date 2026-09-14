package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.AssessmentRequest;
import com.bizzskill.portal.assessment.dto.AssessmentResponse;
import com.bizzskill.portal.assessment.entity.AppAssessment;
import com.bizzskill.portal.assessment.repository.AppAssessmentRepository;
import com.bizzskill.portal.assessment.repository.AppAssessmentResultRepository;
import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.common.error.BusinessRuleException;
import com.bizzskill.portal.common.error.ConflictException;
import com.bizzskill.portal.common.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Assessment configuration: the exams trainees are assessed against.
 *
 * <p>Assessments are data, not an enum, so an administrator can add one — or edit
 * a maximum score — without a deployment. Deleting is guarded rather than
 * cascading: an assessment with recorded results is retired by deactivating it,
 * because deleting it would either destroy marks or orphan them.
 */
@Service
@Transactional(readOnly = true)
public class AssessmentConfigService {

    private final AppAssessmentRepository assessments;
    private final AppAssessmentResultRepository results;

    public AssessmentConfigService(
            AppAssessmentRepository assessments, AppAssessmentResultRepository results) {
        this.assessments = assessments;
        this.results = results;
    }

    /** Every assessment, for the Configuration screen. */
    public List<AssessmentResponse> list() {
        return assessments.findAllByOrderByIntSortOrderAsc().stream()
                .map(AssessmentResponse::from)
                .toList();
    }

    /**
     * The assessments that may be scored against.
     *
     * <p>Used by the results table and the bulk upload: a retired assessment keeps
     * its history but is no longer offered as a column or an upload target.
     */
    public List<AssessmentResponse> active() {
        return assessments.findAllByOrderByIntSortOrderAsc().stream()
                .filter(assessment -> assessment.getTxtStatus() == Status.ACTIVE)
                .map(AssessmentResponse::from)
                .toList();
    }

    @Transactional
    public AssessmentResponse create(AssessmentRequest request) {
        String name = request.name().trim();
        ensureNameIsFree(name, null);

        int sortOrder = Optional.ofNullable(request.sortOrder())
                .orElseGet(() -> assessments.findAllByOrderByIntSortOrderAsc().stream()
                        .mapToInt(AppAssessment::getIntSortOrder)
                        .max()
                        .orElse(0) + 1);

        AppAssessment assessment = AppAssessment.create(
                name, trimToNull(request.description()), request.maxScore(), sortOrder);

        if (request.status() != null) {
            assessment.setTxtStatus(toStatus(request.status()));
        }

        return AssessmentResponse.from(assessments.save(assessment));
    }

    @Transactional
    public AssessmentResponse update(Long id, AssessmentRequest request) {
        AppAssessment assessment = require(id);
        String name = request.name().trim();
        ensureNameIsFree(name, id);
        refuseLoweringBelowRecordedScores(assessment, request.maxScore());

        assessment.rename(name);
        assessment.describe(trimToNull(request.description()));
        assessment.setIntMaxScore(request.maxScore());

        if (request.sortOrder() != null) {
            assessment.setIntSortOrder(request.sortOrder());
        }
        if (request.status() != null) {
            assessment.setTxtStatus(toStatus(request.status()));
        }

        return AssessmentResponse.from(assessment);
    }

    /**
     * Deletes an assessment that has never been used.
     *
     * @throws BusinessRuleException if results reference it, naming the count so
     *         the administrator understands the cost of what they asked for.
     */
    @Transactional
    public void delete(Long id) {
        AppAssessment assessment = require(id);

        long recorded = results.countByAssessment(id);
        if (recorded > 0) {
            throw new BusinessRuleException(
                    "'" + assessment.getTxtAssessmentName() + "' has " + recorded
                            + " recorded result(s) and cannot be deleted. "
                            + "Set its status to inactive to retire it instead.");
        }

        assessments.delete(assessment);
    }

    /**
     * Refuses a maximum below a score already recorded.
     *
     * <p>Lowering the ceiling is legitimate — re-scaling an exam is a real thing —
     * but not past the scores already in the table. Allowing it would leave results
     * the assessment itself declares impossible, and every later read would show a
     * score above its own maximum with no way to tell which of the two is wrong.
     */
    private void refuseLoweringBelowRecordedScores(AppAssessment assessment, Integer newMaxScore) {
        if (newMaxScore >= assessment.getIntMaxScore()) {
            return;
        }

        Integer highest = results.findHighestScore(assessment.getIntAssessmentId());
        if (highest != null && newMaxScore < highest) {
            throw new BusinessRuleException(
                    "The highest score recorded for '" + assessment.getTxtAssessmentName()
                            + "' is " + highest + ", so the maximum cannot be lowered to " + newMaxScore
                            + ". Re-score those results first.");
        }
    }

    private AppAssessment require(Long id) {
        return assessments.findById(id).orElseThrow(() -> NotFoundException.of("assessment", id));
    }

    /**
     * Refuses a duplicate name.
     *
     * <p>Compared case-insensitively because "Pre Assessment" and "pre assessment"
     * are the same column to a reader, and the unique index — being case-sensitive
     * — would happily accept both.
     */
    private void ensureNameIsFree(String name, Long editingId) {
        assessments.findByTxtAssessmentNameIgnoreCase(name).ifPresent(existing -> {
            if (!existing.getIntAssessmentId().equals(editingId)) {
                throw new ConflictException("An assessment named '" + name + "' already exists.");
            }
        });
    }

    private Status toStatus(String status) {
        return "inactive".equals(status.toLowerCase(Locale.ROOT)) ? Status.INACTIVE : Status.ACTIVE;
    }

    /** Stores absent descriptions as {@code null} rather than an empty string. */
    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
