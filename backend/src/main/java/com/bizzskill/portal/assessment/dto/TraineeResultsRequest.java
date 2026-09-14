package com.bizzskill.portal.assessment.dto;

import java.util.Map;

/**
 * Score updates for one trainee.
 *
 * <p>Keyed by assessment id so a client can send only the cell it edited, which is
 * what a table with inline score entry actually does. Each assessment's score is
 * validated against that assessment's own maximum.
 *
 * @param results assessment id to the new score. A null score clears the result.
 *                Assessment ids the caller sends that do not exist are rejected
 *                rather than ignored, so a stale client is told rather than
 *                silently losing the edit.
 */
public record TraineeResultsRequest(Map<String, ScoreEntry> results) {

    /**
     * @param score the score, or null to clear it. The client also sends a
     *              {@code cefr} field alongside it; it is deliberately ignored,
     *              because the level is derived server-side from the configured
     *              mapping and accepting the client's would let a stale tab write a
     *              level that contradicts the score.
     */
    public record ScoreEntry(Integer score) {
    }
}
