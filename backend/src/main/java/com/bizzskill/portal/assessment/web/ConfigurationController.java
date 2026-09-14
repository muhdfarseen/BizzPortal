package com.bizzskill.portal.assessment.web;

import com.bizzskill.portal.assessment.dto.AssessmentRequest;
import com.bizzskill.portal.assessment.dto.AssessmentResponse;
import com.bizzskill.portal.assessment.dto.CefrBandRequest;
import com.bizzskill.portal.assessment.dto.CefrBandResponse;
import com.bizzskill.portal.assessment.service.AssessmentConfigService;
import com.bizzskill.portal.assessment.service.CefrMappingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Configuration: the assessments, and the score to CEFR mapping.
 *
 * <p>Reads and writes are guarded by different permissions on purpose. Every role
 * needs to read the assessments (the results table builds its columns from them)
 * and the CEFR mapping (badges are coloured from it), but only a Super Admin holds
 * {@code configuration.manage}, so only a Super Admin can change them.
 */
@RestController
@RequestMapping("/api/configuration")
public class ConfigurationController {

    private final AssessmentConfigService assessments;
    private final CefrMappingService cefrMapping;

    public ConfigurationController(
            AssessmentConfigService assessments, CefrMappingService cefrMapping) {
        this.assessments = assessments;
        this.cefrMapping = cefrMapping;
    }

    /** Every assessment, including retired ones, for the Configuration screen. */
    @GetMapping("/assessments")
    @PreAuthorize("hasAuthority('assessments.view')")
    public List<AssessmentResponse> assessments() {
        return assessments.list();
    }

    /**
     * Only the assessments that can still be scored against.
     *
     * <p>What the results table and the bulk upload use, so a retired assessment
     * stops appearing as a column without its history disappearing.
     */
    @GetMapping("/assessments/active")
    @PreAuthorize("hasAuthority('assessments.view')")
    public List<AssessmentResponse> activeAssessments() {
        return assessments.active();
    }

    @PostMapping("/assessments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('configuration.manage')")
    public AssessmentResponse createAssessment(@Valid @RequestBody AssessmentRequest request) {
        return assessments.create(request);
    }

    @PutMapping("/assessments/{id}")
    @PreAuthorize("hasAuthority('configuration.manage')")
    public AssessmentResponse updateAssessment(
            @PathVariable Long id, @Valid @RequestBody AssessmentRequest request) {
        return assessments.update(id, request);
    }

    @DeleteMapping("/assessments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('configuration.manage')")
    public void deleteAssessment(@PathVariable Long id) {
        assessments.delete(id);
    }

    /**
     * The CEFR mapping, lowest band first.
     *
     * <p>Readable by anyone who can view assessments, because the score badges on
     * every results table are rendered from it.
     */
    @GetMapping("/cefr-mapping")
    @PreAuthorize("hasAuthority('assessments.view')")
    public List<CefrBandResponse> cefrMapping() {
        return cefrMapping.mapping();
    }

    /**
     * Replaces the whole mapping.
     *
     * <p>Submitted as a bare JSON array, which is exactly the shape the
     * Configuration screen's draft already has. The list is validated in the
     * service rather than with {@code @Valid}, because the rules that matter —
     * an inverted range, a duplicated level — span rows and need to be reported
     * against a specific index.
     */
    @PutMapping("/cefr-mapping")
    @PreAuthorize("hasAuthority('configuration.manage')")
    public List<CefrBandResponse> replaceCefrMapping(@RequestBody List<CefrBandRequest> bands) {
        return cefrMapping.replace(bands);
    }
}
