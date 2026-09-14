package com.bizzskill.portal.assessment.dto;

/**
 * One scored exam on a trainee's row.
 *
 * @param score the recorded score, or null if the score was cleared. A null score
 *              is only ever sent for an exam the trainee has a result row for; an
 *              exam with no result at all is omitted from the map.
 * @param cefr  the CEFR level for the score under the <em>current</em> mapping.
 *              Recomputed on read rather than read from the stored column: the
 *              stored value is the level awarded at the time and is kept as the
 *              audit trail, but the badge's colour comes from the current mapping,
 *              so returning a stale level would colour the badge wrongly after an
 *              administrator edits the bands.
 */
public record TraineeResultResponse(Integer score, String cefr) {
}
