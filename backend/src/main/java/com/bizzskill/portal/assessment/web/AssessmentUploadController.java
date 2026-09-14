package com.bizzskill.portal.assessment.web;

import com.bizzskill.portal.assessment.dto.UploadCommitRequest;
import com.bizzskill.portal.assessment.dto.UploadCommitResponse;
import com.bizzskill.portal.assessment.service.AssessmentUploadService;
import com.bizzskill.portal.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

/**
 * Downloading the bulk-upload template, and committing a filled-in sheet.
 *
 * <p>The template is served for the same filtered group the assessment table is
 * showing, so what the user downloads matches what they are looking at.
 */
@RestController
@RequestMapping("/api/assessments/uploads")
public class AssessmentUploadController {

    /**
     * Sent as a header rather than left to the browser, which would otherwise save
     * the file as "template" or open it in a tab. The CORS configuration exposes
     * this header so the frontend can read the name it suggests.
     */
    private static final String TEMPLATE_FILENAME = "assessment-template.csv";

    private final AssessmentUploadService uploads;
    private final CurrentUser currentUser;

    public AssessmentUploadController(AssessmentUploadService uploads, CurrentUser currentUser) {
        this.uploads = uploads;
        this.currentUser = currentUser;
    }

    /**
     * The template CSV, prefilled with the group's trainees and their current
     * scores.
     *
     * <p>Guarded by {@code assessments.view}, not {@code .edit}: downloading a
     * template changes nothing, and a user who can see the table should be able to
     * get the sheet. The commit below is what requires the write permission.
     */
    @GetMapping(value = "/template", produces = "text/csv;charset=UTF-8")
    @PreAuthorize("hasAuthority('assessments.view')")
    public ResponseEntity<String> template(
            @RequestParam String examId,
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId) {

        String csv = uploads.templateCsv(currentUser.require(), locationId, batchId, lgId, examId);

        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + TEMPLATE_FILENAME + "\"")
                .body(csv);
    }

    /** Writes a validated sheet, refusing the whole upload if any row is wrong. */
    @PostMapping
    @PreAuthorize("hasAuthority('assessments.edit')")
    public UploadCommitResponse commit(@Valid @RequestBody UploadCommitRequest request) {
        return uploads.commit(currentUser.require(), request);
    }
}
