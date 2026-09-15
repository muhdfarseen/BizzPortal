/**
 * Assessment domain models.
 *
 * The exams a trainee is assessed against are configuration data (Pre / Mid /
 * Post today) that admins will be able to manage from the Configuration screen
 * later, so nothing here (or in the UI that consumes it) hard-codes a fixed
 * set of exam columns.
 */

/** CEFR proficiency level awarded for an assessment score. */
export type CefrLevel =
  'Below A1' | 'A1' | 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2' | 'B2+' | 'C1' | 'C2';

/**
 * The standard CEFR levels, ordered lowest to highest.
 *
 * These are the levels the portal ships with; admins may add custom labels of
 * their own on the Configuration screen, so scoring treats levels as text.
 */
export const CEFR_LEVELS: readonly CefrLevel[] = [
  'Below A1',
  'A1',
  'A2',
  'A2+',
  'B1',
  'B1+',
  'B2',
  'B2+',
  'C1',
  'C2',
];

/** The lowest score the Versant scale records. */
export const DEFAULT_MIN_SCORE = 10;

/** The highest score an exam allows unless it configures its own maximum. */
export const DEFAULT_MAX_SCORE = 90;

/** A pickable badge colour for a CEFR level. */
export interface CefrColor {
  /** Stable id stored on a mapping band. */
  id: string;
  /** Human name, used as the swatch's accessible label. */
  label: string;
  /** The accent colour swatches and badges are built from. */
  accent: string;
}

/**
 * The badge palette admins pick from on the Configuration screen, ordered
 * red → green so the ramp from lowest to highest level is easy to read.
 */
export const CEFR_COLORS: readonly CefrColor[] = [
  { id: 'red', label: 'Red', accent: '#dc2626' },
  { id: 'red-orange', label: 'Red orange', accent: '#e2451f' },
  { id: 'orange-red', label: 'Orange red', accent: '#e8631a' },
  { id: 'orange', label: 'Orange', accent: '#ef8014' },
  { id: 'orange-amber', label: 'Orange amber', accent: '#f59e0b' },
  { id: 'amber', label: 'Amber', accent: '#eab308' },
  { id: 'yellow', label: 'Yellow', accent: '#d9c50f' },
  { id: 'yellow-lime', label: 'Yellow lime', accent: '#b8cc17' },
  { id: 'lime', label: 'Lime', accent: '#96cf20' },
  { id: 'lime-green', label: 'Lime green', accent: '#6fce2e' },
  { id: 'light-green', label: 'Light green', accent: '#4ac93f' },
  { id: 'green-soft', label: 'Soft green', accent: '#33c94f' },
  { id: 'green', label: 'Green', accent: '#22c55e' },
  { id: 'emerald', label: 'Emerald', accent: '#16a34a' },
  { id: 'green-dark', label: 'Dark green', accent: '#0f8a3d' },
];

/** Colour used for a level that has none configured (or an unknown one). */
export const FALLBACK_CEFR_COLOR: CefrColor = {
  id: 'slate',
  label: 'Slate',
  accent: '#64748b',
};

/** The palette entry with this id, or the neutral fallback. */
export function cefrColor(id: string | undefined): CefrColor {
  return CEFR_COLORS.find((color) => color.id === id) ?? FALLBACK_CEFR_COLOR;
}

/** Background and text colours for a badge built from an accent colour. */
export interface CefrBadgeStyle {
  background: string;
  color: string;
}

/**
 * Builds a badge style from an accent: a light tint for the background and a
 * darkened version of the same hue for the text, so every palette colour keeps
 * its contrast.
 */
export function cefrBadge(accent: string): CefrBadgeStyle {
  return { background: mixHex(accent, 0.85), color: mixHex(accent, -0.3) };
}

