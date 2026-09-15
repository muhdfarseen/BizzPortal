import { TraineeStatus, TraineeStatusChange, statusLabel } from './assessment.model';
import {
  SheetCell,
  SheetColumn,
  SheetIssue,
  cellText,
  columnIndex,
  isBlankRow,
  missingColumns,
  sheetNumbers,
  toCsv,
} from './sheet.model';

/**
 * The status sheet: what the faculty member downloads, what comes back, and the
 * judgement passed on it before anything is written.
 *
 * <p>The sheet is the tab on screen laid out as a file. Its first columns identify
 * the trainee and show the marks that explain the decision — reference only, read by
 * nobody but the person deciding — and its last three columns are the ones they fill
 * in: the status, the day it takes effect and the reason for it.
 *
 * <p>A row left blank asks for nothing. That is the whole point: the sheet lists the
 * entire tab, and someone correcting four trainees should not have to retype the
 * other forty or have them rejected for "already on Remedial".
 *
 * <p>Everything here is pure — reading the file lives in
 * `TraineeStatusUploadService` — so the rules can be unit-tested without a DOM.
 */

/** The columns the user fills in, in the order the server writes them. */
export const NEW_STATUS_HEADER = 'New Status';
export const EFFECTIVE_DATE_HEADER = 'Effective Date';
export const REMARK_HEADER = 'Remark';

/** The columns the sheet has to carry for a row to mean anything. */
export const REQUIRED_HEADERS = [NEW_STATUS_HEADER, EFFECTIVE_DATE_HEADER, REMARK_HEADER] as const;

/** One of the columns this upload reads. */
export type StatusUploadColumn = 'employeeId' | 'status' | 'effectiveDate' | 'remark';

/**
 * The columns this upload reads, and the spellings each answers to.
 *
 * <p>Only the employee number and the three filled-in columns are listed. The marks,
 * the name and the trainee's current status are in the sheet for the person reading
 * it, so they are not columns as far as this module is concerned — a sheet with the
 * reference columns deleted is still a usable sheet.
 */
const COLUMNS: readonly SheetColumn<StatusUploadColumn>[] = [
  {
    column: 'employeeId',
    label: 'Emp ID',
    aliases: ['empid', 'emp id', 'employeeid', 'employee id', 'employee'],
  },
  { column: 'status', label: NEW_STATUS_HEADER, aliases: ['new status', 'status'] },
  {
    column: 'effectiveDate',
    label: EFFECTIVE_DATE_HEADER,
    aliases: ['effective date', 'effectivedate', 'date', 'from'],
  },
  { column: 'remark', label: REMARK_HEADER, aliases: ['remark', 'remarks', 'reason', 'note'] },
];

/** The columns a row must carry: an empty date is allowed, a missing column is not. */
const REQUIRED_COLUMNS = COLUMNS;

/** The longest remark the server accepts. */
export const REMARK_MAX_LENGTH = 500;

/** Why a row cannot be applied. */
export type StatusUploadErrorCode =
  | 'missing-empid'
  | 'invalid-empid'
  | 'unknown-empid'
  | 'duplicate-empid'
  | 'invalid-status'
  | 'missing-remark'
  | 'remark-too-long'
  | 'invalid-date'
  | 'future-date'
  | 'already-holds'
  | 'nothing-to-end'
  | 'backdated';

/** One row of the sheet after it has been judged. */
export interface StatusUploadRow {
  /** Spreadsheet row number, with the header as row 1. */
  rowNumber: number;
  employeeId: string;
  /** Name on the roster, or `null` when the number is not in the group. */
  rosterName: string | null;
  /** The status as written, so the preview can show what was typed. */
  requestedText: string;
  /** The status once parsed, or `null` when it is missing or unrecognised. */
  requested: TraineeStatusChange | null;
  /** The date as written; blank means it was taken from the default. */
  effectiveDateText: string;
  /** The date the change is dated, defaulted when the sheet left it blank. */
  effectiveDate: string;
  remark: string;
  errors: readonly SheetIssue<StatusUploadErrorCode>[];
  /** Whether the row asks for a change and passed every check. */
  ok: boolean;
}

