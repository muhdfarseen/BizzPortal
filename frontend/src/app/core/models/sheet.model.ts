/**
 * Reading a sheet: the parts that are the same whichever sheet it is.
 *
 * <p>Both bulk uploads work the same way. The user downloads a template from the
 * server, edits it in Excel, and sends it back; the portal recognises the file by
 * its extension, parses a CSV itself or hands an Excel file to a reader, and finds
 * each column by its name rather than its position so a reordered or renamed column
 * still lands. Only what the columns mean differs, and that lives with each upload.
 *
 * <p>Everything here is pure, so the parsing can be unit-tested without a DOM, a
 * file or an upload.
 */

/** Extensions read as CSV; `.txt` because Excel's "save as text" is common. */
export const CSV_EXTENSIONS = ['.csv', '.txt'] as const;

/** Extensions read by the Excel reader. `.xlsm` shares the format. */
export const EXCEL_EXTENSIONS = ['.xlsx', '.xlsm'] as const;

/** `value` for a file input's `accept` attribute. */
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

/** One column of a sheet, named for an error message and by the aliases it answers to. */
export interface SheetColumn<Name extends string> {
  column: Name;
  /** Label used when reporting the column missing, matching the template's header. */
  label: string;
  /** Accepted spellings, lower-cased and with separators flattened. */
  aliases: readonly string[];
}

/** Lower-cases a header and flattens its separators, so aliases can match. */
export function normalizeHeader(value: SheetCell): string {
  return String(value ?? '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * A cell as trimmed text; numbers keep their value and dates their ISO day.
 *
 * <p>A date is normalised to `yyyy-MM-dd` here rather than at each use, because the
 * two readers disagree: a CSV hands back whatever the user typed, while the Excel
 * reader hands back a `Date` for a cell Excel has formatted as one. A sheet dated by
 * someone who used Excel's date formatting should not be rejected for it.
 */
export function cellText(value: SheetCell): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

/** Whether a row holds nothing at all, and should be skipped rather than failed. */
export function isBlankRow(row: readonly SheetCell[]): boolean {
  return row.every((cell) => cellText(cell) === '');
}

/** Where a column sits in a header row, or `-1` when the row does not carry it. */
export function columnIndex<Name extends string>(
  headerRow: readonly SheetCell[],
  aliases: readonly string[],
): number {
  const found = headerRow.map(normalizeHeader);
  return found.findIndex((header) => header !== '' && aliases.includes(header));
}

/** Labels of the columns a header row is missing, in the order they were declared. */
export function missingColumns<Name extends string>(
  headerRow: readonly SheetCell[],
  columns: readonly SheetColumn<Name>[],
): string[] {
  return columns
    .filter(({ aliases }) => columnIndex(headerRow, aliases) === -1)
    .map(({ label }) => label);
}

/**
 * Parses CSV text (RFC 4180): quoted fields may hold commas, newlines and escaped
 * `""` quotes, and both CRLF and LF end a record. A leading BOM is dropped so the
 * first header still matches.
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
 * The distinct positive whole numbers a sheet names in one column, ready for a lookup.
 *
 * <p>Only numeric values are returned: the lookup takes numbers, so anything else
 * could not be resolved against the group anyway. A sheet whose header does not carry
 * the column names no numbers, because there is no column to find them in.
 */
export function sheetNumbers(
  rows: readonly (readonly SheetCell[])[],
  aliases: readonly string[],
): number[] {
  if (rows.length === 0) {
    return [];
  }
  const index = columnIndex(rows[0], aliases);
  if (index === -1) {
    return [];
  }

  const ids = new Set<number>();
  for (const [position, row] of rows.entries()) {
    if (position === 0 || isBlankRow(row)) {
      continue;
    }
    const value = Number(cellText(row[index]));
    if (Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  }
  return [...ids];
}

/** One problem found on one row. */
export interface SheetIssue<Code extends string> {
  code: Code;
  /** Sentence shown in the preview and written to the error CSV. */
  message: string;
}
