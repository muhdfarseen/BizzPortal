package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.TraineeStatusRequest;
import com.bizzskill.portal.assessment.entity.AppTraineeStatus;
import com.bizzskill.portal.assessment.repository.AppTraineeStatusRepository;
import com.bizzskill.portal.common.enums.StatusState;
import com.bizzskill.portal.common.enums.TraineeStatus;
import com.bizzskill.portal.common.error.ApiErrorResponse.FieldViolation;
import com.bizzskill.portal.common.error.BusinessRuleException;
import com.bizzskill.portal.common.error.ConflictException;
import com.bizzskill.portal.common.error.RequestValidationException;
import com.bizzskill.portal.organization.entity.Participant;
import com.bizzskill.portal.security.PortalPrincipal;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;

/**
 * Changing the status a trainee holds.
 *
 * <p>A change is recorded as the current period being superseded and a new one
 * opening, rather than as a status edited in place. That keeps the history — who
 * was moved, when, and why — which is the whole point of tracking a trainee's
 * progress, and it is also what the database requires: a partial unique index
 * permits only one current period per trainee.
 *
 * <p>Any status may follow any other. The screen presents Regular → Remedial →
 * LAP as the ordinary path with Cleared and the exits alongside it, but the
 * server does not police the order: a trainee can be escalated straight to LAP,
 * stepped back from LAP to Remedial, or reinstated after a resignation that never
 * happened, and every one of those is a real thing that happens to a real roster.
 * What the server does police is that each change is dated and explained, and that
 * the dates cannot contradict each other.
 */
@Service
@Transactional(readOnly = true)
public class TraineeStatusService {

    /** The request value meaning "hold no status", which is the absence of a row. */
    private static final String REGULAR = "regular";

    private final TraineeScopeService scope;
    private final AppTraineeStatusRepository statuses;

    public TraineeStatusService(TraineeScopeService scope, AppTraineeStatusRepository statuses) {
        this.scope = scope;
        this.statuses = statuses;
    }

    /**
     * Applies a status change to one trainee.
     *
     * <p>Idempotence is deliberately not offered for a change to the status the
     * trainee already holds: the request carries a reason, and quietly discarding
     * a reason someone typed is worse than telling them the screen is out of date.
     *
     * @throws RequestValidationException if the effective date is unusable
     * @throws BusinessRuleException      if there is nothing to change, or the
     *                                    trainee already holds the requested status
     * @throws ConflictException          if another request changed the same trainee
     *                                    at the same moment
     */
    @Transactional
    public void save(PortalPrincipal caller, Long employeeId, TraineeStatusRequest request) {
        Participant trainee = scope.requireVisible(caller, employeeId);
        LocalDate effectiveDate = requireUsableDate(request.effectiveDate());
        String remark = request.remark().trim();

        // `regular` is not a stored status, so it is not a TraineeStatus: it means
        // "end whatever they hold", which is how a trainee who no longer needs
        // support returns to ordinary progress.
        TraineeStatus target = REGULAR.equals(request.status())
                ? null
                : TraineeStatus.fromCode(request.status());

        Optional<AppTraineeStatus> current = statuses.findByIntEmployeeIdAndTxtState(
                trainee.getIntEmployeeId(), StatusState.CURRENT);

        if (target == null && current.isEmpty()) {
            throw new BusinessRuleException(
                    "This trainee is already regular — they hold no status to end.");
        }
        if (target != null && current.filter(period -> period.getTxtTraineeStatus() == target).isPresent()) {
            throw new BusinessRuleException(
                    "This trainee is already on " + target.getLabel() + ".");
        }

        try {
            if (current.isPresent()) {
                AppTraineeStatus previous = current.get();
                requireNotBackdated(previous, effectiveDate);
                previous.supersede(effectiveDate);
                // Flushed before the insert below, so the one-current-period index
                // cannot see two current rows at once.
                statuses.saveAndFlush(previous);
            }
            if (target != null) {
                statuses.save(AppTraineeStatus.begin(
                        trainee.getIntEmployeeId(), null, target, remark, effectiveDate));
            }
        } catch (DataIntegrityViolationException clash) {
            // The only constraint this can realistically reach is the one-current-
            // period index, which means a second request opened a period between
            // the read above and this write.
            throw new ConflictException(
                    "This trainee's status was changed by someone else a moment ago. "
                            + "Reload the page and check their current status.");
        }
    }

    /**
     * Reads the effective date, defaulting to today and refusing the future.
     *
     * <p>A day of slack is allowed on "today" because the server works in UTC: for
     * a user east of it, their today is already tomorrow here, and refusing their
     * own date would be a bug rather than a guard.
     */
    private LocalDate requireUsableDate(String value) {
        if (value == null || value.isBlank()) {
            return LocalDate.now(ZoneOffset.UTC);
        }
        LocalDate date;
        try {
            date = LocalDate.parse(value);
        } catch (DateTimeParseException malformed) {
            throw invalidDate("Use a real date.");
        }
        if (date.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1))) {
            throw invalidDate("A status cannot start in the future.");
        }
        return date;
    }

    /**
     * Refuses a status that would start before the one it replaces.
     *
     * <p>The database holds the same rule as a check constraint, but it is checked
     * here so the answer is a message naming the earliest date that works rather
     * than a constraint violation. Without it the periods would also be able to
     * run backwards through the trainee's history.
     */
    private void requireNotBackdated(AppTraineeStatus current, LocalDate effectiveDate) {
        if (effectiveDate.isBefore(current.getDateStartDate())) {
            throw new RequestValidationException(List.of(new FieldViolation(
                    "effectiveDate",
                    "This trainee has been on " + current.getTxtTraineeStatus().getLabel()
                            + " since " + current.getDateStartDate()
                            + ". Choose that date or later.")));
        }
    }

    private RequestValidationException invalidDate(String message) {
        return new RequestValidationException(List.of(new FieldViolation("effectiveDate", message)));
    }
}