/** The whole sheet after it has been judged. */
export interface StatusUploadPreview {
  /** Set when the sheet cannot be used at all; `rows` is then empty. */
  sheetError: string | null;
  rows: readonly StatusUploadRow[];
  /** Rows that will be applied. */
  readyRows: number;
  /** Rows that ask for something and cannot be applied. */
  errorRows: number;
  /** Rows left blank, which are not applied and are not a problem. */
  unchangedRows: number;
}

/** A preview of a sheet that could not be read at all. */
export const EMPTY_PREVIEW: StatusUploadPreview = {
  sheetError: null,
  rows: [],
  readyRows: 0,
  errorRows: 0,
  unchangedRows: 0,
};

/** What a trainee holds now, as the preview lookup answers it. */
export interface TraineeStatusRef {
  employeeId: string;
  name: string;
  /** The status they hold, or `null`/absent when they hold none. */
  status: TraineeStatus | null;
  /** The day that status began, or `null` when they hold none. */
  startDate: string | null;
}

/** The group's answer about the employees a sheet names. */
export interface TraineeStatusLookup {
  trainees: readonly TraineeStatusRef[];
}

/** What {@link validateStatusUpload} needs to judge a sheet. */
export interface ValidateStatusUploadOptions {
  rows: readonly (readonly SheetCell[])[];
  /** The group's answer about the employees the sheet names. */
  group: TraineeStatusLookup;
  /** The day a row with no date is dated, as an ISO day. */
  today: string;
}

/** The spellings the Emp ID column answers to. */
const EMPLOYEE_ID_ALIASES = ['empid', 'emp id', 'employeeid', 'employee id', 'employee'];

/**
 * The distinct employee numbers a sheet names, ready for the preview lookup.
 *
 * <p>Only the numbers: the lookup takes numbers, so a cell holding something else
 * could not be resolved against the group anyway and is reported as a bad Emp ID.
 *
 * <p>A sheet that cannot be used names no ids, for the same reason the score sheet's
 * does not: if a required column is missing there is nothing worth looking up.
 */
export function statusSheetEmployeeIds(rows: readonly (readonly SheetCell[])[]): number[] {
  if (rows.length === 0 || missingColumns(rows[0], REQUIRED_COLUMNS).length > 0) {
    return [];
  }
  return sheetNumbers(rows, EMPLOYEE_ID_ALIASES);
}

/**
 * A sheet's employee number as the key the lookup answers with.
 *
 * <p>Written as text and normalised through a number, so a leading zero or a stray
 * space in a cell still finds the trainee it names. Anything that is not a whole
 * number is left as it was typed, to be reported rather than silently dropped.
 */
function employeeKey(value: SheetCell): { text: string; whole: boolean } {
  const text = cellText(value);
  if (/^\d+$/.test(text)) {
    return { text: String(Number(text)), whole: true };
  }
  return { text, whole: false };
}

/** The columns a sheet was found to carry, by position. */
type ColumnMap = Partial<Record<StatusUploadColumn, number>>;

/** Where each column sits in a header row. */
function mapHeaderRow(headerRow: readonly SheetCell[]): ColumnMap {
  const map: ColumnMap = {};
  for (const { column, aliases } of COLUMNS) {
    const index = columnIndex(headerRow, aliases);
    if (index !== -1) {
      map[column] = index;
    }
  }
  return map;
}

/**
 * Reads a status cell.
 *
 * <p>Accepts the code, the label and a few everyday spellings, because the sheet is
 * filled in by hand and "LAP" and "lap" are the same instruction. `regular` is
 * accepted too: it is how a trainee who no longer needs support is taken off the
 * track they are on.
 */
export function parseTraineeStatus(value: SheetCell): TraineeStatusChange | null {
  const text = cellText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (text === '') {
    return null;
  }
  // `none` and `no status` are the everyday ways of writing the same instruction.
  if (text === 'regular' || text === 'none' || text === 'nostatus') {
    return 'regular';
  }
  const statuses: readonly TraineeStatusChange[] = [
    'remedial',
    'lap',
    'cleared',
    'discontinued',
    'purged',
    'resigned',
  ];
  return statuses.find((status) => status === text) ?? null;
}

