package com.bizzskill.portal.assessment.dto;

/**
 * What a committed status sheet did.
 *
 * @param updated how many trainee statuses were changed. Every row of a committed
 *                sheet is a change that was asked for, so this is the row count —
 *                there is no "already correct" case to fold in, because asking for
 *                the status a trainee already holds is refused rather than ignored.
 */
public record TraineeStatusUploadResponse(int updated) {
}
