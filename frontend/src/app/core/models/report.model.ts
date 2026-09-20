/**
 * The reports page's view models.
 *
 * The report is computed by the API, not assembled here from lists the client
 * happens to hold. A report is a claim about the whole organisation, and the
 * screens it could otherwise be built from are paged — a report derived from one
 * page would understate a group's numbers, which is worse than being slow.
 *
 * Optional fields mirror the API's `non_null` serialisation: a key that is not
 * there means "not applicable or not recorded", never zero.
 */

/** One entry on a trainee's exam timeline. */
export interface ReportExam {
  assessmentId: string;
  assessmentName: string;
  /** Highest achievable score, so the report can read `62 / 90`. */
  maxScore: number;
  /** Achieved score; absent while the exam is still pending. */
  score?: number;
  /** CEFR level under the current mapping; absent until the exam is scored. */
  cefr?: string;
  /** ISO date (`yyyy-MM-dd`) the exam was sat; absent while it is pending. */
  assessedOn?: string;
}

/** One entry on a trainee's LAP / Remedial timeline. */
export interface ReportTrack {
  track: 'remedial' | 'lap';
  status: 'open' | 'closed';
  /** ISO date the placement began. */
  startDate: string;
  /** ISO date the placement ended; absent while it is open. */
  closeDate?: string;
  /** Why the trainee was placed, as recorded at the time. */
  remark?: string;
  /** The exam whose result prompted the placement, when one did. */
  assessmentName?: string;
}

/** One trainee's report. */
export interface TraineeReport {
  employeeId: string;
  name: string;
  /** The portal's own trainee reference, e.g. `ILP-2026-0142`. */
  referenceId?: string;
  recruitBranch?: string;
  /** ISO date of the trainee's ILP. */
  ilpDate?: string;
  phase?: string;
  batchId?: string;
  batchName?: string;
  batchStartDate?: string;
  batchEndDate?: string;
  lgId?: string;
  lgName?: string;
  locationId?: string;
  locationName?: string;
  /** The track the trainee is on now; absent means none. */
  currentTrack?: 'remedial' | 'lap';
  /** ISO date the current track began. */
  currentTrackSince?: string;
  exams: readonly ReportExam[];
  /** LAP / Remedial placements, newest first. */
  tracks: readonly ReportTrack[];
}

/** A trainee the report can be pointed at — one row of the search box's matches. */
export interface TraineeOption {
  employeeId: string;
  name: string;
  /** The batch the trainee is in, so two people with one name can be told apart. */
  batchName?: string;
}
