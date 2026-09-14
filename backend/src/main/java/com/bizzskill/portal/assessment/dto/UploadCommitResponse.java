package com.bizzskill.portal.assessment.dto;

/**
 * What a committed upload did.
 *
 * @param saved how many scores were stored. Rows the server found already correct
 *              are still counted as saved, because the caller's question is "is the
 *              sheet in the system", not "how many rows changed".
 */
public record UploadCommitResponse(int saved) {
}
