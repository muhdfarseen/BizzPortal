import { AssessmentExam, TraineeAssessment, TraineeLookup, isValidScore } from './assessment.model';

/**
 * Bulk score upload: the template admins download, the sheet they send back and
 * the validation that runs on it before anything is imported.
 *
 * Everything here is pure — file reading lives in `AssessmentUploadService` — so
 * the parsing and the rules can be unit-tested without a DOM or an upload.
 */

/** The three columns of the upload template, in the order they are written. */
export const TEMPLATE_HEADERS = ['Emp ID', 'Name', 'Score'] as const;

/** Extensions the upload accepts, and the reader each one needs. */
export const CSV_EXTENSIONS = ['.csv', '.txt'] as const;
export const EXCEL_EXTENSIONS = ['.xlsx', '.xlsm'] as const;

/** `value` for the file input's `accept` attribute. */
export const SHEET_ACCEPT = [...CSV_EXTENSIONS, ...EXCEL_EXTENSIONS].join(',');

/** Which reader a file needs, or `null` when the portal cannot read it. */
export function sheetKind(fileName: string): 'csv' | 'excel' | null {
  const name = fileName.toLowerCase();
  if (CSV_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return 'csv';
  }
  if (EXCEL_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return 'excel';
  }
  return null;
}

/** A raw sheet cell, as handed over by either reader. */
export type SheetCell = string | number | boolean | Date | null | undefined;

/** One of the template's columns. */
export type UploadColumn = 'employeeId' | 'name' | 'score';

/** Names accepted for each column, so a renamed header still lands. */
const COLUMN_ALIASES: Record<UploadColumn, readonly string[]> = {
  employeeId: ['empid', 'emp id', 'employeeid', 'employee id', 'employee'],
  name: ['name', 'trainee name', 'traineename', 'trainee'],
  score: ['score', 'marks', 'mark'],
};

/** Every column the template needs, and a label to name it in an error. */
const REQUIRED_COLUMNS: readonly { column: UploadColumn; label: string }[] = [
  { column: 'employeeId', label: TEMPLATE_HEADERS[0] },
  { column: 'name', label: TEMPLATE_HEADERS[1] },
  { column: 'score', label: TEMPLATE_HEADERS[2] },
];

/** Why a row cannot be imported. */
export type UploadErrorCode =
  | 'missing-empid'
  | 'unknown-empid'
  | 'duplicate-empid'
  | 'missing-score'
  | 'invalid-score'
  | 'score-out-of-range';

/** Something worth showing but not worth blocking the row for. */
export type UploadWarningCode = 'name-mismatch';

/** One problem found on one row. */
export interface UploadIssue<Code extends string> {
  code: Code;
  /** Sentence shown in the preview and written to the error CSV. */
  message: string;
}

/** One sheet row after validation. */
export interface UploadPreviewRow {
  /** Spreadsheet row number, with the header as row 1. */
  rowNumber: number;
  employeeId: string;
  /** Name as written in the sheet. */
  name: string;
  /** Name on the roster, or `null` when the employee id is not in the group. */
  rosterName: string | null;
  /** Score exactly as written, so the preview can show what was typed. */
  score: string;
  /** Level the score maps to, or `null` when the score is unusable. */
  cefr: string | null;
  errors: readonly UploadIssue<UploadErrorCode>[];
  warnings: readonly UploadIssue<UploadWarningCode>[];
  /** Whether the row will be imported — true when it has no errors. */
  ok: boolean;
}

/** The whole sheet after validation. */
export interface UploadPreview {
  /** Set when the sheet cannot be used at all; `rows` is then empty. */
  sheetError: string | null;
  rows: readonly UploadPreviewRow[];
  /** Rows that will be imported. */
  validRows: number;
  /** Rows that will be skipped. */
  errorRows: number;
  /** Trainees on the roster that the sheet does not mention. */
  missingFromSheet: number;
}

/** The columns a sheet was found to carry, by position. */
type ColumnMap = Record<UploadColumn, number>;

