package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.LapRemedialRequest;
import com.bizzskill.portal.assessment.entity.AppLapRemedial;
import com.bizzskill.portal.assessment.repository.AppLapRemedialRepository;
import com.bizzskill.portal.common.enums.LapStatus;
import com.bizzskill.portal.common.enums.LapTrack;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.security.access.AccessDeniedException;
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
 *
 * <p>Authority is decided here rather than by an annotation on the controller,
 * because the two tracks are separately grantable. One endpoint moves a trainee
 * to either, so a single {@code hasAuthority} on it would have to name one code
 * and would then let a Remedial-only manager place somebody on LAP. The check
 * keys off the track the request actually touches, which for a close is the
 * track the trainee is currently on rather than the one named in the body.
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

        boolean closing = "none".equals(request.status()) || "cleared".equals(request.status());
        LapTrack target = closing
                ? null
                : ("lap".equals(request.status()) ? LapTrack.LAP : LapTrack.REMEDIAL);

        // A close is judged against the track the trainee is actually on, so
        // closing a LAP needs the LAP permission even though the body only says
        // "none". A close with nothing open touches no track and needs nothing.
        requireAuthority(caller, closing ? open.map(AppLapRemedial::getTxtTrack).orElse(null) : target);

        if (closing) {
            open.ifPresent(track -> {
                track.close(remark, parseDate(request.closeDate(), today));
                placements.save(track);
            });
            return;
        }

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

    /**
     * Refuses a change to a track the caller does not manage.
     *
     * <p>Each track is granted separately, so a manager of one cannot move
     * trainees on the other. {@code null} is the no-op close of somebody on no
     * track, which changes nothing and so needs no permission — refusing it
     * would break a caller who is otherwise allowed to close their own track.
     *
     * @throws AccessDeniedException when the caller lacks the track's permission.
     */
    private void requireAuthority(PortalPrincipal caller, LapTrack track) {
        if (track == null) {
            return;
        }
        String permission = track == LapTrack.LAP
                ? "lap-remedial.lap-manage"
                : "lap-remedial.remedial-manage";
        if (!caller.has(permission)) {
            throw new AccessDeniedException("You do not have permission to " + action(track) + ".");
        }
    }

    /** The plain-language action, so the message names the track the user tried. */
    private String action(LapTrack track) {
        return track == LapTrack.LAP
                ? "initiate or close LAP tracks"
                : "initiate or close Remedial tracks";
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