/** The statuses a cell may name, for the message that says so. */
export function acceptedStatusText(): string {
  return ['regular', 'remedial', 'lap', 'cleared', 'discontinued', 'purged', 'resigned'].join(', ');
}

/**
 * Reads a date cell as an ISO day, or `null` when it is not a date at all.
 *
 * <p>`yyyy-MM-dd` is what the template asks for and what {@link cellText} produces
 * from an Excel date cell. `d/m/yyyy` and `d-m-yyyy` are accepted as well, because
 * a sheet typed by hand in a locale that writes the day first is a reasonable thing
 * to receive, and refusing it would be pedantry rather than safety.
 */
export function parseSheetDate(value: SheetCell): string | null {
  const text = cellText(value);
  if (text === '') {
    return null;
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (slashed) {
    return isoDay(Number(slashed[3]), Number(slashed[2]), Number(slashed[1]));
  }

  return null;
}

/**
 * A calendar day as ISO text, or `null` when those numbers are not a real date.
 *
 * <p>Checked by round-tripping through `Date`, so 31 February is rejected rather
 * than rolled forward into March.
 */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}

/** Whether an ISO day is further ahead than the server would accept. */
function isFuture(isoDay: string, today: string): boolean {
  const tomorrow = new Date(`${today}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return isoDay > tomorrow.toISOString().slice(0, 10);
}

/**
 * Judges a sheet against the group and the day it is being uploaded.
 *
 * <p>A row is only a request if the status column says something; a row with a blank
 * status is counted as unchanged whatever else it holds, because a stray date or note
 * beside an empty status is not an instruction. Everything else is refused with a
 * sentence naming the row, so the file is fixed once rather than one row at a time.
 */
export function validateStatusUpload(options: ValidateStatusUploadOptions): StatusUploadPreview {
  const { rows, group, today } = options;

  if (rows.length === 0) {
    return { ...EMPTY_PREVIEW, sheetError: 'The file is empty.' };
  }

  const missing = missingColumns(rows[0], REQUIRED_COLUMNS);
  if (missing.length > 0) {
    return {
      ...EMPTY_PREVIEW,
      sheetError: `The file must have the columns ${missing.join(', ')}. Download the template to get the right layout.`,
    };
  }

  const map = mapHeaderRow(rows[0]);
  const byEmployeeId = new Map(group.trainees.map((trainee) => [trainee.employeeId, trainee]));
  const seen = new Set<string>();
  const previewRows: StatusUploadRow[] = [];

  for (const [index, row] of rows.entries()) {
    if (index === 0 || isBlankRow(row)) {
      continue;
    }

    const rowNumber = index + 1;
    const value = (column: StatusUploadColumn): string =>
      map[column] === undefined ? '' : cellText(row[map[column] as number]);

    const key = employeeKey(row[map.employeeId ?? -1]);
    const employeeId = key.text;
    const requestedText = value('status');
    const effectiveDateText = value('effectiveDate');
    const remark = value('remark');

    // Nothing in the status column is a row left alone, not a row that failed.
    if (requestedText === '') {
      previewRows.push({
        rowNumber,
        employeeId,
        rosterName: byEmployeeId.get(employeeId)?.name ?? null,
        requestedText,
        requested: null,
        effectiveDateText,
        effectiveDate: '',
        remark,
        errors: [],
        ok: false,
      });
      continue;
    }

    const errors: SheetIssue<StatusUploadErrorCode>[] = [];
    const trainee = byEmployeeId.get(employeeId) ?? null;
    const requested = parseTraineeStatus(requestedText);

    if (employeeId === '') {
      errors.push({ code: 'missing-empid', message: 'Emp ID is missing.' });
    } else if (!key.whole) {
      errors.push({ code: 'invalid-empid', message: `"${employeeId}" is not an Employee ID.` });
    } else if (!trainee) {
      errors.push({
        code: 'unknown-empid',
        message: `${employeeId} is not in this group.`,
      });
    } else if (seen.has(employeeId)) {
      errors.push({
        code: 'duplicate-empid',
        message: `${employeeId} appears more than once in the sheet.`,
      });
    } else {
      seen.add(employeeId);
    }

    if (!requested) {
      errors.push({
        code: 'invalid-status',
        message: `"${requestedText}" is not a status. Use one of: ${acceptedStatusText()}.`,
      });
    } else if (trainee) {
      errors.push(...statusConflicts(requested, trainee));
    }

    if (remark === '') {
      errors.push({
        code: 'missing-remark',
        message: `Record why ${employeeId || 'this trainee'} is changing status.`,
      });
    } else if (remark.length > REMARK_MAX_LENGTH) {
      errors.push({
        code: 'remark-too-long',
        message: `The reason is ${remark.length} characters; use ${REMARK_MAX_LENGTH} or fewer.`,
      });
    }

    // A blank date is today, matching the single-change dialog, which opens on
    // today and stays there unless the user picks otherwise.
    const effectiveDate = effectiveDateText === '' ? today : parseSheetDate(effectiveDateText);

    if (effectiveDate === null) {
      errors.push({
        code: 'invalid-date',
        message: `"${effectiveDateText}" is not a date. Use the format yyyy-MM-dd.`,
      });
    } else if (isFuture(effectiveDate, today)) {
      errors.push({ code: 'future-date', message: 'A status cannot start in the future.' });
    } else if (trainee?.startDate && effectiveDate < trainee.startDate) {
      errors.push({
        code: 'backdated',
        message: `This trainee has been on ${label(trainee.status)} since ${trainee.startDate}. Choose that date or later.`,
      });
    }

    previewRows.push({
      rowNumber,
      employeeId,
      rosterName: trainee?.name ?? null,
      requestedText,
      requested,
      effectiveDateText,
      effectiveDate: effectiveDate ?? '',
      remark,
      errors,
      ok: errors.length === 0,
    });
  }

  const unchangedRows = previewRows.filter((row) => row.requestedText === '').length;
  const readyRows = previewRows.filter((row) => row.ok).length;
  return {
    sheetError: null,
    rows: previewRows,
    readyRows,
    errorRows: previewRows.length - unchangedRows - readyRows,
    unchangedRows,
  };
}

/**
 * Whether the requested status contradicts what the trainee holds now.
 *
 * <p>Both cases mirror the single-change endpoint, which refuses them rather than
 * quietly doing nothing: a change carries a reason, and discarding a reason someone
 * typed is worse than telling them the sheet is out of date.
 */
function statusConflicts(
  requested: TraineeStatusChange,
  trainee: TraineeStatusRef,
): SheetIssue<StatusUploadErrorCode>[] {
  const holds = trainee.status ?? null;

  if (requested === 'regular') {
    return holds === null
      ? [
          {
            code: 'nothing-to-end',
            message: `${trainee.employeeId} is already regular — they hold no status to end.`,
          },
        ]
      : [];
  }

  return holds === requested
    ? [
        {
          code: 'already-holds',
          message: `${trainee.employeeId} already holds ${statusLabel(requested)}.`,
        },
      ]
    : [];
}

function label(status: TraineeStatus | null): string {
  return status === null ? 'no status' : statusLabel(status);
}

/** The reason a sheet was rejected, for a message when there is no preview. */
export function rejectedSheet(sheetError: string): StatusUploadPreview {
  return { ...EMPTY_PREVIEW, sheetError };
}

/** The rows that will be applied, ready for the commit. */
export function readyRows(preview: StatusUploadPreview) {
  return preview.rows.filter((row) => row.ok);
}

/**
 * The sheet's problems as a file the user can keep beside the corrected sheet.
 *
 * <p>Written from what the sheet held rather than from the server's reply, because
 * the browser already knows every row and its complaint — and because a rejected
 * upload never reaches the server to be explained by it.
 */
export function buildStatusErrorCsv(preview: StatusUploadPreview): string {
  const rows: string[][] = [
    ['Row', 'Emp ID', 'Name', 'New Status', 'Effective Date', 'Remark', 'Issue'],
  ];
  for (const row of preview.rows) {
    if (row.errors.length === 0) {
      continue;
    }
    rows.push([
      String(row.rowNumber),
      row.employeeId,
      row.rosterName ?? '',
      row.requestedText,
      row.effectiveDateText,
      row.remark,
      row.errors.map((error) => error.message).join(' '),
    ]);
  }
  return toCsv(rows);
}