/** Lower-cases a header and flattens its separators, so aliases can match. */
function normalizeHeader(value: SheetCell): string {
  return String(value ?? '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** A cell as trimmed text; numbers keep their value, dates their ISO day. */
function cellText(value: SheetCell): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

/** Positions of the template columns in a header row, or `null` if any is missing. */
function mapHeaderRow(headerRow: readonly SheetCell[]): ColumnMap | null {
  const found = headerRow.map(normalizeHeader);
  const map = {} as ColumnMap;

  for (const { column } of REQUIRED_COLUMNS) {
    const aliases = COLUMN_ALIASES[column];
    const index = found.findIndex((header) => aliases.includes(header));
    if (index === -1) {
      return null;
    }
    map[column] = index;
  }
  return map;
}

/** Labels of the template columns a header row does not carry. */
function missingColumns(headerRow: readonly SheetCell[]): string[] {
  const found = headerRow.map(normalizeHeader);
  return REQUIRED_COLUMNS.filter(
    ({ column }) => !found.some((header) => COLUMN_ALIASES[column].includes(header)),
  ).map(({ label }) => label);
}

/** Whether a row holds nothing at all, and should be skipped rather than failed. */
function isBlankRow(row: readonly SheetCell[]): boolean {
  return row.every((cell) => cellText(cell) === '');
}

/**
 * The distinct employee numbers a sheet names, ready for a lookup.
 *
 * Only numeric values are returned: the lookup takes numbers, so anything else
 * could not be resolved against the group anyway and is reported as an unknown
 * employee id by {@link validateUpload} instead. A sheet whose header cannot be
 * read names no ids, because there is no column to find them in.
 */
export function sheetEmployeeIds(rows: readonly (readonly SheetCell[])[]): number[] {
  if (rows.length === 0) {
    return [];
  }
  const map = mapHeaderRow(rows[0]);
  if (!map) {
    return [];
  }

  const ids = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (index === 0 || isBlankRow(row)) {
      continue;
    }
    const value = Number(cellText(row[map.employeeId]));
    if (Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  }
  return [...ids];
}

/**
 * Parses CSV text (RFC 4180): quoted fields may hold commas, newlines and
 * escaped `""` quotes, and both CRLF and LF end a record. A leading BOM is
 * dropped so the first header still matches.
 */
export function parseCsv(text: string): string[][] {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  while (index < content.length) {
    const char = content[index];

    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += char === '\r' && content[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // Trailing newline means the last record is already complete.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Quotes a CSV cell only when it needs it. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Writes a matrix as CSV with CRLF records, which Excel reads back cleanly. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * The template for one assessment: every trainee of the group, with the score
 * they already have (blank when the exam is still pending).
 */
export function buildTemplateCsv(trainees: readonly TraineeAssessment[], examId: string): string {
  const rows: string[][] = [[...TEMPLATE_HEADERS]];
  for (const trainee of trainees) {
    const result = trainee.results[examId];
    rows.push([trainee.employeeId, trainee.name, result ? String(result.score) : '']);
  }
  return toCsv(rows);
}

/** One problem of the sheet, flattened for the downloadable error report. */
export interface UploadErrorReportRow {
  rowNumber: number;
  employeeId: string;
  name: string;
  score: string;
  message: string;
}

/** Flattens the preview's failures into one line per issue. */
export function errorReportRows(preview: UploadPreview): UploadErrorReportRow[] {
  return preview.rows.flatMap((row) =>
    row.errors.map((error) => ({
      rowNumber: row.rowNumber,
      employeeId: row.employeeId,
      name: row.name,
      score: row.score,
      message: error.message,
    })),
  );
}

/** Writes the failures of a preview as a CSV report. */
export function buildErrorCsv(preview: UploadPreview): string {
  const rows: string[][] = [['Row', 'Emp ID', 'Name', 'Score', 'Issue']];
  for (const issue of errorReportRows(preview)) {
    rows.push([String(issue.rowNumber), issue.employeeId, issue.name, issue.score, issue.message]);
  }
  return toCsv(rows);
}

/** Everything {@link validateUpload} needs to judge a sheet. */
export interface ValidateUploadOptions {
  /** The sheet, header row included. */
  rows: readonly (readonly SheetCell[])[];
  /**
   * The group the sheet is judged against: the requested employee numbers it
   * holds, plus the count of the whole group. The roster itself is never sent —
   * the lookup answers only what a preview actually asks.
   */
  group: TraineeLookup;
  /** The one assessment being uploaded, supplying the score ceiling. */
  exam: AssessmentExam;
  /** Maps a score to its level, so the preview matches the configured CEFR scale. */
  levelFor: (score: number) => string;
}

/** An empty preview, used before a sheet is read. */
const EMPTY_PREVIEW: UploadPreview = {
  sheetError: null,
  rows: [],
  validRows: 0,
  errorRows: 0,
  missingFromSheet: 0,
};

/**
 * Validates a sheet against the group and the assessment.
 *
 * A row is imported only when it has no errors; warnings are reported but let
 * the row through. Unknown employee ids are refused rather than created, so a
 * typo cannot add a trainee that the group does not contain.
 */
export function validateUpload(options: ValidateUploadOptions): UploadPreview {
  const { rows, group, exam, levelFor } = options;

  if (rows.length === 0) {
    return { ...EMPTY_PREVIEW, sheetError: 'The file is empty.' };
  }

  const missing = missingColumns(rows[0]);
  if (missing.length > 0) {
    return {
      ...EMPTY_PREVIEW,
      sheetError: `The file must have the columns ${missing.join(', ')}. Download the template to get the right layout.`,
    };
  }

  const map = mapHeaderRow(rows[0]) as ColumnMap;
  const byEmployeeId = new Map(group.trainees.map((trainee) => [trainee.employeeId, trainee]));
  const seen = new Set<string>();
  const previewRows: UploadPreviewRow[] = [];
  const covered = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (index === 0 || isBlankRow(row)) {
      continue;
    }

    const employeeId = cellText(row[map.employeeId]);
    const name = cellText(row[map.name]);
    const scoreText = cellText(row[map.score]);
    const trainee = byEmployeeId.get(employeeId) ?? null;
    const errors: UploadIssue<UploadErrorCode>[] = [];
    const warnings: UploadIssue<UploadWarningCode>[] = [];

    if (employeeId === '') {
      errors.push({ code: 'missing-empid', message: 'Emp ID is missing.' });
    } else if (!trainee) {
      errors.push({
        code: 'unknown-empid',
        message: `${employeeId} is not in this group.`,
      });
    } else if (seen.has(employeeId)) {
      errors.push({
        code: 'duplicate-empid',
        message: `${employeeId} appears more than once in the file.`,
      });
    }
    if (employeeId !== '') {
      seen.add(employeeId);
      if (trainee) {
        covered.add(employeeId);
      }
    }

    const score = Number(scoreText);
    let cefr: string | null = null;

    if (scoreText === '') {
      errors.push({ code: 'missing-score', message: 'Score is missing.' });
    } else if (!Number.isFinite(score)) {
      errors.push({ code: 'invalid-score', message: `"${scoreText}" is not a number.` });
    } else if (!isValidScore(score, exam.maxScore, 0)) {
      errors.push({
        code: 'score-out-of-range',
        message: `${scoreText} is not a whole number between 0 and ${exam.maxScore}.`,
      });
    } else {
      cefr = levelFor(score);
    }

    if (trainee && name !== '' && name !== trainee.name) {
      warnings.push({
        code: 'name-mismatch',
        message: `Name in the file is "${name}"; the roster has "${trainee.name}".`,
      });
    }

    previewRows.push({
      rowNumber: index + 1,
      employeeId,
      name,
      rosterName: trainee?.name ?? null,
      score: scoreText,
      cefr,
      errors,
      warnings,
      ok: errors.length === 0,
    });
  }

  if (previewRows.length === 0) {
    return { ...EMPTY_PREVIEW, sheetError: 'The file has no data rows.' };
  }

  const validRows = previewRows.filter((row) => row.ok).length;
  return {
    sheetError: null,
    rows: previewRows,
    validRows,
    errorRows: previewRows.length - validRows,
    // The lookup returns how many the group holds in total and which of the
    // sheet's numbers it contains, so the shortfall is the difference. `covered`
    // is a set, so a number listed twice is still one trainee.
    missingFromSheet: Math.max(0, group.groupSize - covered.size),
  };
}
