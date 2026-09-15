import {
  cellText,
  columnIndex,
  isBlankRow,
  missingColumns,
  parseCsv,
  sheetKind,
  toCsv,
} from './sheet.model';

/**
 * The reading half of a bulk upload, shared by the score sheet and the status
 * sheet. The cases worth pinning are the ones a spreadsheet actually produces:
 * a quoted name holding a comma, a field holding a line break, the BOM Excel
 * writes, and a date cell the Excel reader hands back as a `Date`.
 */

describe('parseCsv', () => {
  it('reads records separated by CRLF or LF', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps commas and newlines inside quoted fields', () => {
    expect(parseCsv('"a,1",b')).toEqual([['a,1', 'b']]);
    expect(parseCsv('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', 'b']]);
  });

  it('drops a leading BOM so the first header still matches', () => {
    expect(parseCsv('\uFEFFa,b')).toEqual([['a', 'b']]);
  });

  it('does not add a row for a trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
  });
});

describe('sheetKind', () => {
  it('recognises the CSV and Excel extensions in any case', () => {
    expect(sheetKind('scores.csv')).toBe('csv');
    expect(sheetKind('SCORES.CSV')).toBe('csv');
    expect(sheetKind('scores.xlsx')).toBe('excel');
    expect(sheetKind('scores.xlsm')).toBe('excel');
  });

  it('rejects anything else', () => {
    expect(sheetKind('scores.pdf')).toBeNull();
    expect(sheetKind('scores')).toBeNull();
  });
});

describe('toCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv([['a', 'b']])).toBe('a,b');
    expect(toCsv([['a,1', 'b']])).toBe('"a,1",b');
    expect(toCsv([['say "hi"', 'b']])).toBe('"say ""hi""",b');
  });
});

describe('cellText', () => {
  it('trims text and renders numbers as they are', () => {
    expect(cellText('  remedial ')).toBe('remedial');
    expect(cellText(51)).toBe('51');
  });

  it('treats an empty cell as empty text', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText('   ')).toBe('');
  });

  it('turns a date cell into the ISO day the server takes', () => {
    // The Excel reader hands back a Date for a cell Excel formatted as a date,
    // where a CSV would hand back the text the user typed.
    expect(cellText(new Date('2026-02-02T00:00:00.000Z'))).toBe('2026-02-02');
  });
});

describe('isBlankRow', () => {
  it('is true only when every cell is empty', () => {
    expect(isBlankRow(['', null, undefined, ' '])).toBe(true);
    expect(isBlankRow(['', 'remedial'])).toBe(false);
  });
});

describe('columnIndex', () => {
  const aliases = ['empid', 'emp id', 'employee id'];

  it('finds a column however its header was spelled', () => {
    expect(columnIndex(['Emp ID', 'Name'], aliases)).toBe(0);
    expect(columnIndex(['Name', 'Employee_ID'], aliases)).toBe(1);
    expect(columnIndex(['Name', 'Emp  Id'], aliases)).toBe(1);
  });

  it('reports a column the header does not carry', () => {
    expect(columnIndex(['Name', 'New Status'], aliases)).toBe(-1);
  });

  it('does not match an empty header, so a trailing comma is not a column', () => {
    expect(columnIndex(['', 'Name'], aliases)).toBe(-1);
  });
});

describe('missingColumns', () => {
  const columns = [
    { column: 'employeeId' as const, label: 'Emp ID', aliases: ['empid', 'emp id'] },
    { column: 'status' as const, label: 'New Status', aliases: ['new status'] },
  ];

  it('names the columns a header row does not carry', () => {
    expect(missingColumns(['Emp ID', 'Name'], columns)).toEqual(['New Status']);
    expect(missingColumns(['Name'], columns)).toEqual(['Emp ID', 'New Status']);
  });

  it('is empty when every column is present', () => {
    expect(missingColumns(['Emp ID', 'New Status'], columns)).toEqual([]);
  });
});
