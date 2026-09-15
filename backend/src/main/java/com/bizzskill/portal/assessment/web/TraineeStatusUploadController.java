package com.bizzskill.portal.assessment.web;

import com.bizzskill.portal.assessment.dto.TraineeLookupRequest;
import com.bizzskill.portal.assessment.dto.TraineeStatusLookupResponse;
import com.bizzskill.portal.assessment.dto.TraineeStatusUploadRequest;
import com.bizzskill.portal.assessment.dto.TraineeStatusUploadResponse;
import com.bizzskill.portal.assessment.service.TraineeStatusUploadService;
import com.bizzskill.portal.common.enums.StatusFilter;
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
import java.util.List;

/**
 * Downloading the bulk status-sheet template, and committing a filled-in sheet.
 *
 * <p>Behind the trainee-status endpoints rather than the assessment ones: the sheet
 * carries marks, but what it changes is a trainee's status, and that is what its
 * permissions should be about.
 *
 * <p>The template is served for the same group and the same tab the table is showing,
 * so what the user downloads is what they were looking at.
 */
@RestController
@RequestMapping("/api/assessments/trainee-status/uploads")
public class TraineeStatusUploadController {

    /**
     * Sent as a header rather than left to the browser, which would otherwise save
     * the file as "template" or open it in a tab. The CORS configuration exposes
     * this header so the frontend can read the name it suggests.
     */
    private static final String TEMPLATE_FILENAME = "trainee-status-template.csv";

    private final TraineeStatusUploadService uploads;
    private final CurrentUser currentUser;

    public TraineeStatusUploadController(
            TraineeStatusUploadService uploads, CurrentUser currentUser) {
        this.uploads = uploads;
        this.currentUser = currentUser;
    }

    /**
     * The sheet to fill in: the tab's trainees, their marks, and the three columns to
     * complete.
     *
     * <p>Guarded by {@code trainee-status.view}, not {@code .manage}: downloading a
     * template changes nothing, and a user who can see the table should be able to get
     * the sheet. The commit below is what requires the write permission.
     *
     * @param status  the tab to generate for — {@code regular}, {@code remedial},
     *                {@code lap}, {@code cleared} or {@code other}.
     * @param examIds the assessments whose marks the sheet shows. Their names become
     *                the sheet's columns.
     */
    @GetMapping(value = "/template", produces = "text/csv;charset=UTF-8")
    @PreAuthorize("hasAuthority('trainee-status.view')")
    public ResponseEntity<String> template(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) List<String> examIds) {

        String csv = uploads.templateCsv(
                currentUser.require(),
                locationId,
                batchId,
                lgId,
                StatusFilter.parse(status),
                examIds == null ? List.of() : examIds);

        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + TEMPLATE_FILENAME + "\"")
                .body(csv);
    }

    /**
     * What the sheet's employees hold now, so the browser can preview the sheet
     * before sending it.
     *
     * <p>A {@code POST} for the same reason the score sheet's lookup is: the ids are a
     * sheet's worth of numbers, and a query string would run past the URI length that
     * servers accept, silently dropping trainees from the preview.
     */
    @PostMapping("/lookup")
    @PreAuthorize("hasAuthority('trainee-status.view')")
    public TraineeStatusLookupResponse lookup(
            @RequestParam(required = false) String locationId,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Long lgId,
            @Valid @RequestBody TraineeLookupRequest request) {
        return uploads.lookup(
                currentUser.require(), locationId, batchId, lgId, request.employeeIds());
    }

    /** Applies a validated sheet, refusing the whole upload if any row is wrong. */
    @PostMapping
    @PreAuthorize("hasAuthority('trainee-status.manage')")
    public TraineeStatusUploadResponse commit(
            @Valid @RequestBody TraineeStatusUploadRequest request) {
        return uploads.commit(currentUser.require(), request);
    }
}