/** Mixes a 6-digit hex colour toward white (`ratio` > 0) or black (< 0). */
function mixHex(hex: string, ratio: number): string {
  const value = hex.replace('#', '');
  const target = ratio >= 0 ? 255 : 0;
  const amount = Math.abs(ratio);
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(channel + (target - channel) * amount);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** A CEFR level and the inclusive score range that awards it. */
export interface CefrScoreBand {
  /** The awarded level — a standard CEFR level or an admin-defined label. */
  level: string;
  /** Lowest score (inclusive) that awards the level. */
  min: number;
  /** Highest score (inclusive) that awards the level. */
  max: number;
  /** Id of the {@link CEFR_COLORS} entry the level's badge uses. */
  color: string;
}

/**
 * The score → CEFR mapping the portal ships with — the published Versant
 * scale. Admins edit it on the Configuration screen; this is the default the
 * screen seeds (and resets) to.
 *
 * Ranges may overlap (Versant publishes `B2+` as 68–76 and `C1` as 76–85), so
 * {@link cefrFromScore} awards the range that starts highest.
 */
export const DEFAULT_CEFR_MAPPING: readonly CefrScoreBand[] = [
  { level: 'Below A1', min: 10, max: 22, color: 'red' },
  { level: 'A1', min: 23, max: 30, color: 'red-orange' },
  { level: 'A2', min: 31, max: 36, color: 'orange' },
  { level: 'A2+', min: 37, max: 43, color: 'orange-amber' },
  { level: 'B1', min: 44, max: 51, color: 'amber' },
  { level: 'B1+', min: 52, max: 59, color: 'yellow-lime' },
  { level: 'B2', min: 60, max: 67, color: 'lime' },
  { level: 'B2+', min: 68, max: 76, color: 'light-green' },
  { level: 'C1', min: 76, max: 85, color: 'green' },
  { level: 'C2', min: 86, max: 90, color: 'green-dark' },
];

/** An exam trainees are assessed against (admin-configurable). */
export interface AssessmentExam {
  /** Stable identifier: the table column id and the key in `results`. */
  id: string;
  /** Short label rendered as the table column header, e.g. `Pre`. */
  name: string;
  /** Highest achievable score; drives score validation (90 on the Versant scale). */
  maxScore: number;
}

/** A trainee's outcome for a single exam. */
export interface AssessmentResult {
  /** Achieved score, between 0 and the exam's `maxScore`. */
  score: number;
  /** CEFR level derived from (or recorded alongside) the score. */
  cefr: string;
  /**
   * ISO date (`yyyy-MM-dd`) the exam was conducted, or null for results recorded
   * before the portal captured one.
   */
  assessedOn: string | null;
}

/**
 * The statuses a trainee can hold.
 *
 * `regular` is not one of them: a trainee progressing through their batch
 * normally holds no status at all, so it is represented by the absence of
 * {@link TraineeAssessment.status} rather than by a stored value. It appears in
 * {@link StatusFilter} because the screen offers it as a tab, and in
 * {@link TraineeStatusChange} because "no longer needs support" is a change a
 * user can make.
 */
export type TraineeStatus = 'remedial' | 'lap' | 'cleared' | 'discontinued' | 'purged' | 'resigned';

/**
 * The status a user can move a trainee to: any of {@link TraineeStatus}, or
 * `regular` to end whatever they hold.
 */
export type TraineeStatusChange = TraineeStatus | 'regular';

/**
 * The tabs of the Trainee status page.
 *
 * Mirrors the API's `status` query parameter. `other` is one tab standing for
 * the three ways a trainee leaves; `regular` stands for holding nothing at all.
 */
export type StatusFilter = 'regular' | 'remedial' | 'lap' | 'cleared' | 'other';

/** The statuses the `other` tab covers, in the order the dialog offers them. */
export const OTHER_STATUSES: readonly TraineeStatus[] = ['discontinued', 'purged', 'resigned'];

/** Every status in the order they are listed to a user, the ordinary path first. */
export const TRAINEE_STATUSES: readonly TraineeStatus[] = [
  'remedial',
  'lap',
  'cleared',
  ...OTHER_STATUSES,
];

/** How a status is written on screen: `lap` is an acronym, not a word. */
export function statusLabel(status: TraineeStatusChange): string {
  switch (status) {
    case 'regular':
      return 'Regular';
    case 'lap':
      return 'LAP';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/** The label of the tab a status falls under. */
export function statusTabLabel(tab: StatusFilter): string {
  return tab === 'other' ? 'Other' : statusLabel(tab);
}

/** One trainee row of the assessment table. */
export interface TraineeAssessment {
  /** Employee identifier, e.g. `41207`. */
  employeeId: string;
  /** Trainee display name. */
  name: string;
  /** Results keyed by {@link AssessmentExam.id}; an exam may have no result yet. */
  results: Record<string, AssessmentResult | undefined>;
  /**
   * The status the trainee currently holds; absent means they hold none, which is
   * the ordinary case and what the Regular tab shows.
   */
  status?: TraineeStatus;
  /**
   * ISO date (`yyyy-MM-dd`) the trainee entered their current status, or — when
   * they hold none — the day their last one ended.
   */
  startDate?: string;
  /**
   * ISO date (`yyyy-MM-dd`) the trainee's last status ended. Only set when they
   * hold none, since a status they still hold has no end.
   */
  closeDate?: string;
  /**
   * Why the trainee holds their current status, or why their last one ended.
   */
  remark?: string;
}

/** The trainee selection an assessment table is loaded for. */
export interface AssessmentFilter {
  locationId: string | null;
  batchId: string | null;
  lgId: string | null;
}

/** One trainee by the two fields a bulk upload judges a sheet against. */
export interface TraineeRef {
  employeeId: string;
  name: string;
}

/**
 * The group's answer to a trainee lookup: how large the group is, plus only
 * those of the requested employee numbers that it actually holds.
 *
 * `groupSize` is the count of the whole group, so a sheet can be told how many
 * trainees it left out without the roster behind it ever being sent.
 */
export interface TraineeLookup {
  groupSize: number;
  trainees: readonly TraineeRef[];
}

/** Month abbreviations used by {@link formatIsoDate}. */
const ISO_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Today's date as an ISO `yyyy-MM-dd` string, in the user's local time. */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Formats an ISO date (`yyyy-MM-dd`) for display, e.g. `4 Mar 2026`. */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  const [, year, month, day] = match;
  const monthName = ISO_MONTHS[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : iso;
}

/**
 * Resolves the CEFR level for a score against a configured mapping.
 *
 * Every band whose `min`…`max` contains the score is a candidate; the one that
 * starts highest wins, so a shared boundary (Versant's 76) resolves upward
 * (76 → C1, not B2+) and custom level labels need no fixed ranking. A score
 * outside every band rounds down to the nearest lower band, so scores below
 * the scale read as the lowest level and scores above it as the highest.
 */
export function cefrFromScore(
  score: number,
  mapping: readonly CefrScoreBand[] = DEFAULT_CEFR_MAPPING,
): string {
  if (mapping.length === 0) {
    return 'Below A1';
  }

  let match: CefrScoreBand | undefined;
  for (const band of mapping) {
    if (score >= band.min && score <= band.max && (!match || band.min >= match.min)) {
      match = band;
    }
  }
  if (match) {
    return match.level;
  }

  // Outside every band: fall back to the highest band that ends below the
  // score, or the lowest band when the score sits underneath the whole scale.
  let below: CefrScoreBand | undefined;
  let lowest: CefrScoreBand = mapping[0];
  for (const band of mapping) {
    if (band.min < lowest.min) {
      lowest = band;
    }
    if (band.max < score && (!below || band.max > below.max)) {
      below = band;
    }
  }
  return below?.level ?? lowest.level;
}

/** Whether a score is a whole number within the exam's allowed range. */
export function isValidScore(
  score: number,
  maxScore: number = DEFAULT_MAX_SCORE,
  minScore: number = 0,
): boolean {
  return (
    Number.isFinite(score) && Number.isInteger(score) && score >= minScore && score <= maxScore
  );
}

/** Clamps any number into the exam's allowed score range. */
export function clampScore(score: number, maxScore: number = DEFAULT_MAX_SCORE): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(score), 0), maxScore);
}
