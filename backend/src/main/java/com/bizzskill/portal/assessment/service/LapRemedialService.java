package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.LapRemedialRequest;
import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.assessment.repository.AppLapRemedialRepository;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Optional;

/**
 * Moving trainees between the LAP / Remedial tracks.
 *
 * <p>A track change is recorded as one placement row being closed and another
 * opened, rather than by editing a status in place. That keeps the history — who
 * was moved, when, and why — which is the whole point of tracking a trainee's
 * remedial support, and it is also what the database requires: a partial unique
 * index permits only one open placement per employee.
 */
@Service
@Transactional(readOnly = true)
public class LapRemedialService {

    private final TraineeScopeService scope;
    private final AppLapRemedialRepository placements;

    public LapRemedialService(TraineeScopeService scope, AppLapRemedialRepository placements) {
        this.scope = scope;
        this.placements = placements;
    }

    /**
     * Applies a track change.
     *
     * <p>{@code none} closes the open track. Otherwise the trainee ends up on the
     * requested track; if they were already on a different one, that track is
     * closed as of the new track's start date, so the two never overlap.
     */
    @Transactional
    public void save(PortalPrincipal caller, Long employeeId, LapRemedialRequest request) {
        Participant trainee = scope.requireVisible(caller, employeeId);
        String remark = trimToNull(request.remark());
        LocalDate today = LocalDate.now();

        Optional<AppLapRemedial> open =
                placements.findByIntEmployeeIdAndTxtStatus(trainee.getIntEmployeeId(), LapStatus.OPEN);

        if ("none".equals(request.status())) {
            open.ifPresent(track -> {
                track.close(remark, parseDate(request.closeDate(), today));
                placements.save(track);
            });
            return;
        }

        LapTrack target = "lap".equals(request.status()) ? LapTrack.LAP : LapTrack.REMEDIAL;
        LocalDate startDate = parseDate(request.startDate(), today);

        if (open.isPresent() && open.get().getTxtTrack() == target) {
            // Already on this track: an edit of the reason, not a move.
            open.get().moveTo(target, remark);
            return;
        }

        if (open.isPresent()) {
            AppLapRemedial previous = open.get();
            previous.close(previous.getTxtRemark(), startDate);
            // Flushed before the insert below, so the one-open-track index cannot
            // see two open rows at once.
            placements.saveAndFlush(previous);
        }

        placements.save(AppLapRemedial.place(
                trainee.getIntEmployeeId(), null, target, remark, startDate));
    }

    private LocalDate parseDate(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            return fallback;
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
